import os

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.routers import linkedin, offer, chat, generate, auth, draft, projects, knowledge, cover_letter, transcribe, snapshots

ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "")

SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
DEV_MODE = os.environ.get("DEV_MODE", "").lower() in ("1", "true", "yes")
if not SESSION_SECRET and not DEV_MODE:
    raise RuntimeError("SESSION_SECRET environment variable is required in production")
if not SESSION_SECRET:
    SESSION_SECRET = "dev-secret-change-me"

app = FastAPI(title="Bored CV API", version="0.1.0")


# Cap body size on every request. Prevents (a) memory DoS via gigabyte JSON
# bodies and (b) mega-payload prompt injection where an attacker stuffs many
# KB of "ignore previous instructions" into a free-text field. The PDF upload
# route enforces its own 5 MB limit; everything else is JSON and 1 MB is
# already 10× a real CV.
MAX_REQUEST_BYTES = 1_000_000
PDF_UPLOAD_PATHS = {"/api/parse-linkedin", "/api/debug-parse-pdf", "/api/transcribe"}


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in PDF_UPLOAD_PATHS:
            # Multipart upload routes enforce their own per-file caps; skip the
            # JSON-tier limit so a 4 MB PDF isn't blocked here.
            return await call_next(request)
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > MAX_REQUEST_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": "Request body too large"},
            )
        return await call_next(request)


app.add_middleware(BodySizeLimitMiddleware)
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
app.include_router(snapshots.router)


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
    import logging
    from mistralai.client import Mistral
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
        # Log internally; return generic message — no traceback in response.
        logging.exception("debug_parse failed")
        return {"ok": False, "error": type(e).__name__, "provider": "mistral"}
