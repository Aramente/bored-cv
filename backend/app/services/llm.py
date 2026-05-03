import json
import logging
import os
import re

from mistralai.client import Mistral

from app.models import (
    AgentBrief, AnswerVerdict, BriefQuestion, CoverLetterData, CVData,
    ChatMessage, ChatResponse, Education, GapAnalysis, Offer, Profile,
    RewrittenExperience, StrongestExistingMatch, ToneSamples,
    UndersellingItem, UnspokenEvidence, WeakestClaim,
)
from app.services.mistral_usage import notify_quota_hit, record_usage

MAX_TOKENS_PER_CALL = 8000  # Reduced from 16K — Flash spends most on thinking, not output


# Whitelist of CV paths the LLM is allowed to substitute into. Anything off
# this list is rejected before traversal — a defence against an attacker
# convincing the LLM to write into arbitrary fields (e.g. `language` to flip
# locale, `match_score` to pin a perfect rating). The fields below are the only
# ones a grammar pass should ever touch.
_ALLOWED_SUBSTITUTION_PATH = re.compile(
    r"^("
    r"name|title|summary|location|"
    r"experiences\.\d+\.(title|company|dates|exitReason|contractType|bullets\.\d+)|"
    r"education\.\d+\.(degree|school|year)|"
    r"skills\.\d+|languages\.\d+|"
    r"strengths\.\d+|improvements\.\d+"
    r")$"
)


# Stopwords filtered out before grounding a gap against the offer text. These
# are words that appear in nearly every job posting and would let any gap pass
# the substring check (e.g. "team", "experience", "skills") — we want the
# grounding to fire on domain-specific tokens, not connective tissue.
_GAP_GROUNDING_STOPWORDS = frozenset({
    "ability", "across", "areas", "based", "being", "build", "building",
    "candidate", "challenges", "company", "context", "culture", "deliver",
    "delivery", "design", "developing", "different", "drive", "driven",
    "ensure", "every", "experience", "experiences", "expertise", "field",
    "focus", "fully", "future", "great", "growth", "help", "high", "hire",
    "hiring", "including", "industry", "internal", "join", "knowledge",
    "level", "looking", "manage", "manager", "managers", "managing",
    "market", "matter", "needs", "offer", "offers", "operate", "opportunity",
    "people", "performance", "person", "process", "processes", "product",
    "production", "professional", "project", "projects", "quality", "really",
    "results", "review", "right", "role", "roles", "shape", "skills",
    "specific", "stakeholder", "stakeholders", "strong", "support",
    "system", "systems", "talent", "talents", "teams", "their",
    "things", "thinking", "throughout", "together", "tools", "topics",
    "track", "understand", "various", "where", "which", "while", "within",
    "working", "world", "years", "yourself",
})


def _drop_ungrounded_gaps(
    gaps: list[str], questions: list[str], offer_description: str
) -> tuple[list[str], list[str]]:
    """Drop gaps whose content words don't appear anywhere in the offer text.

    A gap is "grounded" if it shares at least one ≥6-character content word
    (alphabetic, not in the stopword list) with the offer description, matched
    case-insensitively as a substring. This catches LLM hallucinations where
    the model invents a theme that isn't anywhere in the requirements — most
    famously DEI/diversity asks on roles whose only DEI mention is in the
    "About Company" boilerplate (or, post-#1 fix, isn't even there at all).
    Questions whose text overlaps with a dropped gap are also removed so the
    chat doesn't open on the phantom theme.
    """
    text = (offer_description or "").lower()
    if not text:
        return gaps, questions

    def _content_words(s: str) -> list[str]:
        return [
            w for w in re.findall(r"[a-zA-Zàâäéèêëïîôöùûüÿç]+", s.lower())
            if len(w) >= 6 and w not in _GAP_GROUNDING_STOPWORDS
        ]

    kept_gaps: list[str] = []
    dropped_gaps: list[str] = []
    for gap in gaps:
        words = _content_words(gap)
        if not words:
            # Gap is all stopwords / fragments — keep it (the model gave us
            # something terse but it might still be valid). Conservative.
            kept_gaps.append(gap)
            continue
        if any(w in text for w in words):
            kept_gaps.append(gap)
        else:
            dropped_gaps.append(gap)

    if not dropped_gaps:
        return gaps, questions

    # Strip questions tied to a dropped gap. We treat a question as "tied" if
    # it shares a content word with the dropped gap and that word is NOT in
    # any kept gap — otherwise the question is ambiguous and we keep it.
    kept_words = {w for g in kept_gaps for w in _content_words(g)}
    kept_questions: list[str] = []
    for q in questions:
        q_words = set(_content_words(q))
        contaminating = False
        for dg in dropped_gaps:
            shared = q_words & set(_content_words(dg))
            if shared and not (shared & kept_words):
                contaminating = True
                break
        if not contaminating:
            kept_questions.append(q)
    return kept_gaps, kept_questions


def _hypothesis_grounded(hypothesis: str, cv_text: str, offer_text: str) -> bool:
    """Same grounding rule as _drop_ungrounded_gaps but for an
    AgentBrief.unspokenEvidenceToProbe[].hypothesis. The hypothesis
    must share at least one ≥6-char content word with the CV text or
    the offer text — otherwise it's a model hallucination ("diversity
    sourcing" on a tech role with no DEI mention anywhere) and we
    drop it before the chat opens on the phantom theme.
    """
    text_corpus = (cv_text + " " + offer_text).lower()
    if not text_corpus.strip():
        return True  # nothing to check against — be permissive
    words = [
        w for w in re.findall(r"[a-zA-Zàâäéèêëïîôöùûüÿç]+", (hypothesis or "").lower())
        if len(w) >= 6 and w not in _GAP_GROUNDING_STOPWORDS
    ]
    if not words:
        return True  # all stopwords / fragments — keep it conservatively
    return any(w in text_corpus for w in words)


