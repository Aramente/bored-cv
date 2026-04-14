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
1. Read the job offer and pick the 3-4 MOST DIFFERENTIATING requirements — the ones that will make or break a candidacy. Ignore generic filler ("team player", "good communication"). Focus on what makes THIS role specific.
2. For each differentiating requirement, find which experience from the profile is closest — and figure out what specific detail is missing to make it a perfect match.
3. Write 4-5 SHORT questions that extract ONLY the missing details needed to transform the profile into a perfect fit for those key requirements.

STRATEGY — DON'T BE EXHAUSTIVE:
- A job offer has 20+ requirements. You are NOT trying to cover them all.
- Pick the 3-4 that matter most: the ones in the first paragraph, the ones repeated multiple times, the "must have" vs "nice to have".
- For the other requirements, the CV rewriter will handle the framing — you don't need extra info from the user.
- Your questions should make the user feel like you GET the job, not like you're reading a checklist.

RULES FOR QUESTIONS:
- Use ACTUAL company names from the profile. NEVER placeholders like [Company A]. Use: Mindflow, Germinal, Sloow, etc.
- The FIRST question: name which experiences are relevant, explain briefly WHY (connecting to the offer), and ask ONE specific thing.
  Example: "Pour ce poste HR Ops chez Ami, tes rôles chez Mindflow et Germinal sont pile-poil. Commençons par Mindflow — t'as mis en place quels process RH en partant de zéro ?"
- Each follow-up: ONE company, ONE requirement from the offer, ONE specific detail to extract.
- GOOD: "L'offre insiste sur le payroll multi-pays — chez Germinal, tu gérais combien de pays ?"
- GOOD: "Ami cherche quelqu'un qui a fait de la people analytics — t'avais des KPIs RH que tu suivais chez Mindflow ? Lesquels ?"
- BAD: broad questions that don't reference the offer
- Max 5 questions total

Respond in valid JSON only:
{{"matched_skills": ["skills that match"], "gaps": ["the 3-4 differentiating requirements where the profile needs enrichment"], "questions": ["first question naming companies + why they're relevant + specific ask", "question tied to offer requirement X", "question tied to offer requirement Y", "..."]}}

IMPORTANT: Write ALL output in {lang_instruction}. Use REAL company names, NEVER placeholders. Tone: smart friend who read the offer carefully, not a generic career bot."""

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

CONTEXT: The gaps listed above are the 3-4 MOST DIFFERENTIATING requirements from the offer — the ones that matter most. You are NOT trying to cover every requirement in the job offer. Just these key gaps.

YOUR COACHING RULES:

1. ONE QUESTION AT A TIME. 1-3 sentences max. No multi-part questions.
   BAD: "Tell me about your leadership, teamwork, and technical contributions"
   GOOD: "Chez Mindflow, tu gérais le payroll sur combien de pays ?"

2. ALWAYS NAME THE COMPANY AND TIE TO THE OFFER. Say WHY you're asking.
   BAD: "Tell me about a time you led a project"
   GOOD: "Ami cherche quelqu'un qui a monté des process RH from scratch — chez Germinal, c'était quoi le premier truc que t'as mis en place ?"

3. PUSH FOR METRICS. If vague, suggest a range.
   User: "J'ai amélioré l'onboarding"
   You: "Cool ! Ça a changé quoi concrètement ? Genre le time-to-productivity est passé de combien à combien ?"

4. REFRAME AND SUGGEST. When you have a good answer, propose how it'll look on the CV.
   "Nickel — sur ton CV on mettrait : 'Structuré l'onboarding de 0 à 50 employés chez Germinal, réduisant le time-to-productivity de 3 semaines à 5 jours'. Ça te va ?"

5. DON'T BE EXHAUSTIVE. You have 4-5 questions max. Each one should unlock a KEY bullet point for the CV. Skip anything the CV rewriter can figure out on its own from the profile.

6. KEEP IT CONVERSATIONAL. You're a friend who happens to be great at CVs, not a form to fill out.

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
