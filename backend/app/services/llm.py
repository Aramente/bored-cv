import json
import os

import google.generativeai as genai

from app.models import (
    CoverLetterData, CVData, ChatMessage, ChatResponse, Education,
    GapAnalysis, Offer, Profile, RewrittenExperience,
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
        prompt = f"""You're a sharp friend who's hired a lot of people. You know what makes a CV stand out — not buzzwords, but real specifics that make a recruiter stop scrolling.

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

STAGE CONTEXT — ASK ONCE FOR ALL ROLES:
At some point, ask ONE question covering all companies at once. LIST every company by name so the user can answer in one shot. Example: "Pour les headcounts arrivée/départ — Sloow ? Toucan Toco ? Germinal ?" NEVER ask one company at a time. "Joined at 5, left at 80" is one of the most powerful CV signals. Approximate numbers are fine.

ROLE-SPECIFIC PROBING — adapt your questions to the candidate's field. Every specialty has metrics that recruiters EXPECT to see. If they're missing, ASK:
- **Engineering/Dev**: tech stack, system scale (requests/s, data volume), architecture decisions, team size, CI/CD, testing, production incidents handled
- **Sales**: quota and attainment (% of target), deal size, pipeline value, sales cycle length, close rate, territory/segment. Benchmark: 120%+ attainment gets attention, single years look lucky — ask for consistency.
- **Marketing**: budget managed, CAC, ROI/ROAS, channels, conversion rates, campaign results with numbers. Benchmark: LTV:CAC above 3:1 is the bar.
- **Product**: user metrics (DAU/MAU, retention, adoption), prioritization method, launch outcomes, A/B test results
- **HR/People**: headcount growth (from→to), retention rate, time-to-hire, processes built from scratch, countries/entities managed
- **Finance**: budget size, forecast accuracy, audit outcomes, cost savings achieved. SaaS metrics: ARR, NRR, burn multiple, Rule of 40.
- **Operations**: process improvements (before→after), SLAs, throughput, cost reduction
- **Design**: projects shipped, user research method, design system contributions, measurable UX improvements. Portfolio link is mandatory.
- **Data/Analytics**: data volume, pipeline reliability, models deployed, business impact of insights
If the candidate's field isn't listed, think: "What would a hiring manager for THIS role google to benchmark candidates?" — those are your questions.

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
            generation_config=genai.types.GenerationConfig(max_output_tokens=2000, temperature=0.3, response_mime_type="application/json"),
            request_options={"timeout": 60},
        )
        data = self._parse_json(response.text)
        return GapAnalysis(**data)

    def generate_next_question(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage], ui_language: str = "en", known_facts=None, contradictions=None, cv_draft=None) -> ChatResponse:
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

        knowledge_context = ""
        if known_facts or contradictions:
            knowledge_context = "\n\nKNOWLEDGE FROM PREVIOUS CV PROJECTS:"
            if known_facts:
                knowledge_context += "\n\nKnown facts (don't re-ask these, use them directly):\n" + "\n".join(f"- {f}" for f in known_facts[:20])
            if contradictions:
                knowledge_context += "\n\nContradictions to clarify (ask the user which is correct):\n" + "\n".join(f"- {c}" for c in contradictions[:10])

        # Format current CV draft if available
        cv_draft_context = ""
        if cv_draft:
            draft_lines = []
            for i, exp in enumerate(cv_draft.experiences):
                bullets = "\n".join(f"      • {b}" for b in exp.bullets)
                draft_lines.append(f"  [{i}] {exp.title} at {exp.company} ({exp.dates})\n{bullets}")
            cv_draft_context = f"""

CURRENT CV DRAFT (this is what the user sees on screen right now):
  Name: {cv_draft.name}
  Title: {cv_draft.title}
  Summary: {cv_draft.summary}
  Experiences:
{chr(10).join(draft_lines)}

IMPORTANT: When the user asks to edit, merge, delete, or modify something on the CV, use the CURRENT CV DRAFT above as your reference — NOT the original LinkedIn profile. You can see exactly what's on their screen. Act on it directly via cv_actions."""

        prompt = f"""You're the friend who's great at interviews. Short, direct, no fluff.

CANDIDATE: {profile.name} — {profile.title}
TARGET ROLE: {offer.title} at {offer.company}
GAPS: {", ".join(gap_analysis.gaps)}
SUGGESTED QUESTIONS (skip any already covered in conversation): {json.dumps(gap_analysis.questions)}{knowledge_context}{cv_draft_context}

CONVERSATION SO FAR:
{conversation}

## YOUR #1 RULE: BE SHORT

Your responses must be 1-3 sentences. NEVER more.
- NEVER restate what the user just told you. They know what they said.
- NEVER write "Super !", "C'est exactement...", "Excellent !" before asking the next question.
- When the user gives info → UPDATE THE CV via cv_actions silently + ask the NEXT question. That's it.
- The user sees changes flash on their CV panel. They don't need you to repeat the change in text.
- BAD: "Super Kevin ! Le système de mentorat chez Germinal avec l'augmentation du NPS, c'est excellent. Peux-tu me donner le chiffre exact du NPS ?"
- GOOD: "Noté. Pour toutes tes boîtes — c'était combien de personnes à ton arrivée vs ton départ ?"

## FOCUS: 6-7 KEY POINTS, THAT'S IT

Extract the job offer's 6-7 most important requirements. Validate each one against the profile. You need ONE concrete detail per point — not three. The whole session should take ~15 minutes.

1. HEADCOUNT + STAGE — ask ONCE for ALL companies in a single question: "Pour chaque boîte, c'était combien de personnes quand t'es arrivé vs quand t'es parti ?" NEVER ask this per company. One question, one answer covering everything.

1b. EXPERIENCE CLEANUP — early in the chat, ask: "Il y a des expériences à enlever ou à rajouter sur ton CV ?" — some LinkedIn profiles have irrelevant jobs or missing freelance/side projects. Use remove_experience or add cv_actions based on the answer.

2. METRICS THAT MATCH THE OFFER. For each key requirement, get ONE number or concrete fact. Give a benchmark so they know it's good:
   - HR: "time-to-hire ? (sous 30j en startup c'est bon)"
   - Sales: "% d'objectif ? (au-dessus de 120% ça se voit)"
   - Engineering: "quelle échelle ? (requêtes/jour, taille équipe)"
   Adapt to the role. One metric per topic. Move on once you have it.

3. PHILOSOPHY — WOVEN IN, NOT ASKED DIRECTLY. Nobody knows what their "philosophy" is if you ask like that. Instead, when someone describes a concrete action, follow up with WHY:
   - User: "J'ai créé un système de mentorat" → "Pourquoi le mentorat spécifiquement ? C'était quoi le problème de fond ?"
   - User: "J'ai repris l'équipe BDR" → "Qu'est-ce qui marchait pas selon toi ? C'était quoi ton diagnostic ?"
   The WHY reveals their thinking. "I believe recruitment is R&D" comes out naturally when you ask "why did you redesign the process?" — not when you ask "what's your philosophy?"
   If the conversation hasn't revealed a personal take by the 4th question, then ask: "C'est quoi ton approche sur [their field] — le truc que toi tu fais différemment ?"

4. ACCEPT GOOD-ENOUGH ANSWERS. "Created a mentoring system, NPS went up" = good enough. Don't ask for the exact NPS number, don't ask how founders reacted, don't ask three follow-ups. One concrete detail per topic. Move on.

5. NEVER REPEAT A QUESTION OR TOPIC. Read the FULL conversation above. If a company, role, metric, or topic was ALREADY discussed — even partially — SKIP IT and move to the next uncovered point. The PLANNED QUESTIONS are suggestions, NOT a checklist — skip any that the conversation already covers. Repeating questions is the #1 way to lose the user.

6. NEVER ASK FOR MORE EXAMPLES. If the user gave one example, that's enough. Don't ask "and what else?" or "any other examples?" — move to the next topic.

7. ABSORB LONG ANSWERS. If they cover multiple topics in one message, silently update the CV for ALL of them and jump ahead to the next uncovered topic.

8. RESPECT USER EDITS. Messages starting with "✏️ I edited" = intentional. Don't question it.

## CV ACTIONS — UPDATE THE CV AS YOU GO

When the user gives you info, update the CV immediately via cv_actions. Don't just note it — write the bullet.
When the user asks to delete, merge, edit — do it via cv_actions.

FORMAT:
{{"action": "remove_experience", "target": "Techfugees", "value": "", "index": -1}}
{{"action": "add_bullet", "target": "Mindflow", "value": "Built recruitment pipeline from scratch — 30 hires in 8 months", "index": -1}}
{{"action": "edit_field", "target": "summary", "value": "new summary text"}}
{{"action": "merge_experiences", "target": "Toucan Toco", "value": {{"title": "combined title", "company": "Toucan Toco (context)", "dates": "earliest - latest", "bullets": ["best bullets from both"]}}, "index": -1}}

MERGE RULES:
- "merge/combine/fusionne/regroupe" → use "merge_experiences", NEVER two "remove_experience"
- "value" MUST include "bullets" combining the best from BOTH experiences
- "target" = company name only (e.g., "Toucan Toco", not the full string with context)

## WHEN TO FINISH

Set is_complete=true when you have:
- Stage/headcount for each relevant company
- One concrete metric per key offer requirement (6-7 total)
- A sense of their approach/thinking (the philosophy)

Before completing, write the CV bullet summary in ONE sentence: "Je lance la génération — j'ai tout ce qu'il faut."

Respond in valid JSON only:
{{"message": "1-3 sentences max", "is_complete": false or true, "cv_actions": [...], "progress": 0-100}}

"progress": 0-100 (estimate what % of the 6-7 key offer points you've already covered based on the conversation. 0 = just started, 50 = half the points have concrete answers, 100 = ready to generate)

Write in {lang_instruction}. Short. Direct. No fluff."""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=1500, temperature=0.7, response_mime_type="application/json"),
            request_options={"timeout": 60},
        )
        data = self._parse_json(response.text)
        return ChatResponse(**data)

    def generate_cv(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage], ui_language: str = "en", tone: str = "startup", target_market: str = "france") -> CVData:
        # Token optimization: summarize long conversations to avoid blowing context window
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

        prompt = f"""You write CVs the way someone would explain their work to a junior colleague at the startup — direct, specific, with energy and professional depth. Not dumbed down. Not corporate. Just how a competent professional talks about what they actually did, without posturing. That honesty IS what impresses recruiters — because 200 other CVs sound like ChatGPT wrote them.

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

{self._get_market_instruction(target_market)}

VOICE — THE JUNIOR COLLEAGUE TEST:
Read every sentence out loud. If you can't imagine someone explaining it to a junior colleague at the startup — someone who understands the work but doesn't need to be impressed — rewrite it. The CV should sound like a competent professional being straight about what they did, not performing for LinkedIn.
   ❌ "Dynamic and entrepreneurial People Operations leader with a strong background in talent acquisition"
   ✅ "Built the People function from scratch at Mindflow (AI automation, seed stage): 30 hires in 8 months, structured the full recruitment pipeline, and set up multi-country payroll across FR/US/UK."
The second version is MORE impressive because it's SPECIFIC and keeps the professional depth. Fancy words hide weak content. Direct language with real detail commands respect.

BANNED WORDS AND PHRASES — if ANY of these appear in your output, you have FAILED:
"highly accomplished", "seasoned", "proven track record", "passionate about",
"results-driven", "detail-oriented", "team player", "leveraged", "synergies",
"spearheaded", "orchestrated", "dynamic", "innovative", "cutting-edge",
"best-in-class", "world-class", "thought leader", "strategic vision",
"dedicated professional", "extensive experience", "strong background in",
"proven ability", "eager to leverage", "fostering", "exceptional employee experiences",
"people-centric initiatives", "fast-paced", "entrepreneurial"
These are LinkedIn clichés. They make the CV sound like AI wrote it. USE PLAIN LANGUAGE.

BANNED SENTENCE STARTERS — these are responsibility-voice patterns, not outcome-voice:
"Responsible for...", "Helped with...", "Worked on...", "Assisted in...", "Participated in...",
"Involved in...", "Contributed to...", "Supported the...", "Managed the...", "In charge of..."
These describe a JOB DESCRIPTION, not what the person DID. Rewrite every one as an outcome.
   ❌ "Responsible for managing the recruitment pipeline"
   ✅ "Rebuilt the recruitment pipeline from scratch — 30 hires in 8 months, time-to-hire down from 6 weeks to 3"
   ❌ "Helped with onboarding new employees"
   ✅ "Designed the onboarding program: new hires hit full speed in 5 days instead of 3 weeks"

STAGE CONTEXT — CRITICAL SIGNAL:
For EVERY company, include the stage transition in the company context: headcount at arrival → departure, funding stage, key growth moment.
   ✅ "Mindflow (AI automation, seed→Series A, 5→45 people)"
   ✅ "Germinal (SaaS, 15→80 employees, raised €8M during tenure)"
   ❌ "Mindflow" or "Mindflow (AI automation)" — missing the growth story
If the conversation provided headcount numbers, USE THEM. "Joined at 5, left at 80" is one of the most powerful signals on a CV.

WRITING RULES — THIS IS WHAT MAKES THE CV EXCELLENT:

1. EXPERIENCE STRUCTURE — EVERY EXPERIENCE FOLLOWS THIS PATTERN:
   Bullet 1: CONTEXT + BROAD MISSION — what was the situation, what was your scope
      ✅ "Built the entire People function from scratch at Mindflow (AI, seed→Series A, 5→45): employer branding, payroll, comp strategy, onboarding, HRIS."
      ❌ "Responsible for HR operations" — too vague, no context
   Bullet 2-3: SPOTLIGHTS — 1-2 specific achievements the person is proud of AND that matter for THIS job offer. With metrics.
      ✅ "Structured recruitment to hit 30 hires in 8 months — built a sourcing pipeline (LinkedIn + cooptation) that generated 60% of hires, time-to-hire: 3 weeks"
      ✅ "Created a mentoring system after team feedback — NPS auprès des clients went up, reduced early churn"
      ❌ "Managed recruitment" — no metric, no specifics
   This pattern (context → scope → 1-2 spotlights) gives every experience the same rhythm. A recruiter can scan it fast.

2. ANTI-BULLSHIT. No corporate filler, no buzzwords, no responsibility-voice.
   ❌ "Responsible for managing HR operations across multiple geographies"
   ✅ "Ran payroll in 4 countries, from scratch, while the company tripled in size"
   ❌ "Leveraged strategic synergies" / "Proven track record" / "Passionate about" — banned. Use plain language.

3. NUMBERS WITH CONTEXT. Raw numbers are noise. Numbers with benchmarks are signal.
   ❌ "Exceeded sales quota"
   ✅ "118% of quota in a year where team average was 79%"

4. CONTEXTUALIZE EVERY COMPANY: "Company (sector, stage, headcount transition)"
   ✅ "Germinal (SaaS, 15→80 employees, Series A)"
   ❌ "Germinal" alone

5. USE THE CANDIDATE'S ACTUAL WORDS. Real names, real numbers, real context. The CV must sound like THEM.

6. WEAVE IN PHILOSOPHY. If the candidate expressed a personal take on their work (e.g., "recruitment is R&D", "99% of candidates get rejected but it's on us to make them ambassadors"), weave it into the summary or as context in the most relevant experience. Philosophy = memorable. Don't invent it — only use what they actually said.

7. ATS OPTIMIZATION. Mirror the EXACT terminology from the job offer in bullets.

8. SUMMARY: 2 sentences MAX. Written like you're introducing yourself at a dinner — not a conference stage.
   First sentence = what you do + proof (years, companies, scale). Second = what you'd bring to THIS role specifically.
   ✅ "6 ans à monter des fonctions RH from scratch dans 3 startups (Germinal, Mindflow, Figures), de 5 à 80 personnes. Payroll multi-pays, onboarding, HRIS — le genre de bazar organisé qui fait tourner une boîte en hypergrowth."
   ✅ "Built HR from zero at 3 startups (Germinal, Mindflow, Figures), scaling teams from 5 to 80. Multi-country payroll, onboarding programs, HRIS setup — the organized chaos that keeps hypergrowth companies running."
   ❌ "Experienced HR professional with a passion for building great teams and driving organizational success."
   ❌ "Dynamic and entrepreneurial People Operations leader with a strong background in talent acquisition"
   The test: would a real person say this sentence out loud? If it sounds like a template, rewrite it.

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
            request_options={"timeout": 60},
        )
        data = self._parse_json(response.text)
        return CVData(**data)

    def draft_cv(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage], ui_language: str = "en", target_market: str = "france") -> CVData:
        """Generate a quick draft CV from whatever info is available so far."""
        conversation = "\n".join(f"{m.role}: {m.content}" for m in messages[-6:])  # only recent messages for speed

        prompt = f"""Rewrite this CV to match the target job offer. Write like the candidate would explain their job to someone at a market — plain, specific, energetic, no corporate filler. Not dumbed down — just honest and concrete.

