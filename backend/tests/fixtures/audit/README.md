# Chat audit harness

Compares the **legacy** theme-ranked chat against the **brief-driven**
recruiter+agent chat on a fixed set of (CV, offer) fixtures. Each
fixture is a real-shape candidate × real-shape offer, designed to
exercise a different specialty (so we don't over-fit the rework on
one role family).

## Fixtures

| Slug | Candidate shape | Offer shape | Expected agent angle |
|---|---|---|---|
| `ta_recruiter` | TA recruiter, multi-startup, employer-branding history | Senior TA at Mistral-style AI lab | Tech-recruiting craft, sourcing depth, NOT diversity |
| `senior_eng` | Backend lead, 8 yrs, payments + scale-out background | Staff PM-Engineer at Series C SaaS | Architecture decisions, on-call, mentorship gap |
| `growth_marketer` | Growth marketer, two scale-up roles, vague metrics | Growth Lead at e-commerce DTC | Quantified outcomes, channel mix, fluffy bullets |
| `pm` | PM at scale-up, employer-branding+product mix | Senior PM, Merchant Onboarding at Series C | Onboarding focus, payments unspoken evidence |

## Running

```sh
cd backend
source .venv/bin/activate
export MISTRAL_API_KEY=...     # required — real LLM calls

# All fixtures, both modes
python scripts/audit_chat.py

# One fixture
python scripts/audit_chat.py --fixture ta_recruiter

# One mode
python scripts/audit_chat.py --mode brief
python scripts/audit_chat.py --mode legacy
```

Output: `backend/tests/fixtures/audit/_reports/audit_<timestamp>.md`.

## Manual eval rubric

For each fixture, score the **first 2 turns** of each branch on:

1. **Names the bet** — does the chat surface the strongest existing match
   in the candidate's CV and ask about it specifically? (1 pt)
2. **Names the fear** — does the chat name (politely or pointedly) the
   hiring-manager risk in this CV × offer pair? (1 pt)
3. **Pushes back on a generic answer** — when the user replies with a
   canned answer ("I led the team and improved results"), does the chat
   challenge it ONCE before moving on? (1 pt)
4. **Surfaces unspoken evidence** — does the chat ask about a likely
   overlap that neither the CV nor offer stated explicitly? (1 pt)
5. **Closes with a narrative** — at end-of-chat, does it frame the
   candidate's story for this offer as one sentence? (1 pt)

Target: brief-driven scores ≥ 4/5 on every fixture. Legacy is the
baseline (typically ≤ 2/5 on these specifically — coverage ≠ bets).

## Three-layer regression

Re-run the Mistral TA fixture (`ta_recruiter`) and confirm:
- The "diversity sourcing" gap (Session 16 hallucination) stays
  dropped — should NOT appear in either gap-analysis or brief output.
- `unspoken_evidence_to_probe` does NOT contain hypotheses whose
  content words are absent from the CV / offer text.

## Adding fixtures

Each fixture is a directory with three files:

- `cv.json` — `Profile` JSON (matches `app.models.Profile` shape).
- `offer.json` — `Offer` JSON.
- `expected.md` — short markdown of what a senior recruiter would
  reasonably zero in on. Used by humans for the eval rubric — the
  script does NOT consume it.
