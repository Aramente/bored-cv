import os

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.routers import linkedin, offer, chat, generate, auth, draft, projects, knowledge

app = FastAPI(title="Bored CV API", version="0.1.0")

app.add_middleware(SessionMiddleware, secret_key=os.environ.get("SESSION_SECRET", "dev-secret-change-me"))

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


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/debug-db")
async def debug_db():
    """Debug: check DB status."""
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


ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "")


@app.get("/api/admin/users")
async def admin_users(x_admin_secret: str = Header("")):
    """List all registered users. Protected by ADMIN_SECRET header."""
    if not ADMIN_SECRET or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")
    from app.db import get_db
    with get_db() as conn:
        rows = conn.execute("SELECT id, email, provider, created_at FROM users ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


@app.get("/api/debug-parse")
async def debug_parse():
    """Debug: test full PDF parser pipeline."""
    import traceback
    import google.generativeai as genai
    from app.services.pdf_parser import extract_pdf_text
    key = os.environ.get("GEMINI_API_KEY", "")
    genai.configure(api_key=key)
    model = genai.GenerativeModel("gemini-2.5-flash")

    # Test with a small fake PDF text
    test_text = "Coordonnées Kevin Duchier\n0033786626512\nkevin@gmail.com\nExpérience\nFounder\nSloow\nseptembre 2025 - Present\nBuilding stuff"

    prompt = f"""Extract structured profile data from this LinkedIn PDF export.

RAW TEXT:
{test_text}

Return valid JSON with: name, title, email, phone, linkedin, location, summary, experiences, education, skills, languages."""

    try:
        r = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=2000,
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )
        import json
        data = json.loads(r.text)
        return {"ok": True, "name": data.get("name"), "experiences": len(data.get("experiences", [])), "sdk": genai.__version__}
    except Exception as e:
        return {"ok": False, "error": str(e), "traceback": traceback.format_exc(), "sdk": genai.__version__}
