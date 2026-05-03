"""Chat audit harness — compares legacy theme-ranked vs brief-driven chat.

Runs the LLMService against (CV, offer) fixtures in tests/fixtures/audit/
and emits a side-by-side markdown report. Operator scores each fixture
against the rubric in the README; the script does NOT auto-score.

Two turns per branch:
  1. Opening — assistant first message (legacy: instant local message;
     brief: first brief question via the LLM).
  2. Pushback test — user replies with a deliberately weak canned answer
     ("I led the team and improved results"); assistant replies. We want
     to see whether the chat pushes back (brief) vs accepts and moves on
     (legacy).

Run:
  cd backend && source .venv/bin/activate
  export MISTRAL_API_KEY=...
  python scripts/audit_chat.py                        # all fixtures, both modes
  python scripts/audit_chat.py --fixture ta_recruiter # one fixture
  python scripts/audit_chat.py --mode brief           # one mode

Output: tests/fixtures/audit/_reports/audit_<timestamp>.md
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Stub the SESSION_SECRET so app.main doesn't refuse to import. The audit
# script doesn't go through FastAPI — only the LLM service.
os.environ.setdefault("SESSION_SECRET", "audit_script_only_not_for_prod_use")

from app.models import (  # noqa: E402
    AgentBrief,
    ChatMessage,
    GapAnalysis,
    Offer,
    Profile,
)
from app.services.llm import LLMService  # noqa: E402


FIXTURES_DIR = ROOT / "tests" / "fixtures" / "audit"
REPORTS_DIR = FIXTURES_DIR / "_reports"


@dataclass
class FixtureResult:
    name: str
    mode: str
    opening_message: str
    is_complete_after_opening: bool
    is_pushback_after_opening: bool
    pushback_message: str
    is_complete_after_pushback: bool
    is_pushback_flag_after_pushback: bool
    brief_summary: str  # for brief mode only — short summary of brief output
    error: str | None = None


def _load_fixture(name: str) -> tuple[Profile, Offer]:
    fdir = FIXTURES_DIR / name
    cv = json.loads((fdir / "cv.json").read_text())
    offer = json.loads((fdir / "offer.json").read_text())
    return Profile(**cv), Offer(**offer)


def _list_fixtures() -> list[str]:
    return sorted(
        d.name for d in FIXTURES_DIR.iterdir()
        if d.is_dir() and d.name != "_reports" and (d / "cv.json").exists()
    )


def _run_one(name: str, mode: str, llm: LLMService) -> FixtureResult:
    """Run one fixture × one mode end-to-end (2 turns)."""
    profile, offer = _load_fixture(name)
    try:
        gap = llm.analyze(profile, offer)
    except Exception as exc:
        return FixtureResult(
            name=name, mode=mode,
            opening_message="", is_complete_after_opening=False,
            is_pushback_after_opening=False,
            pushback_message="", is_complete_after_pushback=False,
            is_pushback_flag_after_pushback=False,
            brief_summary="", error=f"analyze() failed: {exc}",
        )

    brief: AgentBrief | None = None
    brief_summary = ""
    if mode == "brief":
        try:
            brief = llm.agent_brief(profile, offer, gap)
        except Exception as exc:
            return FixtureResult(
                name=name, mode=mode,
                opening_message="", is_complete_after_opening=False,
                is_pushback_after_opening=False,
                pushback_message="", is_complete_after_pushback=False,
                is_pushback_flag_after_pushback=False,
                brief_summary="", error=f"agent_brief() failed: {exc}",
            )
        brief_summary = (
            f"theBet: {brief.theBet[:120]}\n\n"
            f"hiringManagerFear: {brief.hiringManagerFear[:120]}\n\n"
            f"the3Questions:\n"
            + "\n".join(
                f"  [{i+1}] ({q.angle}) {q.question[:160]}"
                for i, q in enumerate(brief.the3Questions[:3])
            )
            + (
                "\n\nunspokenEvidenceToProbe:\n"
                + "\n".join(
                    f"  - {u.hypothesis[:120]}" for u in (brief.unspokenEvidenceToProbe or [])[:3]
                )
                if brief.unspokenEvidenceToProbe else ""
            )
        )

    # Turn 1 — opening question. Empty messages list.
    try:
        opening = llm.generate_next_question(
            profile, offer, gap, messages=[],
            agent_brief=brief if mode == "brief" else None,
        )
    except Exception as exc:
        return FixtureResult(
            name=name, mode=mode,
            opening_message="", is_complete_after_opening=False,
            is_pushback_after_opening=False,
            pushback_message="", is_complete_after_pushback=False,
            is_pushback_flag_after_pushback=False,
            brief_summary=brief_summary, error=f"opening turn failed: {exc}",
        )

    # Turn 2 — feed back the opening, plus a deliberately weak canned answer.
    weak_answer = "I led the team and improved results."
    msgs = [
        ChatMessage(role="assistant", content=opening.message, is_pushback=opening.is_pushback),
        ChatMessage(role="user", content=weak_answer),
    ]
    try:
        followup = llm.generate_next_question(
            profile, offer, gap, messages=msgs,
            agent_brief=brief if mode == "brief" else None,
        )
    except Exception as exc:
        return FixtureResult(
            name=name, mode=mode,
            opening_message=opening.message,
            is_complete_after_opening=opening.is_complete,
            is_pushback_after_opening=opening.is_pushback,
            pushback_message="", is_complete_after_pushback=False,
            is_pushback_flag_after_pushback=False,
            brief_summary=brief_summary, error=f"followup turn failed: {exc}",
        )

    return FixtureResult(
        name=name, mode=mode,
        opening_message=opening.message,
        is_complete_after_opening=opening.is_complete,
        is_pushback_after_opening=opening.is_pushback,
        pushback_message=followup.message,
        is_complete_after_pushback=followup.is_complete,
        is_pushback_flag_after_pushback=followup.is_pushback,
        brief_summary=brief_summary,
    )


def _render_report(results: list[FixtureResult]) -> str:
    """Markdown report — one section per fixture, both modes side-by-side."""
    lines: list[str] = []
    lines.append(f"# Chat audit report — {datetime.utcnow().isoformat()}Z")
    lines.append("")
    lines.append(
        "Two turns per (fixture, mode). Turn 1 is the opening. Turn 2 feeds "
        "back a deliberately weak canned answer ('I led the team and improved "
        "results.') and we observe whether the chat pushes back."
    )
    lines.append("")
    lines.append("## Eval rubric per fixture")
    lines.append("")
    lines.append("Score each branch against the 5-point rubric in the README. Target: "
                 "brief-driven ≥ 4/5 on every fixture; legacy is the baseline.")
    lines.append("")

    by_fixture: dict[str, dict[str, FixtureResult]] = {}
    for r in results:
        by_fixture.setdefault(r.name, {})[r.mode] = r

    for fname in sorted(by_fixture.keys()):
        modes = by_fixture[fname]
        lines.append(f"## `{fname}`")
        lines.append("")
        legacy = modes.get("legacy")
        brief = modes.get("brief")

        if brief and brief.brief_summary:
            lines.append("### Brief output (recruiter+agent diagnostic)")
            lines.append("")
            lines.append("```")
            lines.append(brief.brief_summary)
            lines.append("```")
            lines.append("")

        lines.append("### Turn 1 — opening")
        lines.append("")
        lines.append("| Mode | Message | is_pushback |")
        lines.append("|---|---|---|")
        for mode, label in (("legacy", "Legacy"), ("brief", "Brief")):
            r = modes.get(mode)
            if not r:
                continue
            if r.error:
                lines.append(f"| {label} | _ERROR: {r.error}_ | — |")
                continue
            msg = r.opening_message.replace("\n", " ").replace("|", "\\|")[:600]
            lines.append(f"| {label} | {msg} | {r.is_pushback_after_opening} |")
        lines.append("")

        lines.append("### Turn 2 — after canned weak answer")
        lines.append("")
        lines.append("| Mode | Message | is_pushback | is_complete |")
        lines.append("|---|---|---|---|")
        for mode, label in (("legacy", "Legacy"), ("brief", "Brief")):
            r = modes.get(mode)
            if not r or r.error:
                continue
            msg = r.pushback_message.replace("\n", " ").replace("|", "\\|")[:600]
            lines.append(
                f"| {label} | {msg} | {r.is_pushback_flag_after_pushback} | {r.is_complete_after_pushback} |"
            )
        lines.append("")

        # Quick visual note: did brief actually push back where legacy didn't?
        if legacy and brief and not legacy.error and not brief.error:
            brief_pushed = brief.is_pushback_flag_after_pushback
            legacy_pushed = legacy.is_pushback_flag_after_pushback
            if brief_pushed and not legacy_pushed:
                lines.append("> ✅ **Brief pushed back where legacy did not.** Expected behaviour.")
            elif brief_pushed and legacy_pushed:
                lines.append("> 🟡 Both branches pushed back — unusual; legacy may have happened to ask a sharp follow-up.")
            elif not brief_pushed and not legacy_pushed:
                lines.append("> ⚠️ Neither branch pushed back. classify_answer may have judged the canned answer as 'specific'. Inspect the brief output.")
            elif not brief_pushed and legacy_pushed:
                lines.append("> ⚠️ Legacy pushed back, brief did not. Likely a slot-tracking bug or classify miscategorising.")
            lines.append("")

        if (legacy and legacy.error) or (brief and brief.error):
            lines.append("### Errors")
            lines.append("")
            for r in (legacy, brief):
                if r and r.error:
                    lines.append(f"- {r.mode}: `{r.error}`")
            lines.append("")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare legacy vs brief-driven chat on fixtures.")
    parser.add_argument("--fixture", help="Run only this fixture (default: all).")
    parser.add_argument("--mode", choices=["legacy", "brief", "both"], default="both")
    parser.add_argument("--quiet", action="store_true", help="Suppress per-fixture progress logs.")
    args = parser.parse_args()

    if not args.quiet:
        logging.basicConfig(level=logging.INFO, format="%(message)s")

    if not os.environ.get("MISTRAL_API_KEY"):
        print("ERROR: MISTRAL_API_KEY not set. The audit harness uses real LLM calls.", file=sys.stderr)
        return 2

    fixtures = [args.fixture] if args.fixture else _list_fixtures()
    if not fixtures:
        print("No fixtures found.", file=sys.stderr)
        return 2

    modes: list[str]
    if args.mode == "both":
        modes = ["legacy", "brief"]
    else:
        modes = [args.mode]

    llm = LLMService()
    results: list[FixtureResult] = []
    for fname in fixtures:
        for mode in modes:
            print(f"  → {fname} / {mode}")
            result = _run_one(fname, mode, llm)
            results.append(result)
            if result.error:
                print(f"     error: {result.error}")

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    out = REPORTS_DIR / f"audit_{stamp}.md"
    out.write_text(_render_report(results))
    print(f"\nReport: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
