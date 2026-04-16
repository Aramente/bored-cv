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

STAGE CONTEXT — ALWAYS ASK THIS:
For EACH role, ask: "When you joined [Company], how many people were there? And when you left?" This is one of the most powerful signals on a CV — "joined at 5, left at 80" tells a recruiter more than any bullet. If the candidate doesn't know exact numbers, get an approximation.

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
            generation_config=genai.types.GenerationConfig(max_output_tokens=MAX_TOKENS_PER_CALL, temperature=0.3, response_mime_type="application/json"),
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

        prompt = f"""You're the friend who's great at interviews. You help people see what's actually impressive about their work — stuff they think is normal but that a recruiter would remember.

People undersell themselves. They say "I did 30 recruitments" like it's nothing. Your job: dig out the CONTEXT, the CHALLENGES, the PROCESS, the RESULTS that turn a flat fact into something a recruiter stops scrolling for.

CANDIDATE: {profile.name} — {profile.title}
TARGET ROLE: {offer.title} at {offer.company}
GAPS: {", ".join(gap_analysis.gaps)}
PLANNED QUESTIONS: {json.dumps(gap_analysis.questions)}{knowledge_context}{cv_draft_context}

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

2. ALWAYS ASK ABOUT STAGE AND HEADCOUNT. For each company: "Quand t'es arrivé chez [Company], y'avait combien de personnes ? Et quand t'es parti ?" This is gold — "arrivé à 5, parti à 80" tells a recruiter more than any bullet.

3. PROBE THE RIGHT METRICS AND GIVE BENCHMARKS. Every specialty has numbers recruiters expect. When asking, give the user a calibration point so they know their numbers ARE impressive:
   - Engineering: "C'était quoi le stack ? Ça tenait combien de requêtes/jour ? T'avais combien de devs dans l'équipe ?"
   - Sales: "T'avais quoi comme objectif ? Tu l'as atteint à combien de % ? Pour contexte, au-dessus de 120% ça fait lever la tête d'un recruteur. C'était quoi ton deal moyen ?"
   - Marketing: "T'avais combien de budget ? Quel ROI sur tes campagnes ? Un LTV:CAC au-dessus de 3:1 c'est le standard — t'étais où ?"
   - Product: "Combien d'utilisateurs actifs ? T'as mesuré l'adoption de ta feature ? T'as fait des A/B tests — avec quels résultats ?"
   - HR: "Vous êtes passés de combien à combien ? C'était quoi le time-to-hire ? Pour référence, en dessous de 30 jours en startup c'est bon."
   - Finance: "C'était quoi l'ARR quand t'es arrivé vs quand t'es parti ? Le NRR ? Le burn multiple ?"
   - Design: "T'as un portfolio en ligne ? C'est quasi obligatoire. Sinon, combien de projets livrés, et t'as mesuré un impact UX ?"
   Adapt to the candidate's actual role — these are examples, not a checklist.

4. GIVE EXAMPLES TO INSPIRE. People forget what they've done. Help them remember by suggesting what MIGHT have happened:
   "Chez Mindflow, en tant que Head of People dans une startup AI en hypergrowth — est-ce que t'as dû gérer des trucs comme : des visas pour des talents internationaux ? des négociations salariales compliquées avec des profils ML ? monter un process de perf review from scratch ?"

5. FRAME THE CONTEXT FIRST. Before asking about achievements, help them describe the SITUATION:
   "Quand t'es arrivé chez Germinal, c'était quoi l'état des lieux ? Combien de personnes, y'avait déjà des process RH ou tu partais de zéro ? C'est important parce que 'monter une équipe de 5 à 50' c'est 10x plus impressionnant que 'gérer une équipe de 50'."

6. ASK ABOUT CHALLENGES, NOT JUST ACHIEVEMENTS:
   "C'était quoi le truc le plus galère dans ce rôle ? Le moment où tu t'es dit 'ok c'est compliqué' — et comment t'as débloqué la situation ?"

7. HELP THEM QUANTIFY WITH BENCHMARKS. People always underestimate their numbers. Give them a reference point:
   "Tu dis que t'as 'amélioré' le process — essaie de mettre un chiffre. Même approximatif. Genre : avant, ça prenait combien de temps / ça coûtait combien / ça touchait combien de personnes ? Et après ton intervention ? Pour un recruteur, 'réduit de 3 semaines à 5 jours' c'est 10x plus puissant que 'amélioré le process'."

8. ONE QUESTION AT A TIME. But make it a RICH question with context and examples that inspire a detailed answer. 2-4 sentences max.

9. REFRAME INTO CV BULLETS. When you have enough detail, propose the bullet:
   "Avec tout ça, on pourrait écrire : 'Structuré le recrutement chez Mindflow (AI, seed→Series A, 5→45 personnes) : 30 hires en 8 mois, time-to-hire moyen de 3 semaines, process de sourcing LinkedIn + cooptation qui a généré 60% des hires'. Ça te parle ?"

10. ABSORB LONG ANSWERS. If they give lots of info, note everything and skip ahead. Never re-ask what they already told you.

11. KEEP IT WARM AND DIRECT. Like a friend who's great at interviews, not a corporate coach.

12. RESPECT USER EDITS. If you see messages starting with "✏️ I edited", the user manually changed something on their CV. This is intentional — respect their choice.

9. EXECUTE CV INSTRUCTIONS IMMEDIATELY. If the user asks to delete, add, move, or modify something on the CV, DO IT via cv_actions. The "target" field MUST contain the company name or section name — NEVER leave it empty.

   FORMAT for cv_actions:
   {{"action": "remove_experience", "target": "Techfugees", "value": "", "index": -1}}
   {{"action": "remove_experience", "target": "Rogervoice", "value": "", "index": -1}}
   {{"action": "add_bullet", "target": "Mindflow", "value": "Built Python automation for HR workflows", "index": -1}}
   {{"action": "remove_education", "target": "Some School", "value": "", "index": -1}}
   {{"action": "merge_experiences", "target": "Toucan Toco", "value": {{"title": "Lead of Community & Data Solutions", "company": "Toucan Toco (data storytelling, Series A)", "dates": "2018 - 2021", "bullets": ["Built and managed the partner community from 0 to 45 active partners", "Designed onboarding program that cut partner ramp-up from 6 weeks to 2"]}}, "index": -1}}

   User: "delete rogervoice and techfugees" → cv_actions: [{{"action": "remove_experience", "target": "Rogervoice"}}, {{"action": "remove_experience", "target": "Techfugees"}}]
   User: "delete about section" → cv_actions: [{{"action": "edit_field", "target": "summary", "value": ""}}]
   User: "merge both toucan toco experiences" → cv_actions: [{{"action": "merge_experiences", "target": "Toucan Toco", "value": {{"title": "combined title", "company": "Toucan Toco (context)", "dates": "earliest - latest", "bullets": ["best bullets from both roles, combined and deduplicated"]}}}}]
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
            generation_config=genai.types.GenerationConfig(max_output_tokens=3000, temperature=0.7, response_mime_type="application/json"),
        )
        data = self._parse_json(response.text)
        return ChatResponse(**data)

    def generate_cv(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage], ui_language: str = "en", tone: str = "startup", target_market: str = "france") -> CVData:
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

6. SUMMARY: 2 sentences MAX. Written like you're introducing yourself at a dinner — not a conference stage.
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
- Every bullet = a concrete action with a number, not a job description
- Contextualize companies: "(SaaS, seed→Series A, 12→45 employees)"
- Include ALL experiences from the profile — calibrate depth by relevance
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
