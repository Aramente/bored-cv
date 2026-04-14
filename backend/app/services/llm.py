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
            self._model = genai.GenerativeModel("gemini-2.5-flash")
        return self._model

    def analyze(self, profile: Profile, offer: Offer, ui_language: str = "en") -> GapAnalysis:
        lang_instruction = "French" if ui_language == "fr" else "English"
        prompt = f"""You are a senior career coach at a top tech recruitment firm. You help candidates tailor their CV to specific job offers.

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

YOUR TASK:
1. Pick the 2-3 experiences from the candidate's profile that are MOST relevant to this job offer
2. For each, figure out what's missing: metrics, team size, concrete results, tools
3. Write SHORT, FOCUSED questions — one specific thing per question

RULES FOR QUESTIONS:
- The FIRST question should say something like: "I see your roles at [Company A] and [Company B] are the most relevant here. Let's start with [Company A] — [specific question]."
  This tells the candidate what to focus on AND asks a specific question in the same breath. No broad "tell me about your experiences".
- Every question after that: ONE company, ONE topic.
- BAD: "Tell me about your leadership experience, how you managed teams, and what results you achieved"
- GOOD: "At Mindflow, you were Head of People — how many people did you hire during your time there?"
- GOOD: "At Germinal, what was your biggest win in terms of process or culture you built?"
- Think about what a startup/tech interviewer would ask: ownership, scrappiness, measurable impact, cross-functional work, dealing with ambiguity
- Max 6 questions total, ordered from most to least important

Respond in valid JSON only:
{{"matched_skills": ["skills from candidate that match the offer"], "gaps": ["requirements the candidate doesn't clearly demonstrate"], "questions": ["first question that names relevant companies AND asks something specific", "follow-up question about company A", "question about company B", "..."]}}

IMPORTANT: Write ALL output in {lang_instruction}. Be direct, warm, slightly casual — like a smart friend helping with a CV, not a corporate HR bot."""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=MAX_TOKENS_PER_CALL, temperature=0.3),
        )
        data = self._parse_json(response.text)
        return GapAnalysis(**data)

    def generate_next_question(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage], ui_language: str = "en") -> ChatResponse:
        conversation = "\n".join(f"{m.role}: {m.content}" for m in messages)
        lang_instruction = "French" if ui_language == "fr" else "English"

        prompt = f"""You are a senior career coach helping someone build a killer CV for a specific job. You act like a great interview prep partner.

CANDIDATE: {profile.name} — {profile.title}
TARGET ROLE: {offer.title} at {offer.company}
GAPS: {", ".join(gap_analysis.gaps)}
PLANNED QUESTIONS: {json.dumps(gap_analysis.questions)}

CONVERSATION SO FAR:
{conversation}

YOUR COACHING RULES:

1. ONE QUESTION AT A TIME. Never ask a multi-part question. Never list multiple things to answer.
   BAD: "Tell me about your leadership, teamwork, and technical contributions"
   GOOD: "At TechCorp, you led the B2B platform — how many engineers were on your team?"

2. ALWAYS REFERENCE THE COMPANY NAME. When asking about an experience, name the company.
   BAD: "Tell me about a time you led a project"
   GOOD: "At StartupABC, you shipped the mobile app — what was the biggest technical challenge?"

3. PUSH FOR METRICS. If the user gives a vague answer, ask for numbers.
   User: "I improved the onboarding flow"
   You: "Nice! By how much did conversion improve? Even a rough estimate works — 10%? 30%?"

4. REFRAME AND SUGGEST. When you have enough info, suggest how to phrase it for the CV.
   "Perfect — on your CV we could write: 'Led a team of 8 engineers at TechCorp to ship v2.0, increasing retention by 34%'. Does that sound right?"

5. SKIP IRRELEVANT EXPERIENCES. Don't ask about roles that don't relate to the target job.

6. ANTICIPATE INTERVIEW QUESTIONS. Frame your questions around what startup/tech interviewers ask:
   - "Tell me about a time you dealt with ambiguity"
   - "How did you prioritize with limited resources?"
   - "Give me an example of cross-functional leadership"
   - "What's your biggest measurable impact?"
   The CV bullets you help write should already answer these.

7. KEEP IT SHORT. Your messages should be 1-3 sentences max. No lengthy preambles.

DECISION:
- If the user's last answer was vague → ask them to be more specific (with a concrete suggestion)
- If you have enough for this experience → move to the next relevant experience
- If all relevant experiences are covered with concrete metrics → set is_complete to true

Respond in valid JSON only:
{{"message": "your short, focused question or reframing suggestion", "is_complete": false or true}}

Write in {lang_instruction}. Be warm but direct — like a coach, not a chatbot."""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=1000, temperature=0.7),
        )
        data = self._parse_json(response.text)
        return ChatResponse(**data)

    def generate_cv(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage], ui_language: str = "en") -> CVData:
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