CANDIDATE: {profile.name} — {profile.title}
Location: {profile.location}
Skills: {", ".join(profile.skills[:10])}
Experience:
{self._format_experiences(profile)}

TARGET: {offer.title} at {offer.company}
Offer description: {offer.description[:2000]}

{f"CONVERSATION: {conversation}" if conversation.strip() else ""}

{self._get_market_instruction(target_market)}

STRICT RULES — VIOLATING THESE IS A FAILURE:
- NEVER write "Dynamic and entrepreneurial", "proven ability", "strong background", "eager to leverage", "passionate about", "proven track record", "results-driven", "fostering", "exceptional employee experiences", "people-centric", "fast-paced"
- THE JUNIOR COLLEAGUE TEST: read every sentence out loud. If you can't imagine someone saying it to a junior colleague at the startup — someone who gets the work but doesn't need posturing — rewrite it.
- NEVER start bullets with: "Responsible for", "Helped with", "Worked on", "Assisted in", "Managed the", "In charge of". These describe a job description, not an outcome. Rewrite as actions with results.
- STAGE CONTEXT: for each company, include headcount/stage transition: "Company (sector, seed→Series A, 5→45 people)"
- Summary: 2 short sentences. First = what they do + proof (years, companies, scale). Second = what they bring to THIS role.
  ✅ "6 ans en People Ops, 3 startups (Germinal, Mindflow, Figures), scaling 5→80 personnes. Payroll multi-pays, onboarding from scratch, HRIS Deel."
  ❌ "Dynamic People Operations leader with a strong background in talent acquisition and fostering exceptional employee experiences"
  The first one sounds like a person. The second sounds like a robot.
