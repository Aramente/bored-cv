import json
import pytest
from unittest.mock import patch, MagicMock
from app.services.llm import LLMService
from app.models import Profile, Offer, Experience, Education, OfferRequirement, GapAnalysis, ChatMessage


@pytest.fixture
def sample_profile():
    return Profile(
        name="Marie Dupont",
        title="Product Manager",
        location="Paris",
        summary="8 years in SaaS product management",
        experiences=[
            Experience(
                title="Senior PM", company="TechCorp", dates="2022 - Present",
                description="Led B2B platform product strategy",
                bullets=["Led B2B platform product strategy", "Grew ARR by 45%"],
            )
        ],
        education=[Education(degree="MSc Management", school="HEC Paris", year="2018")],
        skills=["Product Strategy", "SQL", "Figma"],
    )


@pytest.fixture
def sample_offer():
    return Offer(
        title="Senior Product Manager", company="BigTech",
        description="Looking for a Senior PM to lead AI products",
        requirements=[
            OfferRequirement(text="5+ years PM experience", category="required"),
            OfferRequirement(text="AI/ML product experience", category="required"),
        ],
        nice_to_have=[OfferRequirement(text="MBA", category="nice_to_have")],
    )


@pytest.fixture
def llm_service():
    return LLMService(api_key="test-key")


def _mock_gemini_response(text: str):
    mock_response = MagicMock()
    mock_response.text = text
    return mock_response


@patch("app.services.llm.genai")
def test_analyze_returns_gap_analysis(mock_genai, llm_service, sample_profile, sample_offer):
    mock_model = MagicMock()
    mock_genai.GenerativeModel.return_value = mock_model
    mock_model.generate_content.return_value = _mock_gemini_response(
        json.dumps({
            "matched_skills": ["Product Strategy"],
            "gaps": ["AI/ML experience"],
            "questions": ["Can you describe any experience with AI/ML products?"],
        })
    )
    result = llm_service.analyze(sample_profile, sample_offer)
    assert len(result.matched_skills) > 0
    assert len(result.questions) > 0
    mock_model.generate_content.assert_called_once()


@patch("app.services.llm.genai")
def test_generate_question_returns_string(mock_genai, llm_service, sample_profile, sample_offer):
    mock_model = MagicMock()
    mock_genai.GenerativeModel.return_value = mock_model
    gap = GapAnalysis(matched_skills=["Product Strategy"], gaps=["AI/ML experience"], questions=["Tell me about AI experience"])
    messages = [ChatMessage(role="assistant", content="Tell me about AI experience")]
    mock_model.generate_content.return_value = _mock_gemini_response(
        json.dumps({"message": "Can you elaborate on your data analysis work?", "is_complete": False})
    )
    result = llm_service.generate_next_question(sample_profile, sample_offer, gap, messages)
    assert result.message != ""


@patch("app.services.llm.genai")
def test_generate_cv_returns_cv_data(mock_genai, llm_service, sample_profile, sample_offer):
    mock_model = MagicMock()
    mock_genai.GenerativeModel.return_value = mock_model
    gap = GapAnalysis(matched_skills=["Product Strategy"], gaps=[], questions=[])
    messages = [
        ChatMessage(role="assistant", content="Tell me about leadership"),
        ChatMessage(role="user", content="I led a team of 12 engineers"),
    ]
    mock_model.generate_content.return_value = _mock_gemini_response(
        json.dumps({
            "name": "Marie Dupont", "title": "Senior Product Manager",
            "email": "", "location": "Paris",
            "summary": "Results-driven PM with 8 years in SaaS, specialized in AI product strategy.",
            "experiences": [{"title": "Senior PM", "company": "TechCorp", "dates": "2022 - Present",
                "bullets": ["Led a team of 12 engineers to ship AI-powered B2B platform"]}],
            "education": [{"degree": "MSc Management", "school": "HEC Paris", "year": "2018"}],
            "skills": ["AI Product Strategy", "Team Leadership", "SQL", "Figma"],
            "language": "en",
        })
    )
    result = llm_service.generate_cv(sample_profile, sample_offer, gap, messages)
    assert result.name == "Marie Dupont"
    assert len(result.experiences) > 0
    assert len(result.experiences[0].bullets) > 0
