import json
import os

import google.generativeai as genai

from app.models import (
    CVData, ChatMessage, ChatResponse, Education, GapAnalysis,
    Offer, Profile, RewrittenExperience,
)

MAX_TOKENS_PER_CALL = 5000


class LLMService:
    def __init__(self, api_key: str | None = None):
        self._api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        self._model = None

    @property
    def model(self):
        if self._model is None:
            genai.configure(api_key=self._api_key)
            self._model = genai.GenerativeModel("gemini-2.0-flash")
        return self._model

    def analyze(self, profile: Profile, offer: Offer) -> GapAnalysis:
        prompt = f"""You are a career advisor. Analyze this candidate's profile against the job offer.

CANDIDATE PROFILE:
Name: {profile.name}
Title: {profile.title}
Summary: {profile.summary}
Skills: {", ".join(profile.skills)}
Experience:
{self._format_experiences(profile)}

JOB OFFER:
Title: {offer.title}
Company: {offer.company}
Description: {offer.description}
Requirements: {self._format_requirements(offer)}

Respond in valid JSON only:
{{"matched_skills": ["skills from candidate that match the offer"], "gaps": ["requirements the candidate doesn't clearly demonstrate"], "questions": ["specific questions to ask the candidate to uncover hidden relevant experience, max 7 questions, written as direct questions to the candidate"]}}

Make questions specific and tied to actual gaps. Reference both the candidate's existing experience and the offer requirement. Write questions in the same language as the job offer."""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=MAX_TOKENS_PER_CALL, temperature=0.3),
        )
        data = self._parse_json(response.text)
        return GapAnalysis(**data)

    def generate_next_question(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage]) -> ChatResponse:
        conversation = "\n".join(f"{m.role}: {m.content}" for m in messages)

        prompt = f"""You are a friendly career advisor helping personalize a CV. You've already asked some questions.

GAPS TO EXPLORE: {", ".join(gap_analysis.gaps)}
QUESTIONS PLANNED: {json.dumps(gap_analysis.questions)}

CONVERSATION SO FAR:
{conversation}

Based on the conversation, either:
1. Ask the NEXT most relevant question (if there are still important gaps to explore)
2. Signal that you have enough information

Respond in valid JSON only:
{{"message": "your next question OR a summary like 'I have all I need to generate your CV!'", "is_complete": false or true}}

Be conversational and warm. Reference what the user just said. Write in the same language as the conversation. Keep questions focused — one topic per question."""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=1000, temperature=0.7),
        )
        data = self._parse_json(response.text)
        return ChatResponse(**data)

    def generate_cv(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage]) -> CVData:
        conversation = "\n".join(f"{m.role}: {m.content}" for m in messages)

        prompt = f"""You are an expert CV writer. Rewrite this candidate's CV to perfectly match the job offer, using insights from the conversation.

CANDIDATE PROFILE:
Name: {profile.name}
Title: {profile.title}
Email: {profile.email}
Location: {profile.location}
Summary: {profile.summary}
Experience:
{self._format_experiences(profile)}
Education:
{self._format_education(profile)}
Skills: {", ".join(profile.skills)}

JOB OFFER:
Title: {offer.title} at {offer.company}
Requirements: {self._format_requirements(offer)}

CONVERSATION INSIGHTS:
{conversation}

MATCHED SKILLS: {", ".join(gap_analysis.matched_skills)}

INSTRUCTIONS:
- Rewrite the professional summary to directly address what the offer is looking for
- Rewrite each experience's bullet points to emphasize skills relevant to the offer
- Use specific numbers and achievements from the conversation
- Reorder skills to put the most offer-relevant ones first
- Keep it truthful — enhance presentation, don't fabricate
- Detect the job offer language and write the CV in that language
- Max 4-5 bullet points per experience
- Make bullets achievement-oriented: "Verb + what + impact"

Respond in valid JSON only:
{{"name": "{profile.name}", "title": "rewritten professional title matching the offer", "email": "{profile.email}", "location": "{profile.location}", "summary": "2-3 sentence professional summary tailored to the offer", "experiences": [{{"title": "job title", "company": "company name", "dates": "dates", "bullets": ["achievement-oriented bullet 1", "bullet 2"]}}], "education": [{{"degree": "...", "school": "...", "year": "..."}}], "skills": ["most relevant skill first", "..."], "language": "en or fr (detected from job offer)"}}"""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=MAX_TOKENS_PER_CALL, temperature=0.4),
        )
        data = self._parse_json(response.text)
        return CVData(**data)

    def _format_experiences(self, profile: Profile) -> str:
        parts = []
        for exp in profile.experiences:
            bullets = "\n".join(f"  - {b}" for b in exp.bullets) if exp.bullets else f"  {exp.description}"
            parts.append(f"- {exp.title} at {exp.company} ({exp.dates})\n{bullets}")
        return "\n".join(parts)

    def _format_education(self, profile: Profile) -> str:
        return "\n".join(f"- {e.degree}, {e.school} ({e.year})" for e in profile.education)

    def _format_requirements(self, offer: Offer) -> str:
        reqs = "\n".join(f"- [Required] {r.text}" for r in offer.requirements)
        nice = "\n".join(f"- [Nice to have] {r.text}" for r in offer.nice_to_have)
        return f"{reqs}\n{nice}"

    def _parse_json(self, text: str) -> dict:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            cleaned = cleaned.rsplit("```", 1)[0]
        return json.loads(cleaned)