- EXPERIENCE PATTERN — every experience follows the same structure:
  Bullet 1: CONTEXT + BROAD MISSION — situation, full scope of role ("Built entire People function from scratch: employer branding, payroll, comp, onboarding, HRIS")
  Bullet 2-3: SPOTLIGHTS — 1-2 specific achievements the person is proud of AND that connect to the target offer, with metrics
  This gives every experience the same scannable rhythm.
- Contextualize companies: "(SaaS, seed→Series A, 12→45 employees)"
- Include ALL experiences — calibrate depth by relevance (3-4 bullets for key roles, 1 line for minor ones)
- PHILOSOPHY: If the candidate expressed a personal take/belief, weave it into summary or relevant bullet.
- Skills: only concrete, verifiable skills with proof. No soft skills.
- LANGUAGE: Write ALL CV content in {"French" if ui_language == "fr" else "English"}. The summary, bullets, skills — everything must be in {"French" if ui_language == "fr" else "English"}.

Respond in valid JSON:
{{"name": "{profile.name}", "title": "operational title matching the offer", "email": "{profile.email}", "location": "{profile.location}", "summary": "2 short operational sentences", "experiences": [{{"title": "title", "company": "company (context)", "dates": "dates", "bullets": ["concrete action + number"]}}], "education": [{{"degree": "...", "school": "...", "year": "..."}}], "skills": ["concrete skill (proof)"], "languages": [], "language": "{'fr' if ui_language == 'fr' else 'en'}", "match_score": 65, "strengths": ["specific strength"], "improvements": ["specific gap"]}}"""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=16000,  # Gemini 2.5 Flash thinking eats output budget
                temperature=0.3,
                response_mime_type="application/json",
            ),
            request_options={"timeout": 60},
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
            request_options={"timeout": 60},
        )
        data = self._parse_json(response.text)
        return CVData(**data)

    def generate_cover_letter(self, profile: Profile, offer: Offer, cv_data: CVData, messages: list[ChatMessage], ui_language: str = "en", tone: str = "startup", target_market: str = "france") -> CoverLetterData:
        # Summarize conversation for context
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

        # Format CV experiences for the prompt
        cv_experiences = []
        for exp in cv_data.experiences:
            bullets = "\n".join(f"  - {b}" for b in exp.bullets)
            cv_experiences.append(f"- {exp.title} at {exp.company} ({exp.dates})\n{bullets}")
        cv_exp_text = "\n".join(cv_experiences)

        prompt = f"""You write cover letters the way someone would explain why they want the job to a friend who works there — direct, specific, with real reasons. Not a template. Not corporate. Just how a competent professional talks about what excites them about THIS role, without posturing.

