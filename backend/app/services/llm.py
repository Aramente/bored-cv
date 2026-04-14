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
        # Token optimization: only send last 6 messages + summary of earlier ones
        if len(messages) > 6:
            early = messages[:-4]
            recent = messages[-4:]
            summary_parts = []
            for m in early:
                if m.role == "user":
                    summary_parts.append(f"- User said: {m.content[:150]}")
            conversation = "EARLIER (summary):\n" + "\n".join(summary_parts) + "\n\nRECENT:\n" + "\n".join(f"{m.role}: {m.content}" for m in recent)
        else:
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
- ONLY set is_complete to true when you've asked AT LEAST 3 questions AND received concrete answers with numbers/specifics for each. If in doubt, ask one more.
- Before completing, always offer one final reframe: "Voilà ce que j'ai retenu — [summary]. On génère ton CV ?"

Respond in valid JSON only:
{{"message": "your short, focused question or reframing suggestion", "is_complete": false or true}}

Write in {lang_instruction}. Be warm but direct — like a coach, not a chatbot."""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=1000, temperature=0.7),
        )
        data = self._parse_json(response.text)
        return ChatResponse(**data)

    def generate_cv(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage], ui_language: str = "en", tone: str = "startup") -> CVData:
        conversation = "\n".join(f"{m.role}: {m.content}" for m in messages)

        prompt = f"""You write CVs that get people hired. Not corporate-sounding CVs that blend in with 200 others. CVs that a recruiter REMEMBERS.

CANDIDATE:
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

TARGET ROLE: {offer.title} at {offer.company}
Key requirements: {self._format_requirements(offer)}

WHAT THE CANDIDATE TOLD YOU IN THE CONVERSATION:
{conversation}

MATCHED SKILLS: {", ".join(gap_analysis.matched_skills)}

TONE OF VOICE: {self._get_tone_instruction(tone)}

WRITING RULES — THIS IS WHAT MAKES THE CV EXCELLENT:

1. ANTI-BULLSHIT. Most CVs are bad because they are:
   a) TOO SCHOLARLY — they describe responsibilities like a job description, not what the person actually DID
      ❌ "Responsible for managing HR operations across multiple geographies"
      ✅ "Ran payroll in 4 countries, from scratch, while the company tripled in size"
   b) TOO POMPOUS — fancy words that sound impressive but say nothing
      ❌ "Leveraged strategic synergies to optimize cross-functional workflows"
      ❌ "Proven track record of delivering results in fast-paced environments"
      ❌ "Passionate about driving organizational excellence"
      These are empty calories. A recruiter reads 200 CVs — they remember ZERO of these.
   c) TOO DESCRIPTIVE — listing what the job was, not what the person achieved
      ❌ "In charge of the onboarding process for new employees"
      ✅ "Built onboarding from zero — new hires hit full speed in 5 days instead of 3 weeks"
   d) NOT RELEVANT — mentioning things that don't connect to the target role
      Every bullet should pass the test: "Would the person reading THIS job offer care about this?"

2. XYZ FORMULA for every bullet: "Accomplished [X] as measured by [Y] by doing [Z]."
   ✅ "Grew the team from 2 to 8 (X) in 6 months (Y) by building a sourcing pipeline and running 150+ interviews (Z)"
   ✅ "Cut time-to-productivity from 3 weeks to 5 days (X/Y) by designing a structured onboarding program with buddy system (Z)"
   NOT every bullet needs all three, but the best ones do.

3. NUMBERS WITH CONTEXT. Raw numbers are noise. Numbers with benchmarks are signal.
   ❌ "Exceeded sales quota"
   ✅ "118% of quota in a year where team average was 79%"
   ❌ "Managed payroll"
   ✅ "Ran payroll across 4 countries (FR, US, UK, DE) with zero errors over 14 months — even during series A crunch"

4. CONTEXTUALIZE EVERY COMPANY in 5 words or less, right after the company name. The reader needs instant signal.
   ✅ "Germinal (SaaS, 15→80 employees, Series A)"
   ✅ "Mindflow (AI automation, seed stage, 12 people)"
   ✅ "Figures (compensation benchmark, Series B, €1B+ clients)"
   ❌ "Germinal" alone — means nothing to a recruiter who doesn't know the company

