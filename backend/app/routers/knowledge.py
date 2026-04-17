import json
from fastapi import APIRouter, HTTPException, Request

from app.db import get_db
from app.models import KnowledgeBase, KnowledgeEntry, FactEntry
from app.routers.auth import get_user_from_request

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


def _get_user_id(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    user = get_user_from_request(authorization=auth_header)
    if user:
        return user.get("email", "")
    raise HTTPException(status_code=401, detail="Sign in to access knowledge base")


@router.get("", response_model=KnowledgeBase)
async def get_knowledge(request: Request):
    user_id = _get_user_id(request)
    with get_db() as conn:
        exp_rows = conn.execute(
            "SELECT * FROM knowledge WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()

        fact_rows = conn.execute(
            "SELECT f.*, k.company FROM facts f JOIN knowledge k ON f.knowledge_id = k.id "
            "WHERE f.user_id = ? ORDER BY f.created_at DESC",
            (user_id,),
        ).fetchall()

    experiences = []
    for r in exp_rows:
        d = dict(r)
        d["facts"] = json.loads(d.get("facts", "{}"))
        d["best_bullets"] = json.loads(d.get("best_bullets", "[]"))
        experiences.append(KnowledgeEntry(**d))

    facts = [FactEntry(**dict(r)) for r in fact_rows]

    # Detect contradictions: same key, different values across projects
    contradictions = _find_contradictions(facts)

    return KnowledgeBase(experiences=experiences, facts=facts, contradictions=contradictions)


@router.post("/enrich")
async def enrich_knowledge(request: Request):
    """After a chat session, extract and store new knowledge from the conversation."""
    user_id = _get_user_id(request)
    body = await request.json()
    profile = body.get("profile", {})
    messages = body.get("messages", [])
    project_id = body.get("project_id")

    with get_db() as conn:
        # Ensure user exists
        conn.execute(
            "INSERT OR IGNORE INTO users (id, email, provider) VALUES (?, ?, ?)",
            (user_id, user_id, request.session.get("user", {}).get("provider", "")),
        )

        # Upsert experiences from profile
        for exp in profile.get("experiences", []):
            company = exp.get("company", "")
            title = exp.get("title", "")
            if not company:
                continue

            existing = conn.execute(
                "SELECT id FROM knowledge WHERE user_id = ? AND company = ? AND title = ?",
                (user_id, company, title),
            ).fetchone()

            if existing:
                knowledge_id = existing["id"]
                # Update with new info (merge bullets)
                old = conn.execute("SELECT best_bullets FROM knowledge WHERE id = ?", (knowledge_id,)).fetchone()
                old_bullets = json.loads(old["best_bullets"]) if old else []
                new_bullets = exp.get("bullets", [])
                merged = list(set(old_bullets + new_bullets))
                conn.execute(
                    "UPDATE knowledge SET best_bullets = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (json.dumps(merged), exp.get("description", ""), knowledge_id),
                )
            else:
                cursor = conn.execute(
                    "INSERT INTO knowledge (user_id, company, title, dates, description, best_bullets) VALUES (?, ?, ?, ?, ?, ?)",
                    (user_id, company, title, exp.get("dates", ""), exp.get("description", ""), json.dumps(exp.get("bullets", []))),
                )
                knowledge_id = cursor.lastrowid

            # Extract facts from conversation about this company
            for msg in messages:
                if msg.get("role") == "user" and company.lower() in msg.get("content", "").lower():
                    # Store the user's answer as a fact
                    conn.execute(
                        "INSERT INTO facts (user_id, knowledge_id, key, value, source_project_id) VALUES (?, ?, ?, ?, ?)",
                        (user_id, knowledge_id, "conversation_insight", msg["content"][:500], project_id),
                    )

    return {"status": "enriched"}


def _find_contradictions(facts: list) -> list[str]:
    """Find facts with same key but different values -- potential contradictions."""
    by_key: dict[tuple, list] = {}
    for f in facts:
        if not hasattr(f, 'knowledge_id'):
            continue
        k = (f.knowledge_id, f.key)
        if k not in by_key:
            by_key[k] = []
        by_key[k].append(f.value)

    contradictions = []
    for (kid, key), values in by_key.items():
        unique = list(set(values))
        if len(unique) > 1:
            contradictions.append(f"Conflicting data for '{key}': {' vs '.join(unique[:3])}")

    return contradictions[:10]