CANDIDATE:
Name: {profile.name}
Title: {profile.title}

CV (already tailored to this role):
Summary: {cv_data.summary}
Experiences:
{cv_exp_text}
Skills: {", ".join(cv_data.skills)}

TARGET ROLE: {offer.title} at {offer.company}
Key requirements: {self._format_requirements(offer)}
Offer description: {offer.description[:2000]}

WHAT THE CANDIDATE SAID IN CONVERSATION:
{conversation}

TONE OF VOICE: {self._get_tone_instruction(tone)}

{self._get_market_instruction(target_market)}

COVER LETTER MARKET NORMS:
{"French cover letters (lettre de motivation) are slightly more formal. Use 'vous' form. Start with 'Madame, Monsieur,' unless you know the hiring manager. Close with a formal politesse formula but keep it SHORT — not the 3-line dinosaur version. The body should still be direct and specific." if target_market == "france" else "US/international cover letters are direct. First name basis if you know it. No formal closing formulas — just a clear call to action."}

VOICE — THE JUNIOR COLLEAGUE TEST:
Read every sentence out loud. If you can't imagine someone saying it to a junior colleague at the startup — someone who gets the work but doesn't need posturing — rewrite it.
   ❌ "I am writing to express my keen interest in the position of Head of People Ops at your esteemed organization"
   ✅ "I built HR from scratch at three startups — Mindflow, Germinal, Figures — scaling teams from 5 to 80 people. Your job posting for Head of People Ops at Ami reads like a list of problems I've already solved."
