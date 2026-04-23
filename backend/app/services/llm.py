import json
import os
import re

from mistralai.client import Mistral

from app.models import (
    CoverLetterData, CVData, ChatMessage, ChatResponse, Education,
    GapAnalysis, Offer, Profile, RewrittenExperience,
)

MAX_TOKENS_PER_CALL = 8000  # Reduced from 16K — Flash spends most on thinking, not output


class LLMService:
    def __init__(self, api_key: str | None = None):
        self._api_key = api_key or os.environ.get("MISTRAL_API_KEY", "")
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = Mistral(api_key=self._api_key)
        return self._client

    def _call(self, prompt: str, *, model: str = "mistral-small-latest", max_tokens: int = 3000, temperature: float = 0.7, json_mode: bool = True) -> str:
        """Unified Mistral chat completion call."""
        kwargs = dict(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        response = self.client.chat.complete(**kwargs)
        content = response.choices[0].message.content
        if not content:
            raise ValueError(f"Mistral returned empty response for model={model}")
        return content

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
1. Read the job offer and pick the 2-3 MOST DIFFERENTIATING requirements — the ones that will make or break a candidacy. Ignore generic filler ("team player", "good communication"). Focus on what makes THIS role specific.
2. For each differentiating requirement, find ALL experiences from the profile where the candidate plausibly did related work. Often 2-3 past roles touch the same theme (e.g. employer branding at startup A AND scale-up B; quota attainment in two different sales roles).
3. Write 3-4 SHORT questions. Each question targets the SINGLE highest-leverage gap for the offer. When the same theme applies to multiple relevant experiences, BUNDLE them into one question — the candidate recalls the mental mode once and answers for both roles in the same breath.

STRATEGY — FEWER, SHARPER, BUNDLED:
- You get 3-4 questions total. That's it. Every question must earn its spot.
- Rank candidate themes by (offer relevance × how underdeveloped the current CV is on that theme). Ask only the TOP ones. Skip nice-to-haves entirely.
- **BUNDLE when a theme spans multiple relevant experiences.** If employer branding is key to the offer and the candidate did it at BOTH Mindflow and Germinal, ask ONE bundled question covering both — don't burn two slots on the same thinking pattern.
   ✅ "L'offre parle beaucoup d'employer branding — chez Mindflow et Germinal t'étais en première ligne là-dessus. Qu'est-ce que t'as concrètement mis en place dans chaque boîte, et qu'est-ce qui a marché ?"
   ✅ "Sur la quota — t'as fait combien de % de ton target chez Salesforce, et chez HubSpot ?"
   ❌ Two separate questions "à Mindflow t'as fait quoi en employer branding ?" then "et à Germinal ?" — wasteful, kills a slot each time.
- For non-top themes, the CV rewriter will frame whatever's already on LinkedIn — you don't need to ask.
- Questions should make the user feel like you read the offer AND mapped their whole career to it, not like you're walking a checklist role-by-role.

STAGE CONTEXT — DO NOT ASK:
Headcount, company stage, and team size are collected AFTER the chat via dedicated UI fields in the editor. NEVER ask about headcount, effectifs, company size, or stage in the chat — that data comes from the company context form. Focus your questions on metrics, outcomes, and scope instead.

ROLE-SPECIFIC PROBING — adapt your questions to the candidate's field. Every specialty has metrics that recruiters EXPECT to see. If they're missing, ASK:
- **Engineering/Dev**: tech stack, system scale (requests/s, data volume), architecture decisions, team size, CI/CD, testing, production incidents handled
- **Sales**: quota and attainment (% of target), deal size, pipeline value, sales cycle length, close rate, territory/segment. Benchmark: 120%+ attainment gets attention, single years look lucky — ask for consistency.
- **Marketing**: budget managed, CAC, ROI/ROAS, channels, conversion rates, campaign results with numbers. Benchmark: LTV:CAC above 3:1 is the bar.
- **Product**: user metrics (DAU/MAU, retention, adoption), prioritization method, launch outcomes, A/B test results
- **HR/People**: retention rate, time-to-hire, processes built from scratch, countries/entities managed (headcount comes from the company context form — don't ask)
- **Finance**: budget size, forecast accuracy, audit outcomes, cost savings achieved. SaaS metrics: ARR, NRR, burn multiple, Rule of 40.
- **Operations**: process improvements (before→after), SLAs, throughput, cost reduction
- **Design**: projects shipped, user research method, design system contributions, measurable UX improvements. Portfolio link is mandatory.
- **Data/Analytics**: data volume, pipeline reliability, models deployed, business impact of insights
If the candidate's field isn't listed, think: "What would a hiring manager for THIS role google to benchmark candidates?" — those are your questions.

RULES FOR QUESTIONS:
- Use ACTUAL company names from the profile. NEVER placeholders like [Company A]. Use: Mindflow, Germinal, Sloow, etc.
- The FIRST question: name ALL the relevant experiences for the MOST critical theme in the offer, tie it to the role, and ask one bundled thing.
  Example: "Ce poste HR Ops chez Ami tourne autour du payroll multi-pays et du scaling de la fonction RH — tu l'as fait chez Mindflow ET Germinal. Dans chacune, combien de pays tu gérais et quels process tu as structurés en partant de zéro ?"
- Each question = ONE theme from the offer × ALL relevant experiences that touched it (bundled). Extracts multiple datapoints in one ask.
- GOOD (bundled, tied to offer): "L'offre insiste sur le payroll multi-pays — Mindflow et Germinal, t'étais à combien de pays dans chaque boîte ?"
- GOOD (bundled across theme): "Ami cherche quelqu'un qui a fait de la people analytics — chez Mindflow et chez Germinal, quels KPIs RH tu pilotais ?"
- BAD: broad questions that don't reference the offer
- BAD: single-company questions when the same theme clearly applies to 2+ roles — that's a wasted slot
- 3-4 questions total — ruthlessly prioritized, not comprehensive

Respond in valid JSON only:
{{"matched_skills": ["skills that match"], "gaps": ["the 3-4 differentiating requirements where the profile needs enrichment"], "questions": ["first question naming companies + why they're relevant + specific ask", "question tied to offer requirement X", "question tied to offer requirement Y", "..."]}}

IMPORTANT: Write ALL output in {lang_instruction}. Use REAL company names, NEVER placeholders. Tone: smart friend who read the offer carefully, not a generic career bot."""

        text = self._call(prompt, model="mistral-small-latest", max_tokens=2000, temperature=0.3)
        data = self._parse_json(text)
        # Coerce list fields to flat list[str] — the model occasionally wraps items
        # in dicts like {"question": "..."} despite the prompt asking for strings.
        def _flatten_strs(items):
            out: list[str] = []
            for it in items or []:
                if isinstance(it, str):
                    s = it.strip()
                elif isinstance(it, dict):
                    # grab the first string value we find
                    s = next((str(v).strip() for v in it.values() if isinstance(v, (str, int, float))), "")
                else:
                    s = str(it).strip()
                if s:
                    out.append(s)
            return out
        data["matched_skills"] = _flatten_strs(data.get("matched_skills"))
        data["gaps"] = _flatten_strs(data.get("gaps"))
        data["questions"] = _flatten_strs(data.get("questions"))
        return GapAnalysis(**data)

    def generate_next_question(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage], ui_language: str = "en", known_facts=None, contradictions=None, cv_draft=None) -> ChatResponse:
        # Match the chat to the user's actual writing language, not the UI locale
        detected = self._detect_conversation_lang(messages)
        if detected:
            ui_language = detected
        conversation = self._summarize_conversation(messages)
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
                ctx = ""
                if exp.context:
                    ctx_parts = []
                    if exp.context.sector: ctx_parts.append(f"sector: {exp.context.sector}")
                    if exp.context.stage: ctx_parts.append(f"stage: {exp.context.stage}")
                    if exp.context.headcount_start or exp.context.headcount_end:
                        ctx_parts.append(f"headcount: {exp.context.headcount_start or '?'} → {exp.context.headcount_end or '?'}")
                    if exp.context.team_size: ctx_parts.append(f"team: {exp.context.team_size}")
                    if ctx_parts:
                        ctx = f" [{', '.join(ctx_parts)}]"
                draft_lines.append(f"  [{i}] {exp.title} at {exp.company}{ctx} ({exp.dates})\n{bullets}")
            cv_draft_context = f"""

CURRENT CV DRAFT (this is what the user sees on screen right now):
  Name: {cv_draft.name}
  Title: {cv_draft.title}
  Summary: {cv_draft.summary}
  Experiences:
{chr(10).join(draft_lines)}

IMPORTANT: When the user asks to edit, merge, delete, or modify something on the CV, use the CURRENT CV DRAFT above as your reference — NOT the original LinkedIn profile. You can see exactly what's on their screen. Act on it directly via cv_actions."""

        first_name = profile.name.split()[0] if profile.name else "there"

        # Detect if merge-related keywords appear in the conversation
        merge_keywords = any(kw in conversation.lower() for kw in ["merge", "fusionne", "combine", "regroupe"])

        merge_section = ""
        if merge_keywords:
            merge_section = """
MERGE FORMAT:
{{"action": "merge_experiences", "target": "Company", "value": {{"title": "combined title", "company": "Company (context)", "dates": "earliest - latest", "bullets": ["best bullets from both"]}}, "index": -1}}
MERGE RULES: "merge/combine/fusionne/regroupe" → use "merge_experiences", NEVER two "remove_experience". "value" MUST include "bullets" from BOTH experiences. "target" = company name only.
"""

        # Build the list of experiences with relevance to the offer
        exp_summary = []
        for exp in profile.experiences:
            exp_summary.append(f"- {exp.title} at {exp.company} ({exp.dates})")

        # Count how many questions have been asked (assistant messages, excluding error toasts)
        prior_questions = [m.content for m in messages if m.role == "assistant" and not m.content.startswith("⚠️")]
        question_count = len(prior_questions)
        remaining = max(0, 6 - question_count)
        urgency = ""
        if remaining <= 0:
            urgency = "\n\n⚠️ YOU MUST FINISH NOW. Set is_complete=true in your response. Say 'Je lance la génération.' You have asked enough questions."
        elif remaining <= 2:
            urgency = f"\n\n⚠️ Only {remaining} question(s) left. Wrap up soon — ask only what's critical."

        # Explicit "do-not-repeat" section — the LLM otherwise anchors on gaps[0] every turn
        already_asked_block = ""
        if prior_questions:
            numbered = "\n".join(f"  {i+1}. {q.strip()[:400]}" for i, q in enumerate(prior_questions))
            already_asked_block = f"""

⚠️ QUESTIONS YOU ALREADY ASKED (DO NOT REPEAT — NEW THEME REQUIRED):
{numbered}

Your next question MUST target a DIFFERENT theme from the ones above. Do not reuse the same opening framing ("L'offre met un fort accent sur…", etc.). If you've covered the top gap, move to the next one from THE OFFER NEEDS list. If every gap on the list has been addressed, set is_complete=true and stop."""

        prompt = f"""You're helping {first_name} build a killer CV for: {offer.title} at {offer.company}.
QUESTIONS ASKED SO FAR: {question_count}/6. {f"Remaining: {remaining}." if remaining > 0 else "TIME TO FINISH."}{urgency}

THE OFFER NEEDS: {", ".join(gap_analysis.gaps)}

{first_name}'S EXPERIENCES:
{chr(10).join(exp_summary)}
{knowledge_context}{cv_draft_context}
{already_asked_block}

CONVERSATION SO FAR:
{conversation}

YOUR GOAL: The CV already has their LinkedIn info. Your job is to FILL THE GAPS between what's on the CV and what THIS SPECIFIC offer needs. Every question must earn its slot — you only have 6. Ask questions that extract:
- Concrete numbers and metrics (budget, results, %, ratios)
- Achievements that match what THIS offer is looking for
- Their personal approach (what they do differently)

DO NOT ASK about headcount, company stage, team size, or "effectifs" — that data is collected AFTER the chat via dedicated editor fields. Asking about it here is redundant and wastes questions.

HOW TO HAVE THE CONVERSATION — RUTHLESS PRIORITY + BUNDLING:
- Before you ask anything, mentally rank the themes in the offer by leverage: which 3-4 gaps, if filled with real data, would most transform this CV for THIS offer?
- Ask about the HIGHEST-leverage theme first. Not the "most relevant experience" — the HIGHEST-LEVERAGE THEME. An offer-critical theme may touch multiple experiences.
- **BUNDLE across experiences when the theme applies to 2+ roles.** If employer branding is critical and they did it at BOTH Mindflow AND Germinal, ask ONE question covering both — they recall the same mental pattern once and give you two datapoints.
   ✅ "L'offre insiste sur l'employer branding — tu l'as fait chez Mindflow et chez Germinal. Dans chacune, qu'est-ce que t'as mis en place qui a vraiment bougé l'aiguille ?"
   ✅ "Sur le quota attainment — chez Salesforce ET chez HubSpot, t'as fait combien de % de ton target chaque année ?"
   ❌ Two separate questions for the same theme across two companies. That's two slots burned on one thinking pattern.
- Questions stay SHORT — 1-3 sentences. Bundling adds datapoints, not length.
- If the user already answered something in a previous message, DON'T re-ask — use the info and move forward.
- When the user gives you info, IMMEDIATELY write strong CV bullets via cv_actions (add_bullet or replace_bullet) for EACH company they mentioned — a bundled answer produces multiple cv_actions.
- 3-4 questions total is plenty if you bundle well. Quality × leverage over quantity.
- Accept "I don't know" or approximate numbers — write the bullet anyway with what you have.

CV ACTIONS — use these to update the CV in real time:
{{"action": "add_bullet", "target": "Company Name", "value": "Scaled team from 5 to 25 in 12 months, hiring across 3 countries", "index": -1}}
{{"action": "replace_bullet", "target": "Company Name", "value": "better version of existing bullet", "index": 0}}
{{"action": "edit_field", "target": "summary", "value": "new 2-sentence summary"}}

🚫 NO FABRICATION IN CV ACTIONS — MARK GAPS INSTEAD:
When you write bullet text in cv_actions, obey the same rule as the CV generator:
- Use ONLY facts from the profile or from what the user actually said in this conversation.
- Do NOT invent numbers, metrics, headcount, funding, tool names, countries, durations, or specific achievements.
- When a bullet would be stronger with a fact the user didn't give, insert a {{GAP: short question — optional e.g. example}} token in the CV's language.
  ❌ value: "Scaled the team from 5 to 25 in 12 months" (fabricated)
  ✅ value: "Scaled the team {{GAP: starting → ending headcount, over how long? e.g. 5 → 25 in 12 months}}"
- Use the single-brace {{GAP: ...}} syntax exactly. Max 1-2 GAPs per bullet. Never wrap the entire bullet in a GAP.
{merge_section}
WHEN DONE: set is_complete=true. You're done when you've covered the 2-3 highest-leverage THEMES from the offer with concrete data (bundled across experiences where relevant). Don't fish for extras — stop when the top themes are filled.

Respond in JSON: {{"message": "your question", "is_complete": false, "cv_actions": [], "progress": 0-100}}

FORMAT the "message" field with Markdown for readability (the UI renders it):
- Use **bold** for the key word(s) the user should focus on
- Use bullet lists (`- item`) when asking about multiple experiences or listing 2+ points — one bullet per experience/item, not a run-on sentence
- Add a blank line between a lead-in sentence and a bullet list
- Keep it scannable: short lines, never a wall of text
- Don't overdo it — plain prose is fine for single-question turns; use lists when there are genuinely multiple items

Write in {lang_instruction}. Use first name only. Be warm and direct."""

        text = self._call(prompt, model="mistral-small-latest", max_tokens=1200, temperature=0.6)
        data = self._parse_json(text)
        return ChatResponse(**data)

    def generate_cv(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage], ui_language: str = "en", tone: str = "startup", target_market: str = "france") -> CVData:
        # Override the frontend-supplied locale with what the user actually wrote
        # in the chat — if they typed in French with the UI in English, the CV
        # should still come out in French (translation happens in a second pass).
        detected = self._detect_conversation_lang(messages)
        if detected:
            ui_language = detected
        conversation = self._summarize_conversation(messages)

        prompt = f"""You write CVs the way someone would explain their work to a junior colleague at the startup — direct, specific, with energy and professional depth. Not dumbed down. Not corporate. Just how a competent professional talks about what they actually did, without posturing. That honesty IS what impresses recruiters — because 200 other CVs sound like ChatGPT wrote them.

🚫 ABSOLUTE RULE — NO FABRICATION, MARK GAPS INSTEAD:
You may ONLY write facts that come from two sources:
  1. The CANDIDATE PROFILE below (LinkedIn data).
  2. The CONVERSATION TRANSCRIPT below.
If a fact is not in one of those two sources, it does NOT go in the CV as a stated fact.

You MUST NOT invent:
- Numbers, percentages, metrics ("30 hires", "118% of quota", "reduced churn by 20%")
- Headcount / stage transitions ("5→45 people", "seed→Series A") unless the candidate stated them
- Funding amounts ("raised €8M") unless stated
- Tool names ("Deel", "BambooHR", "Salesforce") unless stated
- Country lists ("FR/US/UK/DE") unless listed by the candidate
- Durations, cycle times, team sizes, or any quantity the user didn't give
- Specific achievements ("designed the onboarding program") unless stated

WHAT TO DO WHEN A BULLET WOULD BE STRONGER WITH A FACT THE USER DIDN'T PROVIDE:
Mark the missing piece with the special token {{GAP: short question in the user's language — optional example }}.
These tokens will be rendered in a highlighted color in the editor so the user knows exactly what to fill in.

Examples (FR):
  ❌ FABRICATION: "Recrutement structuré: 30 hires en 8 mois, time-to-hire divisé par 2"
  ✅ GROUNDED + GAP: "Recrutement structuré {{GAP: combien de hires sur quelle période ? ex: 30 hires en 8 mois}}, time-to-hire {{GAP: combien de semaines avant/après ? ex: 6 → 3 semaines}}"

Examples (EN):
  ❌ FABRICATION: "Built multi-country payroll across FR/US/UK"
  ✅ GROUNDED + GAP: "Built multi-country payroll {{GAP: which countries exactly? e.g. FR/US/UK}}"
  ❌ FABRICATION: "Scaled the team from 5 to 25 in 12 months"
  ✅ GROUNDED + GAP: "Scaled the team {{GAP: starting headcount → ending headcount, over how long? e.g. 5 → 25 in 12 months}}"

Rules for the GAP token:
- Use single curly braces exactly: {{GAP: ...}}  (one opening brace and one closing brace around GAP:)
- Keep the question short and concrete — the user must know what to type
- Include a small example after "e.g." / "ex:" when it would clarify format
- Write the gap question in the same language as the CV (FR if CV is FR, EN if EN)
- Use GAP tokens sparingly: max 1-2 per bullet. A CV made of 80% placeholders is useless.
- NEVER wrap the entire bullet in a GAP — there must be real grounded content around it

Being SPECIFIC means specific about the REAL work. A vague truthful bullet with a clear GAP marker for the missing metric beats a fabricated precise one.

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

9. SKILLS: This is the MOST ABUSED section on CVs. Follow these rules strictly:
   a) NO generic soft skills: "Communication", "Leadership", "Problem-solving", "Teamwork" are BANNED. They say nothing.
   b) ONLY concrete, verifiable skills that appeared in the experience bullets above.
   c) Format each skill as "Skill (proof)" — e.g., "Multi-country payroll (FR/US/UK/DE)" not just "Payroll"
   d) Include tools/platforms BY NAME: "Deel", "BambooHR", "Salesforce" — not "HRIS tools"
   e) Max 8-10 skills. If you can't prove it from the bullets above, don't list it.
   ✅ ["Multi-country payroll (4 countries)", "HRIS: Deel, BambooHR", "Onboarding design (5-day ramp)", "Team scaling (2→8)", "Hypergrowth ops (seed to Series B)"]
   ❌ ["Leadership", "Communication", "Strategic thinking", "Problem-solving", "HR Management"]

10. INCLUDE ALL EXPERIENCES — but calibrate depth. Relevant roles get 3-4 rich bullets. Less relevant roles get 1 line that finds an angle connecting to the target job.
   For example, if someone was a Growth founder and is applying for HR Ops: "Founded Wagmi Family — recruited 30+ growth/sales profiles for startups, developed a deep understanding of what makes teams work from the hiring side."
   NEVER skip an experience entirely — unexplained gaps look worse than a brief mention.

11. DETECT GAPS in the timeline. If there's a gap > 6 months between roles, address it naturally (sabbatical, entrepreneurship, travel, etc.) — the chat should have uncovered this.

12. HIGHLIGHT YEARS OF EXPERIENCE. Include total years in the summary. "8+ years in HR/People ops across 4 startups" is more powerful than listing dates.

13. Write in the language of the job offer.

14. ATS & MATCH ANALYSIS:
   - match_score (0-100): how well this CV would pass an ATS filter for this specific offer. Check: are the exact keywords from the offer present? Are job titles aligned? Are required skills explicitly mentioned?
   - strengths: 2-3 things that make this CV strong for THIS role (be specific, reference the offer)
   - improvements: 1-2 concrete things the candidate could still add or change to score higher

Respond in valid JSON only:
{{"name": "{profile.name}", "title": "specific title that matches the offer — not generic", "email": "{profile.email}", "location": "{profile.location}", "summary": "2 punchy sentences — specific, not corporate", "experiences": [{{"title": "job title", "company": "company name", "dates": "dates", "bullets": ["micro-story bullet with real numbers", "another specific achievement"]}}], "education": [{{"degree": "...", "school": "...", "year": "..."}}], "skills": ["only relevant skills, no padding"], "language": "en or fr", "match_score": 78, "strengths": ["Strong HR ops experience across multiple startups", "Multi-country payroll expertise matches requirement"], "improvements": ["No explicit people analytics experience mentioned", "Could highlight more HRIS tool proficiency"]}}"""

        text = self._call(prompt, model="mistral-large-latest", max_tokens=MAX_TOKENS_PER_CALL, temperature=0.4)
        data = self._parse_json(text)
        return CVData(**data)

    def draft_cv(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage], ui_language: str = "en", target_market: str = "france") -> CVData:
        """Generate a quick draft CV from whatever info is available so far."""
        detected = self._detect_conversation_lang(messages)
        if detected:
            ui_language = detected
        conversation = "\n".join(f"{m.role}: {m.content}" for m in messages[-6:])  # only recent messages for speed

        prompt = f"""Rewrite this CV to match the target job offer. Write like the candidate would explain their job to someone at a market — plain, specific, energetic, no corporate filler. Not dumbed down — just honest and concrete.

🚫 ABSOLUTE RULE — NO FABRICATION, MARK GAPS INSTEAD:
You may ONLY write facts that come from the CANDIDATE PROFILE (LinkedIn data) or the CONVERSATION below.
You MUST NOT invent numbers, metrics, headcount, funding, tool names, country lists, durations, or specific achievements.
When a bullet would be stronger with a fact the user didn't provide, mark it with {{GAP: short question in the CV's language — optional e.g. example }}.
  ❌ "Scaled the team from 5 to 25 in 12 months" (fabricated)
  ✅ "Scaled the team {{GAP: starting → ending headcount, over how long? e.g. 5 → 25 in 12 months}}"
  ❌ "Built multi-country payroll across FR/US/UK" (fabricated)
  ✅ "Built multi-country payroll {{GAP: which countries? e.g. FR/US/UK}}"
Rules: single curly braces {{GAP: ...}}, short concrete question, optional "e.g." example, same language as the CV, max 1-2 GAPs per bullet, never wrap a whole bullet in a GAP.

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

        text = self._call(prompt, model="mistral-small-latest", max_tokens=8000, temperature=0.3)
        data = self._parse_json(text)
        return CVData(**data)

    def translate_cv(self, cv_data: CVData, target_language: str) -> CVData:
        """Translate a CV to another language while preserving structure and quality."""
        cv_json = cv_data.model_dump_json()
        lang_name = "French" if target_language == "fr" else "English"

        prompt = f"""Translate this CV to {lang_name}. Keep the EXACT same structure, numbers, company names, and formatting. Only translate the text content. Do NOT add or remove any information. Do NOT make it more "corporate" — keep the same tone and style.

