"""Tests for the agent-brief layer that drives the recruiter+agent chat.

The brief replaces theme-ranking as the chat's organizing principle (see
`docs/plans/2026-05-03-bored-cv-chat-recruiter-rework.md` and the
ultraplan thinking note in the obsidian vault). These tests cover:

  - agent_brief() returns a populated AgentBrief on a typical (CV, offer)
  - agent_brief() filters ungrounded unspoken-evidence hypotheses
  - classify_answer() routes to the four verdicts deterministically
  - generate_next_question(brief=...) advances slots and pushes back
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.models import (
    AgentBrief,
    AnswerVerdict,
    BriefQuestion,
    ChatMessage,
    Education,
    Experience,
    GapAnalysis,
    Offer,
    OfferRequirement,
    Profile,
    StrongestExistingMatch,
    UndersellingItem,
    UnspokenEvidence,
    WeakestClaim,
)
from app.services.llm import LLMService, _hypothesis_grounded


@pytest.fixture
def cv():
    return Profile(
        name="Marie Dupont",
        title="Senior Product Manager",
        location="Paris",
        summary="8 years SaaS product, last 3 at scale-up",
        experiences=[
            Experience(
                title="Senior PM", company="Mindflow", dates="2022 - Present",
                description="Led B2B platform — multi-country payroll integrations",
                bullets=["Helped with growth strategy", "Shipped onboarding flow used by 12k merchants"],
            ),
            Experience(
                title="PM", company="Germinal", dates="2019 - 2022",
                description="Series B SaaS — employer branding + content",
                bullets=["Owned Germinal blog, doubled monthly visitors"],
            ),
            Experience(
                title="Junior Dev", company="StartupX", dates="2016 - 2018",
                description="Frontend dev",
                bullets=["Wrote React components"],
            ),
        ],
        education=[Education(degree="MSc Management", school="HEC", year="2016")],
        skills=["Product Strategy", "SQL", "Figma"],
    )


@pytest.fixture
def offer():
    return Offer(
        title="Senior PM, Merchant Onboarding",
        company="BigTech",
        description="Lead our merchant onboarding product. Need someone who's shipped onboarding at scale, ideally with payments background. Series C company, growth stage.",
        requirements=[
            OfferRequirement(text="5+ years PM experience"),
            OfferRequirement(text="Onboarding / activation product experience"),
            OfferRequirement(text="Payments domain knowledge"),
        ],
    )


@pytest.fixture
def gap():
    return GapAnalysis(
        matched_skills=["Product Strategy"],
        gaps=["payments domain", "onboarding at scale"],
        questions=["Tell me about your onboarding experience"],
    )


def _mock_mistral(text: str):
    resp = MagicMock()
    resp.choices = [MagicMock()]
    resp.choices[0].message.content = text
    resp.usage = MagicMock(total_tokens=500)
    return resp


# --- agent_brief --------------------------------------------------------------


@patch("app.services.llm.Mistral")
def test_agent_brief_returns_populated_brief(mock_mistral_cls, cv, offer, gap):
    """A well-formed Mistral response yields a fully populated AgentBrief."""
    payload = {
        "thePitch": "Senior SaaS PM who's already shipped onboarding at scale-up.",
        "theBet": "Pitch the Mindflow merchant onboarding flow as the proof.",
        "marketRead": "Series C growth needs someone who's done 0→1 at smaller scale, not optimized.",
        "hiringManagerFear": "PM has no explicit payments experience — that's the risk.",
        "strongestExistingMatch": {
            "experienceIndex": 0,
            "why": "Mindflow onboarding flow is a direct analog",
            "currentlyUndersoldAs": "Shipped onboarding flow used by 12k merchants",
            "shouldBePitchedAs": "Owned merchant onboarding for Mindflow's B2B platform — 12k merchants activated",
        },
        "underselling": [
            {
                "location": "experiences[0].bullets[0]",
                "currentText": "Helped with growth strategy",
                "whyUndersold": "Helper-voice for owner-work.",
                "agentRewriteSeed": "Owned growth strategy at Mindflow.",
            }
        ],
        "weakestClaim": {
            "location": "experiences[1].bullets[0]",
            "text": "Owned Germinal blog, doubled monthly visitors",
            "whyWeak": "no baseline number",
            "needs": "metric",
        },
        "unspokenEvidenceToProbe": [
            {
                "experienceIndex": 0,
                "hypothesis": "Mindflow merchant onboarding likely touched payment activation",
                "questionSeed": "At Mindflow, did your onboarding touch payment activation directly?",
            }
        ],
        "irrelevantExperiences": [2],
        "clichesToKillInAnswers": ["led the team", "drove growth", "helped with"],
        "the3Questions": [
            {"angle": "deepen the bet", "question": "About the Mindflow onboarding — what did you actually own end-to-end?"},
            {"angle": "address the fear", "question": "The offer asks for payments experience. How did Mindflow onboarding intersect with payments?"},
            {"angle": "surface unspoken evidence", "question": "Did anything you shipped at Mindflow touch payment activation specifically?"},
        ],
    }
    client = MagicMock()
    client.chat.complete.return_value = _mock_mistral(json.dumps(payload))
    mock_mistral_cls.return_value = client

    llm = LLMService(api_key="test")
    llm._client = client
    brief = llm.agent_brief(cv, offer, gap)

    assert isinstance(brief, AgentBrief)
    assert brief.thePitch.startswith("Senior SaaS PM")
    assert "merchant onboarding" in brief.theBet
    assert brief.hiringManagerFear
    assert len(brief.the3Questions) == 3
    assert brief.the3Questions[0].angle == "deepen the bet"
    assert brief.strongestExistingMatch.experienceIndex == 0
    assert brief.weakestClaim.needs == "metric"
    assert len(brief.unspokenEvidenceToProbe) == 1
    assert brief.unspokenEvidenceToProbe[0].hypothesis.startswith("Mindflow")
    assert "led the team" in brief.clichesToKillInAnswers


@patch("app.services.llm.Mistral")
def test_agent_brief_filters_ungrounded_unspoken_evidence(mock_mistral_cls, cv, offer, gap):
    """Hypotheses whose content words appear nowhere in CV or offer get dropped."""
    payload = {
        "thePitch": "...", "theBet": "...", "marketRead": "...", "hiringManagerFear": "...",
        "strongestExistingMatch": {"experienceIndex": 0, "why": "", "currentlyUndersoldAs": "", "shouldBePitchedAs": ""},
        "underselling": [],
        "weakestClaim": {"location": "", "text": "", "whyWeak": "", "needs": ""},
        "unspokenEvidenceToProbe": [
            # Grounded — "merchant" appears in CV bullet + offer
            {"experienceIndex": 0, "hypothesis": "Mindflow merchant onboarding touched payment", "questionSeed": "Q"},
            # Ungrounded — "blockchain", "cryptocurrency" appear nowhere
            {"experienceIndex": 0, "hypothesis": "blockchain cryptocurrency tokenization expertise", "questionSeed": "Q"},
        ],
        "irrelevantExperiences": [],
        "clichesToKillInAnswers": [],
        "the3Questions": [
            {"angle": "deepen the bet", "question": "Q1"},
            {"angle": "address the fear", "question": "Q2"},
            {"angle": "surface unspoken evidence", "question": "Q3"},
        ],
    }
    client = MagicMock()
    client.chat.complete.return_value = _mock_mistral(json.dumps(payload))
    mock_mistral_cls.return_value = client
    llm = LLMService(api_key="test")
    llm._client = client

    brief = llm.agent_brief(cv, offer, gap)
    assert len(brief.unspokenEvidenceToProbe) == 1
    assert "merchant" in brief.unspokenEvidenceToProbe[0].hypothesis.lower()


def test_hypothesis_grounded_helper():
    cv_text = "Mindflow merchant onboarding shipped at scale"
    offer_text = "Looking for payments experience"
    # Grounded — "merchant" in CV
    assert _hypothesis_grounded("merchant onboarding lead", cv_text, offer_text)
    # Grounded — "payment" (substring of "payments") in offer
    assert _hypothesis_grounded("payment activation", cv_text, offer_text)
    # Ungrounded — none of the content words appear
    assert not _hypothesis_grounded("blockchain tokenization yields", cv_text, offer_text)
    # All-stopwords → conservatively kept
    assert _hypothesis_grounded("they really matter team", cv_text, offer_text)


# --- classify_answer ---------------------------------------------------------


@pytest.mark.parametrize("verdict_label,answer_text", [
    ("specific", "I shipped 4 onboarding iterations, took activation from 18% to 31% in 4 months."),
    ("generic", "I led the team and drove growth."),
    ("underselling", "I helped with the growth strategy when needed."),
    ("evasive", "It was a great experience overall."),
])
@patch("app.services.llm.Mistral")
def test_classify_answer_routes_each_verdict(mock_mistral_cls, verdict_label, answer_text):
    client = MagicMock()
    client.chat.complete.return_value = _mock_mistral(
        json.dumps({"verdict": verdict_label, "reason": f"({verdict_label})"})
    )
    mock_mistral_cls.return_value = client
    llm = LLMService(api_key="test")
    llm._client = client

    v = llm.classify_answer("What did you ship?", answer_text)
    assert isinstance(v, AnswerVerdict)
    assert v.verdict == verdict_label


@patch("app.services.llm.Mistral")
def test_classify_answer_falls_back_on_invalid_verdict(mock_mistral_cls):
    client = MagicMock()
    client.chat.complete.return_value = _mock_mistral(
        json.dumps({"verdict": "garbage", "reason": "x"})
    )
    mock_mistral_cls.return_value = client
    llm = LLMService(api_key="test")
    llm._client = client

    v = llm.classify_answer("Q", "A")
    # Invalid verdicts get coerced to "specific" so the chat doesn't grill on noise.
    assert v.verdict == "specific"


# --- brief-driven generate_next_question -------------------------------------


def _brief(qs):
    return AgentBrief(
        thePitch="Pitch",
        theBet="Bet",
        marketRead="Market",
        hiringManagerFear="Fear",
        strongestExistingMatch=StrongestExistingMatch(experienceIndex=0, why="x", currentlyUndersoldAs="x", shouldBePitchedAs="x"),
        underselling=[],
        weakestClaim=WeakestClaim(location="", text="", whyWeak="", needs=""),
        unspokenEvidenceToProbe=[],
        irrelevantExperiences=[],
        clichesToKillInAnswers=["led the team"],
        the3Questions=[BriefQuestion(angle=a, question=q) for a, q in qs],
    )


@patch("app.services.llm.Mistral")
def test_brief_driven_first_call_sends_q1(mock_mistral_cls, cv, offer, gap):
    """No prior messages → returns brief.the3Questions[0]."""
    client = MagicMock()
    client.chat.complete.return_value = _mock_mistral(
        json.dumps({"message": "About the Mindflow onboarding — what did you actually own?", "is_complete": False, "cv_actions": [], "progress": 33})
    )
    mock_mistral_cls.return_value = client
    llm = LLMService(api_key="test")
    llm._client = client

    brief = _brief([
        ("deepen the bet", "About the Mindflow onboarding — what did you actually own?"),
        ("address the fear", "Payments experience? How did Mindflow intersect?"),
        ("surface unspoken evidence", "Did Mindflow onboarding touch payment activation?"),
    ])
    out = llm.generate_next_question(cv, offer, gap, [], agent_brief=brief)
    # The deterministic slot logic produces exactly one LLM call (no classify
    # since there's no user answer yet).
    assert out.message
    assert not out.is_complete
    assert client.chat.complete.call_count == 1


@patch("app.services.llm.Mistral")
def test_brief_driven_pushback_on_generic(mock_mistral_cls, cv, offer, gap):
    """User reply to fresh Q1 is generic → backend pushes back, stays on slot 0."""
    client = MagicMock()
    # First call: classify_answer → "generic"
    # Second call: pushback prompt → returns pushback message
    client.chat.complete.side_effect = [
        _mock_mistral(json.dumps({"verdict": "generic", "reason": "every PM says this"})),
        _mock_mistral(json.dumps({"message": "that's a line every PM has on their CV. what did *you* do?", "is_complete": False, "cv_actions": [], "progress": 16})),
    ]
    mock_mistral_cls.return_value = client
    llm = LLMService(api_key="test")
    llm._client = client

    brief = _brief([
        ("deepen the bet", "About the Mindflow onboarding — what did you actually own?"),
        ("address the fear", "Payments experience? How did Mindflow intersect?"),
        ("surface unspoken evidence", "Did Mindflow onboarding touch payment activation?"),
    ])
    msgs = [
        ChatMessage(role="assistant", content="About the Mindflow onboarding — what did you actually own?"),
        ChatMessage(role="user", content="I led the team and drove growth."),
    ]
    out = llm.generate_next_question(cv, offer, gap, msgs, agent_brief=brief)
    assert out.message
    assert "PM" in out.message or "do" in out.message.lower()
    assert not out.is_complete
    # Two calls: classify + pushback generation
    assert client.chat.complete.call_count == 2


@patch("app.services.llm.Mistral")
def test_brief_driven_advances_after_pushback(mock_mistral_cls, cv, offer, gap):
    """User reply to pushback advances unconditionally — no second pushback."""
    client = MagicMock()
    # Only one call expected: ask_fresh for Q2 (no classify because last
    # assistant was a pushback, not a fresh Q).
    client.chat.complete.return_value = _mock_mistral(
        json.dumps({"message": "Payments experience? How did Mindflow intersect?", "is_complete": False, "cv_actions": [], "progress": 66})
    )
    mock_mistral_cls.return_value = client
    llm = LLMService(api_key="test")
    llm._client = client

    brief = _brief([
        ("deepen the bet", "About the Mindflow onboarding — what did you actually own?"),
        ("address the fear", "Payments experience? How did Mindflow intersect?"),
        ("surface unspoken evidence", "Did Mindflow onboarding touch payment activation?"),
    ])
    msgs = [
        ChatMessage(role="assistant", content="About the Mindflow onboarding — what did you actually own?"),
        ChatMessage(role="user", content="I led the team."),
        ChatMessage(role="assistant", content="that's a line every PM has on their CV. what did *you* do?"),
        ChatMessage(role="user", content="ok fine — owned the entire flow, hit 31% activation in 4 months."),
    ]
    out = llm.generate_next_question(cv, offer, gap, msgs, agent_brief=brief)
    assert out.message
    assert not out.is_complete
    # ONE call only — no classify since last assistant was a pushback.
    assert client.chat.complete.call_count == 1


@patch("app.services.llm.Mistral")
def test_brief_driven_completes_after_q3_answer(mock_mistral_cls, cv, offer, gap):
    """All 3 brief questions answered specifically → narrative wrap, complete."""
    client = MagicMock()
    # classify answer to Q3 → specific (so we don't push back)
    # then narrative wrap call
    client.chat.complete.side_effect = [
        _mock_mistral(json.dumps({"verdict": "specific", "reason": "concrete"})),
        _mock_mistral(json.dumps({"message": "So the pitch: scale-up PM with a real onboarding bet.", "is_complete": True, "cv_actions": [], "progress": 100})),
    ]
    mock_mistral_cls.return_value = client
    llm = LLMService(api_key="test")
    llm._client = client

    brief = _brief([
        ("deepen the bet", "Q1: About the Mindflow onboarding — what did you actually own?"),
        ("address the fear", "Q2: Payments experience? How did Mindflow intersect?"),
        ("surface unspoken evidence", "Q3: Did Mindflow onboarding touch payment activation?"),
    ])
    msgs = [
        ChatMessage(role="assistant", content="Q1: About the Mindflow onboarding — what did you actually own?"),
        ChatMessage(role="user", content="Owned the entire flow."),
        ChatMessage(role="assistant", content="Q2: Payments experience? How did Mindflow intersect?"),
        ChatMessage(role="user", content="Stripe Connect integration in Q3 2023."),
        ChatMessage(role="assistant", content="Q3: Did Mindflow onboarding touch payment activation?"),
        ChatMessage(role="user", content="Yes — activation lift was 18%→31%."),
    ]
    out = llm.generate_next_question(cv, offer, gap, msgs, agent_brief=brief)
    assert out.is_complete is True
    assert out.progress == 100


@patch("app.services.llm.Mistral")
def test_brief_driven_falls_through_to_legacy_when_brief_empty(mock_mistral_cls, cv, offer, gap):
    """Empty brief → legacy theme-ranking path runs (single LLM call)."""
    client = MagicMock()
    client.chat.complete.return_value = _mock_mistral(
        json.dumps({"message": "legacy q", "is_complete": False, "cv_actions": [], "progress": 0})
    )
    mock_mistral_cls.return_value = client
    llm = LLMService(api_key="test")
    llm._client = client

    out = llm.generate_next_question(cv, offer, gap, [], agent_brief=AgentBrief())
    assert out.message == "legacy q"