The second version is MORE compelling because it's SPECIFIC. Generic enthusiasm is noise.

BANNED WORDS AND PHRASES — if ANY of these appear, you have FAILED:
"highly motivated", "passionate about", "eager to leverage", "proven track record",
"I believe I would be a great fit", "I am confident that", "your esteemed",
"dynamic", "innovative", "cutting-edge", "synergies", "spearheaded",
"I am writing to express", "please find enclosed", "I look forward to the opportunity",
"strong background in", "extensive experience", "dedicated professional",
"fast-paced environment", "team player", "results-driven", "detail-oriented"

STRUCTURE:
1. **greeting**: "Madame, Monsieur," (FR formal) or "Hi [name]," / "Dear [team]," (informal) — adapt to market
2. **opening**: 2-3 sentences. Hook with a SPECIFIC achievement from the CV that directly connects to the role. Name the company. Make them stop scrolling. This is NOT "I saw your job posting and I'm interested." This IS "I built X at Y, and your posting for Z reads like what I do."
3. **body**: 2-3 SHORT paragraphs. Each one connects a SPECIFIC experience/achievement from the CV to a SPECIFIC requirement from the offer. Use real numbers, real company names, real outcomes. Don't repeat the CV — ADD context: why you made those choices, what you learned, why it matters for THIS role.
4. **closing**: 2-3 sentences. Clear call to action. What you'd bring in the first 90 days, or what you'd love to discuss. Not "I look forward to hearing from you" — something specific.
5. **signature**: "{profile.name}"

