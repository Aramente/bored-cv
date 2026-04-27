"""Tests for mistral_usage tracker.

Covers:
- Default budget when env var unset.
- Env var override.
- Threshold firing on first crossing of 50/75/90%.
- Idempotency: same threshold doesn't fire twice.
- 429 detection in LLMService._call surfaces a notify_quota_hit call.
"""

import os
import sqlite3
import tempfile
from unittest.mock import patch, MagicMock

import pytest

from app.services import mistral_usage
from app.services.llm import LLMService


@pytest.fixture(autouse=True)
def isolated_db(monkeypatch):
    """Each test gets a fresh SQLite file so usage rows don't leak across tests."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("DB_PATH", path)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    # Re-read DB_PATH inside the db module (it's read at module load).
    import importlib
    from app import db as db_module
    importlib.reload(db_module)
    yield path
    try:
        os.unlink(path)
    except OSError:
        pass


def test_budget_defaults_to_one_billion(monkeypatch):
    monkeypatch.delenv("MISTRAL_MONTHLY_TOKEN_BUDGET", raising=False)
    assert mistral_usage._budget() == 1_000_000_000


def test_budget_env_override(monkeypatch):
    monkeypatch.setenv("MISTRAL_MONTHLY_TOKEN_BUDGET", "500000000")
    assert mistral_usage._budget() == 500_000_000


def test_budget_invalid_env_falls_back(monkeypatch):
    monkeypatch.setenv("MISTRAL_MONTHLY_TOKEN_BUDGET", "not-a-number")
    assert mistral_usage._budget() == mistral_usage.DEFAULT_MONTHLY_BUDGET


def test_record_usage_zero_or_negative_is_noop(monkeypatch):
    fired = []
    monkeypatch.setattr(mistral_usage, "_post_ntfy", lambda *a, **kw: fired.append(a))
    mistral_usage.record_usage(0)
    mistral_usage.record_usage(-100)
    assert fired == []


def test_record_usage_below_threshold_no_alert(monkeypatch):
    monkeypatch.setenv("MISTRAL_MONTHLY_TOKEN_BUDGET", "1000")
    fired = []
    monkeypatch.setattr(mistral_usage, "_post_ntfy", lambda *a, **kw: fired.append(a))
    mistral_usage.record_usage(100)  # 10%
    assert fired == []


def test_record_usage_crosses_50_percent_fires_once(monkeypatch):
    monkeypatch.setenv("MISTRAL_MONTHLY_TOKEN_BUDGET", "1000")
    fired = []
    monkeypatch.setattr(mistral_usage, "_post_ntfy", lambda title, body, **kw: fired.append((title, body)))
    mistral_usage.record_usage(500)  # exactly 50%
    assert len(fired) == 1
    assert "50%" in fired[0][0]
    # Second call adds more usage but stays below 75% — no new alert
    mistral_usage.record_usage(100)  # 60%
    assert len(fired) == 1


def test_record_usage_crosses_all_thresholds(monkeypatch):
    monkeypatch.setenv("MISTRAL_MONTHLY_TOKEN_BUDGET", "1000")
    fired = []
    monkeypatch.setattr(mistral_usage, "_post_ntfy", lambda title, body, **kw: fired.append(title))
    mistral_usage.record_usage(900)  # 90% — should fire 50, 75, 90 in one shot
    assert len(fired) == 3
    assert any("50%" in t for t in fired)
    assert any("75%" in t for t in fired)
    assert any("90%" in t for t in fired)


def test_record_usage_idempotent_on_repeat_call(monkeypatch):
    monkeypatch.setenv("MISTRAL_MONTHLY_TOKEN_BUDGET", "1000")
    fired = []
    monkeypatch.setattr(mistral_usage, "_post_ntfy", lambda title, body, **kw: fired.append(title))
    mistral_usage.record_usage(800)  # crosses 50% and 75%
    n_after_first = len(fired)
    mistral_usage.record_usage(50)  # still under 90%, all already-fired bits set
    assert len(fired) == n_after_first


def test_notify_quota_hit_posts_ntfy(monkeypatch):
    fired = []
    monkeypatch.setattr(mistral_usage, "_post_ntfy", lambda title, body, **kw: fired.append((title, body)))
    mistral_usage.notify_quota_hit("rate limit exceeded")
    assert len(fired) == 1
    assert "429" in fired[0][0]
    assert "rate limit exceeded" in fired[0][1]


def test_post_ntfy_no_topic_skips(monkeypatch, caplog):
    monkeypatch.delenv("NTFY_TOPIC", raising=False)
    posted = []
    with patch("app.services.mistral_usage.httpx.post", side_effect=lambda *a, **kw: posted.append(a)):
        mistral_usage._post_ntfy("title", "body")
    assert posted == []


def test_post_ntfy_swallows_http_failure(monkeypatch):
    monkeypatch.setenv("NTFY_TOPIC", "test-topic")
    with patch("app.services.mistral_usage.httpx.post", side_effect=RuntimeError("network down")):
        # Must not raise
        mistral_usage._post_ntfy("title", "body")


def test_call_records_usage_on_success(monkeypatch):
    """LLMService._call should pass response.usage.total_tokens to record_usage."""
    captured = []
    monkeypatch.setattr("app.services.llm.record_usage", lambda n: captured.append(n))
    monkeypatch.setattr("app.services.llm.notify_quota_hit", lambda d: None)

    fake_response = MagicMock()
    fake_response.usage.total_tokens = 1234
    fake_response.choices = [MagicMock(message=MagicMock(content='{"ok": true}'))]

    svc = LLMService(api_key="test")
    svc._client = MagicMock()
    svc._client.chat.complete.return_value = fake_response

    svc._call("hello")
    assert captured == [1234]


def test_call_notifies_on_429(monkeypatch):
    """LLMService._call should fire notify_quota_hit when chat.complete raises 429."""
    notified = []
    monkeypatch.setattr("app.services.llm.notify_quota_hit", lambda d: notified.append(d))
    monkeypatch.setattr("app.services.llm.record_usage", lambda n: None)

    err = RuntimeError("HTTP 429: rate limited")
    err.status_code = 429

    svc = LLMService(api_key="test")
    svc._client = MagicMock()
    svc._client.chat.complete.side_effect = err

    with pytest.raises(RuntimeError):
        svc._call("hello")

    assert len(notified) == 1
    assert "429" in notified[0]


def test_call_does_not_notify_on_non_429_error(monkeypatch):
    """A 500 or generic error must NOT fire the 429 notification."""
    notified = []
    monkeypatch.setattr("app.services.llm.notify_quota_hit", lambda d: notified.append(d))
    monkeypatch.setattr("app.services.llm.record_usage", lambda n: None)

    err = RuntimeError("HTTP 500: server error")

    svc = LLMService(api_key="test")
    svc._client = MagicMock()
    svc._client.chat.complete.side_effect = err

    with pytest.raises(RuntimeError):
        svc._call("hello")

    assert notified == []
