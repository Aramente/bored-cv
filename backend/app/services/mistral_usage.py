"""Mistral monthly usage tracker — fires ntfy alerts at 50/75/90% of budget,
and a separate alert when a 429 is observed (per-minute throttle or quota hit).

Mistral does not expose a public usage API, so we accumulate `response.usage.total_tokens`
locally on every successful call. Budget defaults to 1B tokens/month (community-reported
free "Experiment" tier cap) — override via `MISTRAL_MONTHLY_TOKEN_BUDGET` env var once
you've checked the real number at https://admin.mistral.ai/plateforme/limits.

Best-effort throughout: every public function swallows exceptions and logs.
A tracker failure must never break an LLM call.
"""

import logging
import os
from datetime import datetime, timezone

import httpx

from app.db import get_db

DEFAULT_MONTHLY_BUDGET = 1_000_000_000  # 1B tokens — Mistral free tier per community sources
THRESHOLDS = (50, 75, 90)
_THRESHOLD_BIT = {50: 1, 75: 2, 90: 4}


def _budget() -> int:
    raw = os.environ.get("MISTRAL_MONTHLY_TOKEN_BUDGET", "").strip()
    if not raw:
        return DEFAULT_MONTHLY_BUDGET
    try:
        return max(1, int(raw))
    except ValueError:
        return DEFAULT_MONTHLY_BUDGET


def _current_period() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _post_ntfy(title: str, body: str, priority: str = "high") -> None:
    """Post to ntfy.sh. Headers are ASCII-only — no em-dashes, ever (see Bored CV
    Session 16 incident: em-dash in HTTP header → silent UnicodeEncodeError)."""
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        logging.warning("ntfy: NTFY_TOPIC unset - skipping usage notification")
        return
    try:
        httpx.post(
            f"https://ntfy.sh/{topic}",
            content=body.encode("utf-8"),
            headers={"Title": title, "Priority": priority, "Tags": "warning"},
            timeout=5.0,
        )
    except Exception:
        logging.exception("ntfy: usage notification POST failed")


def _ensure_table() -> None:
    with get_db() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS mistral_usage ("
            "period TEXT PRIMARY KEY, "
            "tokens_used INTEGER DEFAULT 0, "
            "alerts_fired INTEGER DEFAULT 0)"
        )


def record_usage(total_tokens: int) -> None:
    """Increment this month's token counter and fire ntfy on first crossing of
    50/75/90% of the configured budget. Best-effort: never raises."""
    if not total_tokens or total_tokens < 0:
        return
    try:
        _ensure_table()
        period = _current_period()
        budget = _budget()

        with get_db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO mistral_usage (period) VALUES (?)",
                (period,),
            )
            conn.execute(
                "UPDATE mistral_usage SET tokens_used = tokens_used + ? WHERE period = ?",
                (total_tokens, period),
            )
            row = conn.execute(
                "SELECT tokens_used, alerts_fired FROM mistral_usage WHERE period = ?",
                (period,),
            ).fetchone()
            if not row:
                return

            tokens_used = int(row["tokens_used"])
            alerts_fired = int(row["alerts_fired"])
            pct = (tokens_used / budget) * 100.0

            for threshold in THRESHOLDS:
                bit = _THRESHOLD_BIT[threshold]
                if pct >= threshold and not (alerts_fired & bit):
                    new_alerts = alerts_fired | bit
                    conn.execute(
                        "UPDATE mistral_usage SET alerts_fired = ? WHERE period = ?",
                        (new_alerts, period),
                    )
                    _post_ntfy(
                        title=f"Bored CV Mistral usage at {threshold}%",
                        body=(
                            f"{tokens_used:,} / {budget:,} tokens "
                            f"({pct:.1f}%) used this month ({period})."
                        ),
                    )
                    alerts_fired = new_alerts
    except Exception:
        logging.exception("mistral_usage: record_usage failed")


def notify_quota_hit(detail: str) -> None:
    """Fire ntfy when Mistral returns 429 (per-minute throttle or monthly cap hit).
    On free tier this likely fires before any 50% threshold on a launch spike."""
    try:
        _post_ntfy(
            title="Bored CV Mistral 429 - throttled or quota hit",
            body=f"Mistral returned 429. Users may be blocked. Detail: {detail[:200]}",
            priority="urgent",
        )
    except Exception:
        logging.exception("mistral_usage: notify_quota_hit failed")