CURRENT CV (JSON):
{cv_json}

Respond in valid JSON only, same structure, translated to {lang_name}. Set "language" to "{target_language}"."""

        text = self._call(prompt, model="mistral-small-latest", max_tokens=MAX_TOKENS_PER_CALL, temperature=0.2)
        data = self._parse_json(text)
        return CVData(**data)

    def generate_cover_letter(self, profile: Profile, offer: Offer, cv_data: CVData, messages: list[ChatMessage], ui_language: str = "en", tone: str = "startup", target_market: str = "france") -> CoverLetterData:
        conversation = self._summarize_conversation(messages)

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

        text = self._call(prompt, model="mistral-large-latest", max_tokens=MAX_TOKENS_PER_CALL, temperature=0.5)
        data = self._parse_json(text)
        return CoverLetterData(**data)

    def _detect_conversation_lang(self, messages: list[ChatMessage]) -> str | None:
        """Return 'fr' or 'en' based on the user's actual messages, or None if
        there's not enough signal. Used to override the frontend-supplied
        ui_language when the UI locale and chat language diverge (e.g. UI in
        English but the user types in French)."""
        user_text = " ".join(m.content for m in messages if m.role == "user").lower()
        if len(user_text) < 20:
            return None
        fr = 0
        en = 0
        # Accented chars are a strong French signal — English never uses them
        if any(ch in user_text for ch in "éèêàâùûçîïôœ"):
            fr += 3
        padded = f" {user_text} "
        fr_stopwords = (" je ", " tu ", " j'", " c'", " n'", " qu'", " pour ", " avec ",
                        " chez ", " pas ", " très ", " mais ", " donc ", " est ",
                        " suis ", " sont ", " était ", " alors ", " aussi ", " oui ",
                        " non ", " faire ", " fait ", " dans ", " sur ")
        en_stopwords = (" i ", " you ", " the ", " and ", " with ", " for ", " very ",
                        " at ", " have ", " they ", " their ", " our ", " but ",
                        " was ", " were ", " is ", " am ", " yes ", " no ",
                        " doing ", " done ", " in ", " on ")
        for w in fr_stopwords:
            if w in padded:
                fr += 1
        for w in en_stopwords:
            if w in padded:
                en += 1
        if fr > en and fr >= 2:
            return "fr"
        if en > fr and en >= 2:
            return "en"
        return None

    def _summarize_conversation(self, messages: list[ChatMessage], recent_count: int = 4) -> str:
        """Summarize a conversation, keeping the last `recent_count` messages verbatim."""
        if len(messages) > recent_count + 2:
            early = messages[:-recent_count]
            recent = messages[-recent_count:]
            summary_parts = [f"- User said: {m.content[:150]}" for m in early if m.role == "user"]
            return "EARLIER (summary):\n" + "\n".join(summary_parts) + "\n\nRECENT:\n" + "\n".join(f"{m.role}: {m.content}" for m in recent)
        return "\n".join(f"{m.role}: {m.content}" for m in messages)

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
            "startup": """Direct, confident, action-oriented. Short punchy dashes, implied first-person, informal. Show scrappiness and ownership.