RULES:
- MAX 350 words total across all sections
- Reference SPECIFIC achievements from the CV — with numbers
- Address SPECIFIC requirements from the job offer — by name
- The opening must mention the target company ({offer.company}) and role ({offer.title})
- Every paragraph must connect YOUR experience to THEIR needs
- Use the candidate's actual company names and numbers from the CV
- Write in {"French" if ui_language == "fr" else "English"}

Respond in valid JSON only:
{{"greeting": "...", "opening": "...", "body": "...", "closing": "...", "signature": "{profile.name}", "language": "{"fr" if ui_language == "fr" else "en"}"}}"""

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=MAX_TOKENS_PER_CALL, temperature=0.5, response_mime_type="application/json"),
            request_options={"timeout": 60},
        )
        data = self._parse_json(response.text)
        return CoverLetterData(**data)

    def _get_market_instruction(self, market: str) -> str:
        markets = {
            "france": """FRANCE MARKET NORMS:
- Language proficiency: use CEFR scale (B2, C1, C2) not "fluent/conversational"
- Education: if the candidate attended a grande école (Polytechnique, HEC, ESSEC, Centrale, ENS, Sciences Po, ENSAE), make it visible — it carries weight in French hiring
- Photo: not included by default
- Hobbies: include ONLY if specific and culturally relevant to the target company — generic "cinema, travel, reading" is a red flag
- One page maximum unless 10+ years of experience
- Date of birth, marital status, nationality: do NOT include""",
            "europe": """EUROPEAN MARKET NORMS:
- Language proficiency: use CEFR scale (B2, C1, C2) — European standard
- Photo: not included by default
- One page preferred, two pages acceptable for 10+ years
- No date of birth, marital status, or nationality
- Work authorization status: mention if relevant""",
            "us": """US MARKET NORMS:
- No photo, no date of birth, no personal details beyond contact info
- One page maximum — even for senior roles
- Aggressive focus on outcomes and metrics — every bullet needs a number
- Education after experience (unless new grad)
- Language proficiency: "Professional proficiency" / "Native" — not CEFR""",
            "global": """GLOBAL MARKET NORMS:
- No photo, no personal details beyond contact info
- One page preferred
- English language default
- CEFR for language proficiency
- Focus on outcomes and metrics""",
        }
        return markets.get(market, markets["france"])

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
