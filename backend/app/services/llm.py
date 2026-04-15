import json
import os

import google.generativeai as genai

from app.models import (
    CVData, ChatMessage, ChatResponse, Education, GapAnalysis,
    Offer, Profile, RewrittenExperience,
)

MAX_TOKENS_PER_CALL = 16000  # Gemini 2.5 Flash shares budget between thinking + output


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
            generation_config=genai.types.GenerationConfig(max_output_tokens=MAX_TOKENS_PER_CALL, temperature=0.3, response_mime_type="application/json"),
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

        prompt = f"""You are the best career interviewer in the world. You have a talent for making people realize what's extraordinary in their experience — things THEY think are normal but that a recruiter would find impressive.

People don't know what's interesting about themselves. They say "I did 30 recruitments" and think that's enough. Your job is to DIG DEEPER — uncover the CONTEXT, the CHALLENGES, the PROCESS, the RESULTS that make a boring fact into a compelling story.

CANDIDATE: {profile.name} — {profile.title}
TARGET ROLE: {offer.title} at {offer.company}
GAPS: {", ".join(gap_analysis.gaps)}
PLANNED QUESTIONS: {json.dumps(gap_analysis.questions)}

CONVERSATION SO FAR:
{conversation}

CONTEXT: Focus on the 3-4 MOST DIFFERENTIATING requirements from the offer.

YOUR INTERVIEWING TECHNIQUE:

1. NEVER ACCEPT THE FIRST ANSWER. The first answer is always surface-level. Your job is to go ONE LEVEL DEEPER with a follow-up that paints the full picture.

   User: "J'ai fait 30 recrutements chez Mindflow"
   BAD follow-up: "Super, autre chose ?"
   GOOD follow-up: "30 recrutements, ok. C'était quoi les profils les plus durs à trouver ? T'avais mis en place un process de sourcing ou c'était au feeling ? Et en combien de temps tu devais closer un recrutement en moyenne ?"

   User: "J'ai géré l'onboarding"
   BAD follow-up: "Ok, et les autres process ?"
   GOOD follow-up: "Géré comment ? T'as hérité d'un process existant ou t'as tout construit ? Combien de personnes sont passées par ton onboarding ? Et t'as mesuré un truc genre le temps avant qu'ils soient autonomes ?"

2. GIVE EXAMPLES TO INSPIRE. People forget what they've done. Help them remember by suggesting what MIGHT have happened:
   "Chez Mindflow, en tant que Head of People dans une startup AI en hypergrowth — est-ce que t'as dû gérer des trucs comme : des visas pour des talents internationaux ? des négociations salariales compliquées avec des profils ML ? monter un process de perf review from scratch ?"

3. FRAME THE CONTEXT FIRST. Before asking about achievements, help them describe the SITUATION:
   "Quand t'es arrivé chez Germinal, c'était quoi l'état des lieux ? Combien de personnes, y'avait déjà des process RH ou tu partais de zéro ? C'est important parce que 'monter une équipe de 5 à 50' c'est 10x plus impressionnant que 'gérer une équipe de 50'."

4. ASK ABOUT CHALLENGES, NOT JUST ACHIEVEMENTS:
   "C'était quoi le truc le plus galère dans ce rôle ? Le moment où tu t'es dit 'ok c'est compliqué' — et comment t'as débloqué la situation ?"

5. HELP THEM QUANTIFY. People always underestimate their numbers:
   "Tu dis que t'as 'amélioré' le process — essaie de mettre un chiffre. Même approximatif. Genre : avant, ça prenait combien de temps / ça coûtait combien / ça touchait combien de personnes ? Et après ton intervention ?"

6. ONE QUESTION AT A TIME. But make it a RICH question with context and examples that inspire a detailed answer. 2-4 sentences max.

7. REFRAME INTO CV BULLETS. When you have enough detail, propose the bullet:
   "Avec tout ça, on pourrait écrire : 'Structuré le recrutement chez Mindflow (AI, seed→Series A) : 30 hires en 8 mois, time-to-hire moyen de 3 semaines, process de sourcing LinkedIn + cooptation qui a généré 60% des hires'. Ça te parle ?"

8. ABSORB LONG ANSWERS. If they give lots of info, note everything and skip ahead. Never re-ask what they already told you.

9. KEEP IT WARM AND DIRECT. Like a friend who's great at interviews, not a corporate coach.

8. RESPECT USER EDITS. If you see messages starting with "✏️ I edited", the user manually changed something on their CV. This is intentional — respect their choice.

9. EXECUTE CV INSTRUCTIONS IMMEDIATELY. If the user asks to delete, add, move, or modify something on the CV, DO IT via cv_actions. The "target" field MUST contain the company name or section name — NEVER leave it empty.

   FORMAT for cv_actions:
   {{"action": "remove_experience", "target": "Techfugees", "value": "", "index": -1}}
   {{"action": "remove_experience", "target": "Rogervoice", "value": "", "index": -1}}
   {{"action": "add_bullet", "target": "Mindflow", "value": "Built Python automation for HR workflows", "index": -1}}
   {{"action": "remove_education", "target": "Some School", "value": "", "index": -1}}

   User: "delete rogervoice and techfugees" → cv_actions: [{{"action": "remove_experience", "target": "Rogervoice"}}, {{"action": "remove_experience", "target": "Techfugees"}}]
   User: "delete about section" → cv_actions: [{{"action": "edit_field", "target": "summary", "value": ""}}]
   ALWAYS confirm what you did briefly, then continue the conversation.

DECISION:
- If the user gives a CV editing instruction → execute it via cv_actions AND continue the conversation
- If the user's last answer covered multiple planned questions → acknowledge what you got, skip ahead
- If the user's answer was vague → ask them to be more specific
- If you have enough for this experience → move to the next relevant experience
- ONLY set is_complete to true when you have concrete, specific info for the key gaps.
- Before completing, always offer one final reframe: "Voilà ce que j'ai retenu — [summary]. On génère ton CV ?"

Respond in valid JSON only:
{{"message": "your response text", "is_complete": false or true, "cv_actions": []}}

Write in {lang_instruction}. Be warm but direct — like a coach, not a chatbot."""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=8000, temperature=0.7, response_mime_type="application/json"),
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