Examples:
- "Built recruitment pipeline from scratch — 30 hires in 8 months"
- "Payroll in 4 countries, set up from zero while company tripled"
- "Shipped v1 in 6 weeks with 2 engineers, 10k users month one" """,
            "corporate": """Polished and structured but NOT generic. Full sentences, formal action verbs — "Led" not "Built". Still use specific numbers and stories.
Examples:
- "Led the development of a recruitment pipeline, resulting in 30 successful hires within 8 months"
- "Managed multi-country payroll operations across 4 jurisdictions during a period of 3x headcount growth"
- "Directed the end-to-end delivery of the platform's first release, achieving 10,000 users within 30 days" """,
            "creative": """Bold, slightly unconventional. Allow personality, unconventional framing. Can break format rules. Show personality.
Examples:
- "Turns out recruiting 30 people in 8 months is mostly about knowing what questions NOT to ask"
- "Set up payroll in 4 countries — the spreadsheet phase was scarier than the actual compliance"
- "Shipped v1 with a team so small we didn't need a Slack channel" """,
            "minimal": """Ultra-concise. Max 8 words per bullet, telegraphic. Pure signal, zero fluff.
Examples:
- "Recruitment pipeline: 30 hires, 8 months"
- "Multi-country payroll: FR/US/UK/DE"
- "v1 shipped: 6 weeks, 10k users" """,
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
        cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            # Fix truncated JSON: close unterminated strings and brackets
            fixed = cleaned
            # Close unterminated strings
            if fixed.count('"') % 2 == 1:
                fixed += '"'
            # Close open brackets/braces
            open_braces = fixed.count("{") - fixed.count("}")
            open_brackets = fixed.count("[") - fixed.count("]")
            fixed += "]" * max(0, open_brackets)
            fixed += "}" * max(0, open_braces)
            # Remove trailing commas again after fixing
            fixed = re.sub(r",\s*([}\]])", r"\1", fixed)
            return json.loads(fixed)