5. USE THE CANDIDATE'S ACTUAL WORDS AND DETAILS. Real company names, real numbers, real context from the conversation. If they said "12 people", write "12 people", not "a team of professionals". The CV must sound like THEM, not like ChatGPT wrote it. 74% of hiring managers now spot AI-generated resumes — and reject them.

5. ATS OPTIMIZATION. Use the EXACT terminology from the job offer. If the offer says "HRIS", write "HRIS" — not "HR information systems". If it says "payroll", write "payroll" — not "compensation management". Mirror their words naturally in bullets.

6. SUMMARY: 2 sentences. First = who they are WITH numbers (years, companies, scale). Second = what makes them perfect for THIS specific role.
   ✅ "6+ years building People ops from scratch at 3 startups (Germinal, Mindflow, Figures), scaling teams from 5 to 80. Hands-on HR generalist fluent in multi-country payroll, HRIS, and the organized chaos of hypergrowth."
   ❌ "Experienced HR professional with a passion for building great teams and driving organizational success."
   The summary is about THEM (the company), not about YOU (the candidate). What do you bring to THEIR problem?

7. SKILLS: This is NOT a keyword dump. Group skills into 2-3 meaningful categories that match the offer's structure. Each skill must be something the candidate PROVED in their experience bullets.
   ✅ "HR Ops: multi-country payroll (FR/US/UK/DE), HRIS (Deel, BambooHR), onboarding design"
   ✅ "Leadership: team scaling (2→8), process design from scratch, C-level stakeholder mgmt"
   ❌ "Teamwork, Communication, Problem-solving, Leadership, Strategic thinking" — this is a horoscope, not a skills section

8. INCLUDE ALL EXPERIENCES — but calibrate depth. Relevant roles get 3-4 rich bullets. Less relevant roles get 1 line that finds an angle connecting to the target job.
   For example, if someone was a Growth founder and is applying for HR Ops: "Founded Wagmi Family — recruited 30+ growth/sales profiles for startups, developed a deep understanding of what makes teams work from the hiring side."
   NEVER skip an experience entirely — unexplained gaps look worse than a brief mention.

9. DETECT GAPS in the timeline. If there's a gap > 6 months between roles, address it naturally (sabbatical, entrepreneurship, travel, etc.) — the chat should have uncovered this.

10. HIGHLIGHT YEARS OF EXPERIENCE. Include total years in the summary. "8+ years in HR/People ops across 4 startups" is more powerful than listing dates.

11. Write in the language of the job offer.

Respond in valid JSON only:
{{"name": "{profile.name}", "title": "specific title that matches the offer — not generic", "email": "{profile.email}", "location": "{profile.location}", "summary": "2 punchy sentences — specific, not corporate", "experiences": [{{"title": "job title", "company": "company name", "dates": "dates", "bullets": ["micro-story bullet with real numbers", "another specific achievement"]}}], "education": [{{"degree": "...", "school": "...", "year": "..."}}], "skills": ["only relevant skills, no padding"], "language": "en or fr"}}"""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=MAX_TOKENS_PER_CALL, temperature=0.4),
        )
        data = self._parse_json(response.text)
        return CVData(**data)

    def _get_tone_instruction(self, tone: str) -> str:
        tones = {
            "startup": "Direct, confident, action-oriented. Short punchy sentences. Use first-person implied (no 'I'). Show scrappiness and ownership. Think: YC founder describing what they built.",
            "corporate": "Polished and structured but NOT generic. Still use specific numbers and stories. Think: McKinsey associate who actually did the work, not just made the slides.",
            "creative": "Bold, slightly unconventional. Can break format rules. Show personality. Think: senior designer's portfolio — the work speaks, but with flair.",
            "minimal": "Ultra-concise. One line per bullet, max 10 words. Pure signal, zero fluff. Think: senior engineer's resume — code speaks louder than words.",
        }
        return tones.get(tone, tones["startup"])

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