BANNED WORDS AND PHRASES — if ANY of these appear in your output, you have FAILED:
"highly accomplished", "seasoned", "proven track record", "passionate about",
"results-driven", "detail-oriented", "team player", "leveraged", "synergies",
"spearheaded", "orchestrated", "dynamic", "innovative", "cutting-edge",
"best-in-class", "world-class", "thought leader", "strategic vision",
"dedicated professional", "extensive experience", "strong background in"
These are LinkedIn clichés. They make the CV sound like AI wrote it. USE PLAIN LANGUAGE.

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

7. SKILLS: This is the MOST ABUSED section on CVs. Follow these rules strictly:
   a) NO generic soft skills: "Communication", "Leadership", "Problem-solving", "Teamwork" are BANNED. They say nothing.
   b) ONLY concrete, verifiable skills that appeared in the experience bullets above.
   c) Format each skill as "Skill (proof)" — e.g., "Multi-country payroll (FR/US/UK/DE)" not just "Payroll"
   d) Include tools/platforms BY NAME: "Deel", "BambooHR", "Salesforce" — not "HRIS tools"
   e) Max 8-10 skills. If you can't prove it from the bullets above, don't list it.
   ✅ ["Multi-country payroll (4 countries)", "HRIS: Deel, BambooHR", "Onboarding design (5-day ramp)", "Team scaling (2→8)", "Hypergrowth ops (seed to Series B)"]
   ❌ ["Leadership", "Communication", "Strategic thinking", "Problem-solving", "HR Management"]

8. INCLUDE ALL EXPERIENCES — but calibrate depth. Relevant roles get 3-4 rich bullets. Less relevant roles get 1 line that finds an angle connecting to the target job.
   For example, if someone was a Growth founder and is applying for HR Ops: "Founded Wagmi Family — recruited 30+ growth/sales profiles for startups, developed a deep understanding of what makes teams work from the hiring side."
   NEVER skip an experience entirely — unexplained gaps look worse than a brief mention.

9. DETECT GAPS in the timeline. If there's a gap > 6 months between roles, address it naturally (sabbatical, entrepreneurship, travel, etc.) — the chat should have uncovered this.

10. HIGHLIGHT YEARS OF EXPERIENCE. Include total years in the summary. "8+ years in HR/People ops across 4 startups" is more powerful than listing dates.

11. Write in the language of the job offer.

12. ATS & MATCH ANALYSIS:
   - match_score (0-100): how well this CV would pass an ATS filter for this specific offer. Check: are the exact keywords from the offer present? Are job titles aligned? Are required skills explicitly mentioned?
   - strengths: 2-3 things that make this CV strong for THIS role (be specific, reference the offer)
   - improvements: 1-2 concrete things the candidate could still add or change to score higher