def _apply_substitution(cv_dict: dict, path: str, old: str, new: str) -> bool:
    """Walk a dot-path like 'experiences.2.bullets.3' into cv_dict and do a
    literal `old` → `new` replace on the string at that path. Returns True if
    the path resolved to a string AND `old` was found verbatim in it.

    Used by LLMService.apply_grammar_fixes to apply audit substitutions safely:
    if the LLM hallucinates a path or an `old` substring that isn't actually
    there, the swap is skipped instead of corrupting the CV. Paths must match
    the allowlist above — non-grammar fields (match_score, email, language…)
    are off-limits even if the LLM tries to target them."""
    if not path or not _ALLOWED_SUBSTITUTION_PATH.match(path):
        return False
    parts = path.split(".") if path else []
    if not parts:
        return False
    node = cv_dict
    for p in parts[:-1]:
        if isinstance(node, list):
            try:
                idx = int(p)
            except ValueError:
                return False
            if idx < 0 or idx >= len(node):
                return False
            node = node[idx]
        elif isinstance(node, dict):
            if p not in node:
                return False
            node = node[p]
        else:
            return False
    last = parts[-1]
    if isinstance(node, list):
        try:
            idx = int(last)
        except ValueError:
            return False
        if idx < 0 or idx >= len(node):
            return False
        current = node[idx]
        if not isinstance(current, str) or old not in current:
            return False
        node[idx] = current.replace(old, new, 1)
        return True
    if isinstance(node, dict):
        current = node.get(last)
        if not isinstance(current, str) or old not in current:
            return False
        node[last] = current.replace(old, new, 1)
        return True
    return False


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
        """Unified Mistral chat completion call. Tracks monthly token usage and
        fires ntfy alerts at 50/75/90% of MISTRAL_MONTHLY_TOKEN_BUDGET (default 1B).
        Surfaces a separate ntfy on 429 (per-minute throttle or quota exhausted)."""
        kwargs = dict(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        try:
            response = self.client.chat.complete(**kwargs)
        except Exception as exc:
            # Mistral SDK exception types vary; the cheapest reliable detection
            # is the status code if surfaced, falling back to a substring check.
            status = getattr(exc, "status_code", None) or getattr(getattr(exc, "response", None), "status_code", None)
            if status == 429 or "429" in str(exc):
                notify_quota_hit(str(exc))
            raise
        try:
            usage = getattr(response, "usage", None)
            if usage is not None:
                record_usage(int(getattr(usage, "total_tokens", 0) or 0))
        except Exception:
            logging.exception("mistral_usage: usage extraction failed")
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
1. Read the job offer and pick the 2-3 MOST DIFFERENTIATING requirements — the ones that will make or break a candidacy. A "differentiating requirement" must name a CONCRETE skill, technology, metric, system, domain, market, seniority level, or process. IGNORE generic culture/values/about-the-company language: phrases like "diverse workforce", "team player", "passion for X", "fast-paced environment", "low-ego", "collaborative", "mission-driven", "innovative", or any sentence that comes from an "About <company>" preamble are NOT differentiating requirements — skip them entirely. If the offer's only mention of a theme is in a culture/values sentence, that theme is OFF-LIMITS for gaps and questions.
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

        # Grounding backstop: drop any gap that can't be tied back to a content
        # word actually present in the offer. Even with the prompt directive,
        # the model occasionally invents themes ("diversity sourcing" on a pure
        # tech-recruiting role) that have no anchor in the requirements text.
        # If a gap shares no ≥6-char content word with the offer, it's a
        # hallucination and gets dropped — this also auto-removes the matching
        # questions so the chat never opens on a phantom theme.
        data["gaps"], data["questions"] = _drop_ungrounded_gaps(
            data["gaps"], data["questions"], offer.description
        )
        return GapAnalysis(**data)

    def agent_brief(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, ui_language: str = "en") -> AgentBrief:
        """Pre-chat diagnostic that fuses recruiter-as-gatekeeper and agent-
        as-seller views. Drives every chat question downstream — replaces
        theme-ranking. Mistral-small, JSON mode. ~1s wallclock.

        Output is filtered through the same grounding pass as analyze()
        so unspoken-evidence hypotheses can't reintroduce hallucinated
        themes (the Session 16 three-layer defense extends to the brief).
        """
        lang = "French" if ui_language == "fr" else "English"
        # Number experiences so the model can refer to them by index
        # (irrelevantExperiences, strongestExistingMatch.experienceIndex,
        # underselling.location like "experiences[0].bullets[2]").
        exps = []
        for i, e in enumerate(profile.experiences):
            bullets = "\n".join(f"      [{i}.bullets[{j}]] {b}" for j, b in enumerate(e.bullets))
            exps.append(
                f"  [{i}] {e.title} at {e.company} ({e.dates})\n"
                f"      description: {e.description}\n{bullets}"
            )
        gaps_block = ", ".join(gap_analysis.gaps) if gap_analysis.gaps else "(none — analyze() returned empty)"
        prompt = f"""You are this candidate's AGENT and a SENIOR RECRUITER at the same time. Two voices, one job: position them to win this offer.

AGENT mode (you're on their side, like a sports agent):
- Read the CV and the offer. Where is the candidate UNDERSELLING themselves? Helper-voice ("helped with", "supported", "contributed to") for work they actually OWNED. Vague phrasing for outcomes that were sharp.
- What's THE PITCH — one sentence, how you'd sell this candidate to the hiring team. Not a summary. The lead.
- What's THE BET — the single strongest angle that wins this role. Sharper than the pitch.
- What's the MARKET READ — what wins this specific role at this specific company stage. A Series B growth role needs a 0→$5M operator, not a $50M optimizer. Name the stage-specific edge.

RECRUITER mode (you're the gatekeeper):
- What's the HIRING-MANAGER FEAR — the unspoken risk they have about this candidate. Too senior, too junior, no startup experience, no enterprise, gap year, 4 jobs in 3 years, agency-only background, etc. Name it concretely.
- Which experiences are IRRELEVANT to this offer — the recruiter would skim past them. List indices.
- What's the WEAKEST CLAIM on the CV — the bullet a recruiter would push back on first. Generic, unquantified, or unverifiable.
- What CLICHÉS would weaken the candidate's ANSWERS in the chat? Concrete phrases the chat must banlist: "led the team", "drove growth", "optimized performance", "helped with", "supported", "contributed to", "responsible for", etc. Pick the ones most likely to come up given this candidate's writing style on their CV.

UNSPOKEN EVIDENCE (this is the high-leverage move):
- The offer mentions X. The CV doesn't mention X — but a role/company/timeframe on the CV makes it LIKELY the candidate touched X anyway. Probe it.
- Example: offer asks "merchant onboarding lead", CV shows "Stripe 2021–2023". Hypothesis: they likely shipped something at Stripe that touched merchants. Question seed: "while at Stripe, did anything you ship touch merchant onboarding or payment activation?"
- 2–4 hypotheses MAX. They must be specific to this candidate × this offer. Generic ones get filtered out.

THE 3 QUESTIONS (this is the chat's question budget):
- Question 1 — DEEPEN THE BET: dig into the strongest existing match. Push from generic to specific. Force a metric/outcome/scope.
- Question 2 — ADDRESS THE FEAR: name the hiring manager's unspoken concern and ask how the candidate bridges it. Allowed to feel pointed; politeness here is harmful.
- Question 3 — SURFACE UNSPOKEN EVIDENCE: ask about the highest-leverage hypothesis from `unspokenEvidenceToProbe`. Direct, references the company/role.

CANDIDATE PROFILE:
Name: {profile.name}
Title: {profile.title}
Summary: {profile.summary}
Skills: {", ".join(profile.skills) or "(none listed)"}
Experiences:
{chr(10).join(exps) if exps else "  (none)"}

JOB OFFER:
Title: {offer.title}
Company: {offer.company}
Description: {offer.description}
Requirements: {self._format_requirements(offer)}

ALREADY-DETECTED GAPS (use these as priorities):
{gaps_block}

Output VALID JSON ONLY in this exact shape:
{{
  "thePitch": "1-sentence pitch — agent voice",
  "theBet": "1-sentence — the single strongest angle",
  "marketRead": "1-sentence — stage/segment-specific edge",
  "hiringManagerFear": "1-sentence — the unspoken HM risk",
  "strongestExistingMatch": {{
    "experienceIndex": 0,
    "why": "why this is the closest analog",
    "currentlyUndersoldAs": "what the bullet says today",
    "shouldBePitchedAs": "the agent rewrite"
  }},
  "underselling": [
    {{"location": "experiences[0].bullets[2]", "currentText": "...", "whyUndersold": "...", "agentRewriteSeed": "..."}}
  ],
  "weakestClaim": {{
    "location": "experiences[1].bullets[0]",
    "text": "...",
    "whyWeak": "generic | unquantified | unverifiable",
    "needs": "metric | scope | outcome | timeframe"
  }},
  "unspokenEvidenceToProbe": [
    {{"experienceIndex": 0, "hypothesis": "they likely touched X — offer asks for X", "questionSeed": "concrete question"}}
  ],
  "irrelevantExperiences": [3, 4],
  "clichesToKillInAnswers": ["led the team", "drove growth", "..."],
  "the3Questions": [
    {{"angle": "deepen the bet", "question": "..."}},
    {{"angle": "address the fear", "question": "..."}},
    {{"angle": "surface unspoken evidence", "question": "..."}}
  ]
}}

CRITICAL RULES:
- Use REAL company names from the profile. NEVER placeholders.
- the3Questions: each ≤2 sentences, references a specific company/experience by name.
- underselling: only flag bullets actually present on the CV. Quote `currentText` verbatim.
- unspokenEvidenceToProbe: only hypothesize evidence whose hypothesis-words appear SOMEWHERE in either the CV or the offer text. No invented domains.
- Never repeat the offer's surface requirements as findings — go below them.

Write all string fields in {lang}."""

        text = self._call(prompt, model="mistral-small-latest", max_tokens=2400, temperature=0.4)
        data = self._parse_json(text)
        # Filter unspoken-evidence hypotheses through the same grounding pass
        # we use for gap analysis. Drops invented themes (e.g. "diversity
        # sourcing" on a pure tech role) that don't anchor anywhere.
        try:
            unspoken = data.get("unspokenEvidenceToProbe") or []
            cv_text = self._cv_text_corpus(profile)
            offer_text = (offer.description or "") + " " + " ".join(
                r.text for r in (offer.requirements or [])
            )
            kept = []
            for item in unspoken:
                hypo = (item or {}).get("hypothesis", "") if isinstance(item, dict) else ""
                if not hypo:
                    continue
                if _hypothesis_grounded(hypo, cv_text, offer_text):
                    kept.append(item)
            data["unspokenEvidenceToProbe"] = kept
        except Exception:
            logging.exception("agent_brief: grounding filter failed; passing brief through")
        try:
            return AgentBrief(**data)
        except Exception:
            logging.exception("agent_brief: validation failed, returning empty brief")
            return AgentBrief()

    def classify_answer(self, question: str, answer: str, cliches: list[str] | None = None, ui_language: str = "en") -> AnswerVerdict:
        """Classify a user's chat answer for the pushback gate. One of:
        - specific: accept and move on
        - generic: clichéd, could be on any CV
        - underselling: helper-voice for owner-work
        - evasive: skipped the structural ask
        Mistral-small, ~300 tokens. Called once per turn before
        generate_next_question decides whether to push back."""
        lang = "French" if ui_language == "fr" else "English"
        cliche_block = ""
        if cliches:
            cliche_block = "\n\nKNOWN CLICHÉS TO PENALISE (banned phrases for this candidate):\n" + "\n".join(f"- {c}" for c in cliches[:20])
        prompt = f"""You are a senior recruiter judging a candidate's answer in a CV-coaching chat. Classify ONE answer.

QUESTION: {question}

ANSWER: {answer}{cliche_block}

VERDICTS:
- "specific": gives a concrete metric, scope, outcome, timeframe, OR a verifiable detail. Accept it.
- "generic": every PM/AE/eng would say the same thing. "Led the team and improved performance." "Drove growth." No anchor. Push back.
- "underselling": helper-voice for owner-work. "Helped with X" / "Supported X" / "Contributed to X" when the role suggests they OWNED it. Push back to reframe.
- "evasive": the answer dodges the structural part of the question. Question asked for headcount, candidate gave qualitative impression. Push back.

Pick exactly ONE. If the answer is partly specific and partly generic, prefer "generic" only if the generic part is the load-bearing one.

Output JSON in this exact shape:
{{"verdict": "specific|generic|underselling|evasive", "reason": "1-sentence why — in {lang}"}}"""
        text = self._call(prompt, model="mistral-small-latest", max_tokens=300, temperature=0.2)
        data = self._parse_json(text)
        verdict = (data.get("verdict") or "specific").strip().lower()
        if verdict not in {"specific", "generic", "underselling", "evasive"}:
            verdict = "specific"
        return AnswerVerdict(verdict=verdict, reason=str(data.get("reason") or ""))

    def _cv_text_corpus(self, profile: Profile) -> str:
        """Flatten the CV to a single string for grounding checks."""
        parts = [profile.title, profile.summary, " ".join(profile.skills)]
        for e in profile.experiences:
            parts.extend([e.title, e.company, e.description] + list(e.bullets))
        return " ".join(p for p in parts if p)

    def generate_next_question(self, profile: Profile, offer: Offer, gap_analysis: GapAnalysis, messages: list[ChatMessage], ui_language: str = "en", known_facts=None, contradictions=None, cv_draft=None, agent_brief: AgentBrief | None = None) -> ChatResponse:
        # Match the chat to the user's actual writing language, not the UI locale
        detected = self._detect_conversation_lang(messages)
        if detected:
            ui_language = detected
        conversation = self._summarize_conversation(messages)
        lang_instruction = "French" if ui_language == "fr" else "English"

        # Brief-driven mode — replaces theme-ranking with deterministic slot
        # tracking + LLM-natural pushback. Falls through to legacy path if
        # the brief is missing or empty (frontend opt-out, /api/brief failed,
        # etc).
        if agent_brief and agent_brief.the3Questions:
            return self._brief_driven_next(
                profile, offer, agent_brief, messages, ui_language, lang_instruction,
                cv_draft, known_facts, contradictions,
            )

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

    def _brief_driven_next(
        self,
        profile: Profile,
        offer: Offer,
        brief: AgentBrief,
        messages: list[ChatMessage],
        ui_language: str,
        lang_instruction: str,
        cv_draft,
        known_facts,
        contradictions,
    ) -> ChatResponse:
        """Brief-driven chat loop. Replaces theme-ranking with:
          1. Deterministic slot tracking against brief.the3Questions.
          2. classify_answer-gated pushback (≤1 per slot).
          3. Narrative wrap when slots exhausted.

        Single LLM call writes the user-visible message + extracts
        cv_actions from the latest user reply. Slot state is computed
        from message history, not asked of the model — the model only
        gets the resolved 'send pushback' or 'send next question' cue.
        """
        first_name = profile.name.split()[0] if profile.name else "there"
        qs = [bq.question for bq in brief.the3Questions if bq.question]
        if not qs:
            # No questions in brief — bail to let caller fall through
            return ChatResponse(message="", is_complete=True, cv_actions=[], progress=100)

        asst = [m.content for m in messages if m.role == "assistant" and not m.content.startswith("⚠️")]
        user = [m.content for m in messages if m.role == "user"]

        # Find the highest brief-slot whose question text matches an assistant
        # message (case-insensitive prefix match — the LLM may reformat slightly).
        def _slot_for_msg(msg: str) -> int:
            ml = (msg or "").lower()
            best = -1
            for i, q in enumerate(qs):
                key = q.strip()[:50].lower()
                if key and key in ml:
                    best = max(best, i)
            return best

        slot_marks = [_slot_for_msg(a) for a in asst]
        last_fresh_slot = max(slot_marks) if slot_marks else -1
        last_msg = asst[-1] if asst else ""
        last_was_fresh_q = _slot_for_msg(last_msg) >= 0
        # Did we already push back at the current slot? (i.e. there's an
        # assistant message AFTER the most recent fresh-Q that doesn't itself
        # match a brief Q.)
        already_pushed = False
        if last_fresh_slot >= 0:
            for a in asst[asst.index(next(a for a in asst if _slot_for_msg(a) == last_fresh_slot)) + 1:]:
                if _slot_for_msg(a) < 0:
                    already_pushed = True
                    break

        user_just_answered = len(user) >= len(asst) and bool(asst)
        latest_user_answer = user[-1] if user else ""

        # Classify the latest user answer (only if there is one and last assistant
        # was a fresh question we want to evaluate the answer against).
        verdict = AnswerVerdict()
        if user_just_answered and last_was_fresh_q and not already_pushed:
            try:
                verdict = self.classify_answer(
                    last_msg, latest_user_answer,
                    cliches=brief.clichesToKillInAnswers,
                    ui_language=ui_language,
                )
            except Exception:
                logging.exception("classify_answer failed; proceeding without pushback")

        # Decide: pushback, advance, or complete.
        mode: str
        target_slot: int
        if last_fresh_slot < 0:
            # First call — send Q1.
            mode = "ask_fresh"
            target_slot = 0
        elif user_just_answered and verdict.verdict in {"generic", "underselling", "evasive"} and last_was_fresh_q and not already_pushed:
            mode = "pushback"
            target_slot = last_fresh_slot
        elif last_fresh_slot + 1 < len(qs):
            mode = "ask_fresh"
            target_slot = last_fresh_slot + 1
        else:
            mode = "wrap"
            target_slot = last_fresh_slot

        # Format the brief context the LLM needs to write a great line.
        cliche_block = ""
        if brief.clichesToKillInAnswers:
            cliche_block = "\n\nBANNED PHRASES (do NOT echo these in your reply):\n" + "\n".join(f"- {c}" for c in brief.clichesToKillInAnswers[:15])

        cv_draft_context = ""
        if cv_draft:
            draft_lines = []
            for i, exp in enumerate(cv_draft.experiences):
                bullets = "\n".join(f"      • {b}" for b in exp.bullets)
                draft_lines.append(f"  [{i}] {exp.title} at {exp.company} ({exp.dates})\n{bullets}")
            cv_draft_context = f"\n\nCURRENT CV DRAFT:\nName: {cv_draft.name}\nTitle: {cv_draft.title}\nSummary: {cv_draft.summary}\nExperiences:\n{chr(10).join(draft_lines)}"

        knowledge_context = ""
        if known_facts or contradictions:
            knowledge_context = "\n\nKNOWLEDGE FROM PREVIOUS PROJECTS:"
            if known_facts:
                knowledge_context += "\nKnown facts:\n" + "\n".join(f"- {f}" for f in (known_facts or [])[:10])
            if contradictions:
                knowledge_context += "\nContradictions:\n" + "\n".join(f"- {c}" for c in (contradictions or [])[:5])

        if mode == "wrap":
            # Narrative wrap — agent voice, frames the candidate's story for this offer.
            prompt = f"""You're {first_name}'s agent (sports-agent voice — on their side). The chat is closing. Write ONE sentence that frames their story for THIS offer, in {lang_instruction}, in the agent's voice.

Lead with the bet, signal what you'll have the CV say.

THE BET: {brief.theBet}
THE PITCH: {brief.thePitch}
MARKET READ: {brief.marketRead}
STRONGEST MATCH: {brief.strongestExistingMatch.shouldBePitchedAs or brief.strongestExistingMatch.why}

CONVERSATION:
{self._summarize_conversation(messages)}

Output JSON: {{"message": "your closing sentence (≤25 words, agent voice)", "is_complete": true, "cv_actions": [], "progress": 100}}"""
            text = self._call(prompt, model="mistral-small-latest", max_tokens=400, temperature=0.6)
            data = self._parse_json(text)
            data["is_complete"] = True
            data["progress"] = 100
            try:
                return ChatResponse(**data)
            except Exception:
                return ChatResponse(message=brief.thePitch, is_complete=True, cv_actions=[], progress=100)

        # Build the prompt for ask_fresh or pushback. Same structure, different cue.
        if mode == "pushback":
            cue_label = f"PUSHBACK ({verdict.verdict.upper()})"
            cue_body = f"""The user just answered: "{latest_user_answer.strip()[:600]}"

The verdict is: {verdict.verdict}. Reason: {verdict.reason or '(none)'}

You are this candidate's AGENT. Write ONE pushback line, in {lang_instruction}. Voice: on-their-side, sharp, conversational. NOT clinical-evaluative. Examples:
- generic → "that's a line every PM has on their CV. what did *you* do here that I can sell?"
- underselling → "no — you didn't *help with* growth, you *ran* it. tell me again, but own it."
- evasive → "you skipped the part I need: {{specific structural ask}}. give me the number."

Stay focused on the question that was just asked. Do NOT advance to a new question. Push back ONCE.

Original question (for context): "{qs[target_slot]}\""""
        else:
            angle = brief.the3Questions[target_slot].angle if target_slot < len(brief.the3Questions) else ""
            angle_hint = ""
            if "fear" in angle.lower():
                angle_hint = f"\n\nThis question targets the HIRING-MANAGER FEAR: {brief.hiringManagerFear}\nName the fear directly. Allowed to feel pointed; politeness here is harmful."
            elif "evidence" in angle.lower():
                angle_hint = "\n\nThis question surfaces UNSPOKEN EVIDENCE — likely overlap the user didn't write down. Be direct and reference the company by name."
            elif "bet" in angle.lower():
                angle_hint = f"\n\nThis question DEEPENS THE BET: {brief.theBet}\nForce a specific metric/outcome/scope."
            cue_label = f"FRESH QUESTION (slot {target_slot + 1}/{len(qs)})"
            cue_body = f"""Send brief.the3Questions[{target_slot}] in {lang_instruction}, naturally — you can lightly rephrase to acknowledge the prior answer if any, but the SUBSTANCE must be the brief question.{angle_hint}

Brief question to send: "{qs[target_slot]}\""""

        prompt = f"""You are {first_name}'s AGENT (recruiter+seller fused). Drive the chat from the brief — you do NOT theme-rank, you do NOT pick from a menu. Each turn does ONE of: send a fresh brief question, push back ONCE on a generic answer, or close the chat.

THE BET: {brief.theBet}
THE PITCH: {brief.thePitch}
HIRING-MANAGER FEAR: {brief.hiringManagerFear}{cliche_block}

OFFER: {offer.title} at {offer.company}

CANDIDATE EXPERIENCES (numbered for reference):
{chr(10).join(f"  [{i}] {e.title} at {e.company} ({e.dates})" for i, e in enumerate(profile.experiences))}{cv_draft_context}{knowledge_context}

CONVERSATION SO FAR:
{self._summarize_conversation(messages)}

YOUR TURN — {cue_label}:
{cue_body}

CV ACTIONS — extract concrete bullets from the user's latest answer (if any). Same anti-fabrication rule as elsewhere: only state facts the user gave; mark unknowns with {{GAP: ...}} tokens.

CV ACTIONS FORMAT:
{{"action": "add_bullet", "target": "Company Name", "value": "...", "index": -1}}
{{"action": "replace_bullet", "target": "Company Name", "value": "...", "index": 0}}
{{"action": "edit_field", "target": "summary", "value": "..."}}

Respond in JSON: {{"message": "your line — ONE message, agent voice, ≤2 sentences for pushbacks, ≤3 for fresh questions", "is_complete": false, "cv_actions": [], "progress": {int(((target_slot + (0.5 if mode == "pushback" else 1)) / len(qs)) * 100)}}}

Format the message with light markdown (**bold** for the key word). Plain prose preferred. No bullet lists unless genuinely listing 2+ items.

Write in {lang_instruction}. First name only. Be warm but direct."""

        text = self._call(prompt, model="mistral-small-latest", max_tokens=900, temperature=0.55)
        data = self._parse_json(text)
        try:
            return ChatResponse(**data)
        except Exception:
            return ChatResponse(message=qs[target_slot], is_complete=False, cv_actions=[], progress=int(((target_slot + 1) / len(qs)) * 100))

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
- STAGE CONTEXT: do NOT cram contract type, headcount, or stage into the title or company string anymore. Those have dedicated fields:
  - `contractType` per experience: "Permanent" / "CDI" / "Founder" / "Freelance" / "Contract" / "Internship" — leave "" if unknown, the user fills it in the editor.
  - `headcountStart` / `headcountEnd` per experience: numeric strings, e.g. "12" → "45". Leave "" if unknown.
  - `exitReason` per experience: short reason for leaving, optional. Leave "" if unknown.
  Title stays clean ("Head of People Ops"), company stays clean ("Mindflow"). Sector/stage may still appear inside parentheses on the company line if the source profile mentions them.
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
{{"name": "{profile.name}", "title": "operational title matching the offer", "email": "{profile.email}", "location": "{profile.location}", "summary": "2 short operational sentences", "experiences": [{{"title": "title", "company": "company (context)", "dates": "dates", "bullets": ["concrete action + number"], "contractType": "", "headcountStart": "", "headcountEnd": "", "exitReason": ""}}], "education": [{{"degree": "...", "school": "...", "year": "..."}}], "skills": ["concrete skill (proof)"], "languages": [], "language": "{'fr' if ui_language == 'fr' else 'en'}", "match_score": 65, "strengths": ["specific strength"], "improvements": ["specific gap"]}}"""

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

    def translate_fields(self, fields: list[dict], source_language: str, target_language: str) -> list[dict]:
        """Translate a small set of CV fields from one language to another.

        Used by the editor's per-field FR/EN sync — when the user edits a
        field on one side, that field is marked stale on the other side, and
        toggling languages triggers this method to refresh just the stale
        fields (not the whole CV). Each field is identified by an opaque
        dot-path that round-trips back unchanged.

        Returns a list of {path, text} dicts in the same order as input.
        Falls back to the original text if a path goes missing in the model
        output rather than dropping the field — better to leave a stale
        translation than lose user content.
        """
        if not fields:
            return []
        src_name = "French" if source_language == "fr" else "English"
        tgt_name = "French" if target_language == "fr" else "English"
        # Indexed input — model echoes the same path back per item, makes
        # response parsing trivial and order-independent.
        items_json = json.dumps(fields, ensure_ascii=False)
        prompt = f"""Translate each text below from {src_name} to {tgt_name}.

Preserve numbers, company names, technical terms, proper nouns, and the same tone/style. Do NOT add information. Do NOT make it more "corporate" — match the original register exactly. If a string contains a placeholder like {{GAP: ...}}, keep it verbatim.

INPUT (JSON array of {{path, text}} objects):
{items_json}

Respond with valid JSON only, in this exact shape — same order, same paths, only the `text` field translated:
{{"translations": [{{"path": "...", "text": "..."}}]}}"""

        text = self._call(prompt, model="mistral-small-latest", max_tokens=MAX_TOKENS_PER_CALL, temperature=0.2)
        data = self._parse_json(text)
        out_raw = data.get("translations", []) if isinstance(data, dict) else []
        # Index by path so we can fall back gracefully if the model dropped one.
        by_path = {item.get("path"): item.get("text", "") for item in out_raw if isinstance(item, dict)}
        result = []
        for f in fields:
            p = f.get("path", "")
            translated = by_path.get(p)
            # Empty translation is suspicious — keep original rather than wipe.
            if translated is None or (not translated and f.get("text")):
                translated = f.get("text", "")
            result.append({"path": p, "text": translated})
        return result

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

    def tone_samples(self, profile: Profile, offer: Offer, ui_language: str = "en") -> ToneSamples:
        """Rewrite one real bullet from the profile in 3 voices so the user can pick
        which voice sounds like them. Uses the user's own data — never fabricates.
        Runs on mistral-small-latest for speed (shown inline in chat)."""
        lang_name = "French" if ui_language == "fr" else "English"

        # Pick one concrete bullet from the most recent experience that actually has one.
        # Fall back to description or summary if no bullets exist.
        source_bullet = ""
        source_company = ""
        for exp in profile.experiences:
            for b in exp.bullets:
                if b and len(b.strip()) > 20:
                    source_bullet = b.strip()
                    source_company = exp.company
                    break
            if source_bullet:
                break
        if not source_bullet:
            for exp in profile.experiences:
                if exp.description and len(exp.description.strip()) > 20:
                    source_bullet = exp.description.strip()
                    source_company = exp.company
                    break
        if not source_bullet:
            source_bullet = profile.summary or f"Worked on {offer.title.lower()}-related projects"
            source_company = profile.experiences[0].company if profile.experiences else ""

        prompt = f"""You're helping a job-seeker pick the voice of their CV. You will rewrite ONE real bullet from their experience in three different voices, so they can see the styles side by side and choose "which of these sounds like me?".

RULES:
- Keep EVERY fact, number, company name. Only the style changes.
- One line per voice. Do not invent new metrics.
- Write in {lang_name}.

SOURCE BULLET (from {source_company or "their experience"}):
{source_bullet}

VOICES (write one line per voice):

1. STARTUP — direct, confident, action-oriented. Short punchy dashes, implied first-person, informal. Show scrappiness and ownership. Max ~20 words.

2. CREATIVE — bold, slightly unconventional. Personality visible, unusual framing allowed. The fact stays, the delivery gets texture. Max ~25 words.

3. MINIMAL — telegraphic. Max 8 words. Pure signal, zero fluff.

Return valid JSON only:
{{"startup": "...", "creative": "...", "minimal": "..."}}"""

        text = self._call(prompt, model="mistral-small-latest", max_tokens=500, temperature=0.7)
        data = self._parse_json(text)
        return ToneSamples(
            source=source_bullet,
            company=source_company,
            startup=(data.get("startup") or "").strip(),
            creative=(data.get("creative") or "").strip(),
            minimal=(data.get("minimal") or "").strip(),
        )

    def improve_bullet(self, text: str, role: str = "", company: str = "", offer_title: str = "", ui_language: str = "en", tone: str = "startup") -> str:
        """Notion-style "improve wording" rewrite for a single CV bullet.

        Keeps every fact and number — just sharpens phrasing toward the chosen
        tone and tilts wording toward the offer when one is provided. Returns
        plain text (no JSON wrapping) for a fast inline-edit UX."""
        clean = (text or "").strip()
        if not clean:
            return clean
        lang_name = "French" if ui_language == "fr" else "English"
        tone_instr = self._get_tone_instruction(tone)
        offer_line = f"\nTARGET ROLE: {offer_title}" if offer_title else ""
        ctx = f"{role} at {company}".strip(" at ") if (role or company) else "their experience"

        prompt = f"""Rewrite ONE CV bullet point. Keep every fact, number, company name, and outcome — only the wording changes.

CURRENT BULLET (from {ctx}):
{clean}
{offer_line}

VOICE:
{tone_instr}

RULES:
- Same language as input. Write in {lang_name}.
- One line. Max ~25 words.
- Never invent metrics, dates, headcounts, or outcomes that aren't in the source.
- Keep specific numbers exactly as-is.
- No leading bullet character, no surrounding quotes.

Return ONLY the rewritten bullet text — no JSON, no preamble, no explanation."""

        text_out = self._call(prompt, model="mistral-small-latest", max_tokens=200, temperature=0.7, json_mode=False)
        out = (text_out or "").strip().strip('"').strip("'")
        # Strip a leading dash/bullet character if the model adds one despite instructions.
        if out[:2] in ("- ", "• ", "* "):
            out = out[2:].strip()
        # Defensive: if model returned an empty string, fall back to the original.
        return out or clean

    def audit_cv(self, cv_data: "CVData", offer: Offer, ui_language: str = "en") -> dict:
        """End-of-edit CV audit. Returns three buckets:
          - grammar: spelling/grammar/awkward phrasing fixes
          - missing_from_offer: requirements from the offer not addressed in the CV
          - advice: last-mile coaching (more numbers, more bullets, more examples)

        Each finding is `{where, text}` so the UI can render it as a list with a
        human pointer (Summary / Experience N / bullet M)."""
        lang_name = "French" if ui_language == "fr" else "English"

        # Compact CV view for the prompt — JSON to keep field names predictable.
        exp_lines = []
        for i, exp in enumerate(cv_data.experiences):
            bullets = "\n".join(f"    {j+1}. {b}" for j, b in enumerate(exp.bullets))
            exp_lines.append(f"  Experience {i+1} — {exp.title} @ {exp.company} ({exp.dates})\n{bullets}")
        cv_view = (
            f"NAME: {cv_data.name}\n"
            f"TITLE: {cv_data.title}\n"
            f"SUMMARY: {cv_data.summary}\n"
            f"EXPERIENCES:\n" + "\n".join(exp_lines) + "\n"
            f"SKILLS: {', '.join(cv_data.skills)}\n"
        )
        offer_reqs = self._format_requirements(offer)

        prompt = f"""You are a senior recruiter doing a final pass on a CV before the candidate sends it. Your job is to surface the small things that will hurt this candidacy and the missing items that the target offer specifically asks for.

CV TO AUDIT:
{cv_view}

TARGET JOB OFFER:
Title: {offer.title}
Company: {offer.company}
Description: {offer.description[:1500]}
Key requirements: {offer_reqs}

Return THREE lists. For each item, set `where` to a short pointer like "Summary", "Experience 2 title", "Experience 1 / bullet 3", "Skills".

1) **grammar** — spelling, grammar, typos, awkward phrasing, capitalization, missing accents in {lang_name}, run-on sentences. Be specific: quote the offending fragment in the `text` field and say what to change. Skip stylistic preferences. Keep to 0–8 items, only real issues.

