import pytest
from fastapi.testclient import TestClient
from app.main import app
import app.middleware.security as _security

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    _security._ip_usage.clear()
    yield
    _security._ip_usage.clear()


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_parse_linkedin_rejects_non_pdf():
    response = client.post(
        "/api/parse-linkedin",
        files={"file": ("test.txt", b"not a pdf", "text/plain")},
    )
    assert response.status_code == 400


from unittest.mock import patch, MagicMock
from app.models import (
    Profile, Offer, Experience, Education, OfferRequirement,
    GapAnalysis, ChatMessage, ChatResponse, CVData, RewrittenExperience,
)


def _sample_profile():
    return Profile(
        name="Marie Dupont", title="Product Manager", summary="8 years PM",
        experiences=[Experience(title="PM", company="X", dates="2022-now", description="Led team", bullets=["Led team"])],
        education=[Education(degree="MSc", school="HEC", year="2018")],
        skills=["SQL"],
    )


def _sample_offer():
    return Offer(
        title="Senior PM", company="BigTech", description="Looking for PM",
        requirements=[OfferRequirement(text="5+ years", category="required")],
    )


@patch("app.routers.chat.get_llm")
def test_analyze_endpoint(mock_get_llm):
    mock_llm = MagicMock()
    mock_get_llm.return_value = mock_llm
    mock_llm.analyze.return_value = GapAnalysis(
        matched_skills=["SQL"], gaps=["AI"], questions=["Tell me about AI?"]
    )
    response = client.post("/api/analyze", json={
        "profile": _sample_profile().model_dump(),
        "offer": _sample_offer().model_dump(),
    })
    assert response.status_code == 200
    data = response.json()
    assert "matched_skills" in data
    assert "questions" in data


@patch("app.routers.chat.get_llm")
def test_chat_endpoint(mock_get_llm):
    mock_llm = MagicMock()
    mock_get_llm.return_value = mock_llm
    mock_llm.generate_next_question.return_value = ChatResponse(
        message="Tell me more about leadership", is_complete=False
    )
    response = client.post("/api/chat", json={
        "profile": _sample_profile().model_dump(),
        "offer": _sample_offer().model_dump(),
        "gap_analysis": {"matched_skills": ["SQL"], "gaps": ["AI"], "questions": ["AI?"]},
        "messages": [],
    })
    assert response.status_code == 200
    assert response.json()["message"] != ""


@patch("app.routers.generate.get_llm")
def test_generate_cv_endpoint(mock_get_llm):
    mock_llm = MagicMock()
    mock_get_llm.return_value = mock_llm
    mock_llm.generate_cv.return_value = CVData(
        name="Marie Dupont", title="Senior PM", summary="Expert PM",
        experiences=[RewrittenExperience(title="PM", company="X", dates="2022", bullets=["Led team"])],
        education=[Education(degree="MSc", school="HEC", year="2018")],
        skills=["SQL"],
    )
    response = client.post("/api/generate-cv", json={
        "profile": _sample_profile().model_dump(),
        "offer": _sample_offer().model_dump(),
        "gap_analysis": {"matched_skills": ["SQL"], "gaps": [], "questions": []},
        "messages": [{"role": "user", "content": "I led 12 engineers"}],
    })
    assert response.status_code == 200
    assert response.json()["name"] == "Marie Dupont"