Respond in valid JSON only:
{{"name": "{profile.name}", "title": "specific title that matches the offer — not generic", "email": "{profile.email}", "location": "{profile.location}", "summary": "2 punchy sentences — specific, not corporate", "experiences": [{{"title": "job title", "company": "company name", "dates": "dates", "bullets": ["micro-story bullet with real numbers", "another specific achievement"]}}], "education": [{{"degree": "...", "school": "...", "year": "..."}}], "skills": ["only relevant skills, no padding"], "language": "en or fr", "match_score": 78, "strengths": ["Strong HR ops experience across multiple startups", "Multi-country payroll expertise matches requirement"], "improvements": ["No explicit people analytics experience mentioned", "Could highlight more HRIS tool proficiency"]}}"""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=MAX_TOKENS_PER_CALL, temperature=0.4, response_mime_type="application/json"),
        )
        data = self._parse_json(response.text)
        return CVData(**data)

    def draft_cv(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage], ui_language: str = "en") -> CVData:
        """Generate a quick draft CV from whatever info is available so far."""
        conversation = "\n".join(f"{m.role}: {m.content}" for m in messages[-6:])  # only recent messages for speed

        prompt = f"""Rewrite this CV to match the target job offer. Be OPERATIONAL and STRAIGHT TO THE POINT.

CANDIDATE: {profile.name} — {profile.title}
Location: {profile.location}
Skills: {", ".join(profile.skills[:10])}
Experience:
{self._format_experiences(profile)}

TARGET: {offer.title} at {offer.company}
Offer description: {offer.description[:2000]}

{f"CONVERSATION: {conversation}" if conversation.strip() else ""}

STRICT RULES — VIOLATING THESE IS A FAILURE:
- NEVER write "Dynamic and entrepreneurial", "proven ability", "strong background", "eager to leverage", "passionate about", "proven track record", "results-driven"
- Summary: 2 short operational sentences. First = who they are with numbers. Second = what they bring to THIS role. Example: "6 ans en People Ops, 3 startups (Germinal, Mindflow, Figures), scaling 5→80 personnes. Payroll multi-pays, onboarding from scratch, HRIS Deel."
- NOT: "Dynamic People Operations leader with a strong background in talent acquisition and fostering exceptional employee experiences"
- Every bullet = a concrete action with a number, not a job description
- Contextualize companies: "(SaaS, seed→Series A, 12→45 employees)"
- Include ALL experiences from the profile — calibrate depth by relevance
- Skills: only concrete, verifiable skills with proof. No soft skills.

Respond in valid JSON:
{{"name": "{profile.name}", "title": "operational title matching the offer", "email": "{profile.email}", "location": "{profile.location}", "summary": "2 short operational sentences", "experiences": [{{"title": "title", "company": "company (context)", "dates": "dates", "bullets": ["concrete action + number"]}}], "education": [{{"degree": "...", "school": "...", "year": "..."}}], "skills": ["concrete skill (proof)"], "languages": [], "language": "{'fr' if ui_language == 'fr' else 'en'}", "match_score": 65, "strengths": ["specific strength"], "improvements": ["specific gap"]}}"""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=16000,  # Gemini 2.5 Flash thinking eats output budget
                temperature=0.3,
                response_mime_type="application/json",
            ),
        )
        data = self._parse_json(response.text)
        return CVData(**data)

    def translate_cv(self, cv_data: CVData, target_language: str) -> CVData:
        """Translate a CV to another language while preserving structure and quality."""
        cv_json = cv_data.model_dump_json()
        lang_name = "French" if target_language == "fr" else "English"

        prompt = f"""Translate this CV to {lang_name}. Keep the EXACT same structure, numbers, company names, and formatting. Only translate the text content. Do NOT add or remove any information. Do NOT make it more "corporate" — keep the same tone and style.

CURRENT CV (JSON):
{cv_json}

Respond in valid JSON only, same structure, translated to {lang_name}. Set "language" to "{target_language}"."""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=MAX_TOKENS_PER_CALL, temperature=0.2, response_mime_type="application/json"),
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
        # Strip markdown code blocks
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            cleaned = cleaned.rsplit("```", 1)[0]
        # Find JSON object in response (handles thinking preamble)
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            cleaned = cleaned[start:end]
        # Fix trailing commas
        import re
        cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
        return json.loads(cleaned)