2) **missing_from_offer** — requirements from the offer that the CV does NOT address. Don't repeat what's already covered. Be concrete: "Offer asks for X, no mention in CV — could you add it under Experience N?". Keep to 0–6 items, ranked by importance.

3) **advice** — last-mile coaching. Examples:
  - "Bullet has no numbers — can you quantify the result?"
  - "Experience N only has 1 bullet — add a context bullet so it doesn't read as a side gig"
  - "Summary doesn't mention the role you're targeting"
  Keep to 0–6 items.

Write all `where` and `text` fields in {lang_name}. Be direct, no filler ("Great CV overall!"). Empty lists are fine if there's nothing to flag.

Respond ONLY in valid JSON:
{{"grammar": [{{"where": "...", "text": "..."}}], "missing_from_offer": [{{"where": "...", "text": "..."}}], "advice": [{{"where": "...", "text": "..."}}]}}"""

        text = self._call(prompt, model="mistral-small-latest", max_tokens=2500, temperature=0.3)
        return self._parse_json(text)

    def apply_grammar_fixes(self, cv_data: "CVData", findings: list[dict], ui_language: str = "en") -> dict:
        """Apply only the grammar bucket of an audit. Returns:
            {"cv_data": <CVData>, "applied": int, "skipped": int}

        Strategy: ask the LLM for a list of (path, old, new) substitutions —
        NOT a full rewrite. Then apply each substitution mechanically by
        looking up `path` in the CV and doing a literal `old` → `new` swap.
        Anything the LLM hallucinates a path for, or where `old` doesn't
        match the current text verbatim, is skipped silently. This makes the
        operation safe-by-construction: the LLM cannot introduce content
        outside the listed fixes."""
        if not findings:
            return {"cv_data": cv_data.model_dump(), "applied": 0, "skipped": 0}

        lang_name = "French" if ui_language == "fr" else "English"

        # Build a path-addressed view of every editable string field, so the
        # LLM sees exactly which paths exist and what current text lives there.
        path_view: list[str] = []
        path_view.append(f'  "summary": {json.dumps(cv_data.summary, ensure_ascii=False)}')
        path_view.append(f'  "title": {json.dumps(cv_data.title, ensure_ascii=False)}')
        for i, exp in enumerate(cv_data.experiences):
            path_view.append(f'  "experiences.{i}.title": {json.dumps(exp.title, ensure_ascii=False)}')
            path_view.append(f'  "experiences.{i}.company": {json.dumps(exp.company, ensure_ascii=False)}')
            for j, b in enumerate(exp.bullets):
                path_view.append(f'  "experiences.{i}.bullets.{j}": {json.dumps(b, ensure_ascii=False)}')

        findings_view = "\n".join(
            f'  [{idx}] ({f.get("where", "?")}) {f.get("text", "")}' for idx, f in enumerate(findings)
        )

        prompt = f"""You are applying a list of pre-approved grammar / spelling / wording fixes to a CV. You may NOT rewrite anything outside these fixes. You may NOT add new ideas, new bullets, or new content.

