import os

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.routers import linkedin, offer, chat, generate, auth, draft, projects, knowledge, cover_letter, transcribe

ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "")

SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
DEV_MODE = os.environ.get("DEV_MODE", "").lower() in ("1", "true", "yes")
if not SESSION_SECRET and not DEV_MODE:
    raise RuntimeError("SESSION_SECRET environment variable is required in production")
if not SESSION_SECRET:
    SESSION_SECRET = "dev-secret-change-me"

app = FastAPI(title="Bored CV API", version="0.1.0")

app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://aramente.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(linkedin.router)
app.include_router(offer.router)
app.include_router(chat.router)
app.include_router(generate.router)
app.include_router(auth.router)
app.include_router(draft.router)
app.include_router(projects.router)
app.include_router(knowledge.router)
app.include_router(cover_letter.router)
app.include_router(transcribe.router)


@app.get("/api/stats")
async def get_stats():
    from app.db import get_db
    try:
        with get_db() as conn:
            row = conn.execute("SELECT COUNT(*) as cnt FROM projects").fetchone()
            count = row["cnt"] if row else 0
    except Exception:
        count = 0
    return {"cvs_generated": count}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/debug-db")
async def debug_db(x_admin_secret: str = Header("")):
    """Debug: check DB status. Protected by ADMIN_SECRET header."""
    if not ADMIN_SECRET or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")
    from app.db import get_db, USE_TURSO, TURSO_URL
    project_count = 0
    user_count = 0
    try:
        with get_db() as conn:
            row = conn.execute("SELECT COUNT(*) as cnt FROM projects").fetchone()
            project_count = row["cnt"] if row else 0
            row = conn.execute("SELECT COUNT(*) as cnt FROM users").fetchone()
            user_count = row["cnt"] if row else 0
    except Exception as e:
        return {"error": str(e), "turso": USE_TURSO, "turso_url": TURSO_URL[:30] + "..." if TURSO_URL else ""}
    return {
        "driver": "turso" if USE_TURSO else "sqlite",
        "turso_url": TURSO_URL[:30] + "..." if TURSO_URL else "",
        "users": user_count,
        "projects": project_count,
    }


@app.get("/api/admin/users")
async def admin_users(x_admin_secret: str = Header(""), consented_only: bool = False):
    """List all registered users. Protected by ADMIN_SECRET header."""
    if not ADMIN_SECRET or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")
    from app.db import get_db
    with get_db() as conn:
        if consented_only:
            rows = conn.execute("SELECT id, email, provider, marketing_consent, created_at FROM users WHERE marketing_consent = 1 ORDER BY created_at DESC").fetchall()
        else:
            rows = conn.execute("SELECT id, email, provider, marketing_consent, created_at FROM users ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


@app.get("/api/debug-parse")
async def debug_parse(x_admin_secret: str = Header("")):
    """Debug: test full PDF parser pipeline. Protected by ADMIN_SECRET header."""
    if not ADMIN_SECRET or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")
    import traceback
    from mistralai.client import Mistral
    from app.services.pdf_parser import extract_pdf_text
    key = os.environ.get("MISTRAL_API_KEY", "")
    client = Mistral(api_key=key)

    # Test with a small fake PDF text
    test_text = "Coordonnées Kevin Duchier\n0033786626512\nkevin@gmail.com\nExpérience\nFounder\nSloow\nseptembre 2025 - Present\nBuilding stuff"

    prompt = f"""Extract structured profile data from this LinkedIn PDF export.

RAW TEXT:
{test_text}

Return valid JSON with: name, title, email, phone, linkedin, location, summary, experiences, education, skills, languages."""

    try:
        r = client.chat.complete(
            model="mistral-small-latest",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=2000,
            temperature=0.1,
        )
        import json
        data = json.loads(r.choices[0].message.content)
        return {"ok": True, "name": data.get("name"), "experiences": len(data.get("experiences", [])), "provider": "mistral"}
    except Exception as e:
        return {"ok": False, "error": str(e), "traceback": traceback.format_exc(), "provider": "mistral"}
