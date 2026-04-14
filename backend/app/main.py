import os

from fastapi import FastAPI
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


@app.get("/api/debug-parse")
async def debug_parse():
    """Temporary debug endpoint — test Gemini JSON output."""
    import google.generativeai as genai
    key = os.environ.get("GEMINI_API_KEY", "")
    genai.configure(api_key=key)
    model = genai.GenerativeModel("gemini-2.5-flash")
    try:
        r = model.generate_content(
            'Return JSON: {"test": "hello"}',
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=100,
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )
        return {"ok": True, "response": r.text, "sdk_version": genai.__version__}
    except Exception as e:
        return {"ok": False, "error": str(e), "sdk_version": genai.__version__}