CV FIELDS BY PATH (you can only target these paths):
{chr(10).join(path_view)}

GRAMMAR FINDINGS TO APPLY (numbered — use the bracketed index in your response):
{findings_view}

For each finding, return ONE substitution: the exact substring currently in the field (`old`) and what it should become (`new`). Rules:
- `finding_index` MUST be the bracketed number of the finding you're addressing.
- `old` MUST be a verbatim substring of the current text at `path`. If you can't find an exact match, skip the finding.
- `new` is the corrected version of `old`. Keep the same register, same length where possible. Fix grammar/spelling/wording ONLY.
- Stay in {lang_name}. Do NOT translate.
- Do NOT add accents that change meaning. Do NOT change proper nouns, numbers, technical terms, or company names unless the finding explicitly says so.
- One substitution per finding. If a finding is vague ("be more concise"), skip it — substitutions must be concrete.

Respond ONLY in valid JSON:
{{"substitutions": [{{"finding_index": 0, "path": "summary", "old": "exact substring", "new": "fixed substring"}}]}}"""

        text = self._call(prompt, model="mistral-small-latest", max_tokens=2500, temperature=0.1)
        data = self._parse_json(text)
        subs = data.get("substitutions", []) if isinstance(data, dict) else []

        # Apply mechanically. Work on a deep copy so we don't mutate the input.
        # Track which finding indices were applied vs skipped so the UI can mark
        # the un-applied ones (LLM returned nothing for them, or the substring
        # didn't match verbatim, or the path was bogus).
        cv_dict = json.loads(cv_data.model_dump_json())
        applied_indices: set[int] = set()
        for s in subs:
            if not isinstance(s, dict):
                continue
            path = s.get("path", "")
            old = s.get("old", "")
            new = s.get("new", "")
            fi = s.get("finding_index")
            if not path or not old or new is None:
                continue
            if not _apply_substitution(cv_dict, path, old, new):
                continue
            if isinstance(fi, int) and 0 <= fi < len(findings):
                applied_indices.add(fi)

        skipped_indices = [i for i in range(len(findings)) if i not in applied_indices]
        return {
            "cv_data": cv_dict,
            "applied": len(applied_indices),
            "skipped": len(skipped_indices),
            "skipped_indices": skipped_indices,
        }

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
