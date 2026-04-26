import os
from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import RedirectResponse
from itsdangerous import URLSafeTimedSerializer

router = APIRouter(prefix="/api/auth", tags=["auth"])

BASE_URL = os.environ.get("BASE_URL", "https://aramente-bored-cv-api.hf.space")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://aramente.github.io/bored-cv/")
_secret = os.environ.get("SESSION_SECRET", "")
_dev_mode = os.environ.get("DEV_MODE", "").lower() in ("1", "true", "yes")
SECRET = _secret if _secret else ("dev-secret-change-me" if _dev_mode else "")

signer = URLSafeTimedSerializer(SECRET)

oauth = OAuth()

oauth.register(
    name="google",
    client_id=os.environ.get("GOOGLE_CLIENT_ID", ""),
    client_secret=os.environ.get("GOOGLE_CLIENT_SECRET", ""),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email"},
)

oauth.register(
    name="github",
    client_id=os.environ.get("GITHUB_CLIENT_ID", ""),
    client_secret=os.environ.get("GITHUB_CLIENT_SECRET", ""),
    authorize_url="https://github.com/login/oauth/authorize",
    access_token_url="https://github.com/login/oauth/access_token",
    api_base_url="https://api.github.com/",
    client_kwargs={"scope": "read:user"},
)


def _make_token(email: str, provider: str) -> str:
    return signer.dumps({"email": email, "provider": provider})


def verify_token(token: str) -> dict | None:
    try:
        data = signer.loads(token, max_age=86400 * 30)  # 30 days
        return data
    except Exception:
        return None


def get_user_from_request(request: Request = None, authorization: str = "") -> dict | None:
    """Extract user from Bearer token header.

    Returns dict with email, provider, and a derived ``user_id`` of the form
    ``provider:email``. ``user_id`` is the namespaced primary key — it
    prevents OAuth account collision (a GitHub user with login ``foo@bar.com``
    can't impersonate the Google user with the same email).
    """
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    if not token:
        return None
    data = verify_token(token)
    if not data:
        return None
    email = data.get("email", "")
    provider = data.get("provider", "")
    if email and provider:
        data["user_id"] = f"{provider}:{email}"
    return data


def namespaced_user_id(email: str, provider: str) -> str:
    """Build the namespaced user id used as users.id and FK target."""
    return f"{provider}:{email}"


@router.get("/google/login")
async def google_login(request: Request):
    redirect_uri = f"{BASE_URL}/api/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get("userinfo", {})
    email = user_info.get("email", "")
    auth_token = _make_token(email, "google")
    redirect = f"{FRONTEND_URL}#token={auth_token}&email={email}&provider=google"
    return RedirectResponse(url=redirect)


@router.get("/github/login")
async def github_login(request: Request):
    redirect_uri = f"{BASE_URL}/api/auth/github/callback"
    return await oauth.github.authorize_redirect(request, redirect_uri)


@router.get("/github/callback")
async def github_callback(request: Request):
    token = await oauth.github.authorize_access_token(request)
    resp = await oauth.github.get("user", token=token)
    user_data = resp.json()
    email = user_data.get("login", "")
    auth_token = _make_token(email, "github")
    redirect = f"{FRONTEND_URL}#token={auth_token}&email={email}&provider=github"
    return RedirectResponse(url=redirect)


@router.get("/me")
async def get_user(authorization: str = Header("")):
    user = get_user_from_request(authorization=authorization)
    if not user:
        return {"authenticated": False}
    return {"authenticated": True, **user}


@router.post("/logout")
async def logout():
    return {"status": "ok"}


@router.post("/consent")
async def update_consent(authorization: str = Header("")):
    """Update marketing consent for the authenticated user."""
    user = get_user_from_request(authorization=authorization)
    if not user:
        return {"status": "unauthenticated"}
    from app.db import get_db
    user_id = user.get("user_id") or namespaced_user_id(user.get("email", ""), user.get("provider", ""))
    with get_db() as conn:
        conn.execute("UPDATE users SET marketing_consent = 1 WHERE id = ?", (user_id,))
    return {"status": "ok"}


@router.get("/consent")
async def get_consent(authorization: str = Header("")):
    """Check marketing consent status for the authenticated user."""
    user = get_user_from_request(authorization=authorization)
    if not user:
        return {"consented": False, "asked": False}
    from app.db import get_db
    user_id = user.get("user_id") or namespaced_user_id(user.get("email", ""), user.get("provider", ""))
    with get_db() as conn:
        row = conn.execute("SELECT marketing_consent FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return {"consented": False, "asked": False}
    consent = row["marketing_consent"]
    return {"consented": consent == 1 or consent == "1", "asked": True}


@router.get("/quota")
async def get_quota(authorization: str = Header("")):
    user = get_user_from_request(authorization=authorization)
    is_auth = user is not None
    return {
        "authenticated": is_auth,
        "daily_limit": 20 if is_auth else 10,
        "provider": user.get("provider") if user else None,
    }


@router.delete("/account")
async def delete_account(authorization: str = Header("")):
    """GDPR delete-my-account. Wipes the user row and every FK child
    (knowledge, projects, facts, snapshots) in one transaction. The Bearer
    token remains valid until expiry — the client must drop it locally — but
    every authenticated lookup will 401 because the user row is gone.

    Idempotent: deleting an already-deleted account returns ok. Returns the
    counts of each entity type removed so the client can show a summary.
    """
    user = get_user_from_request(authorization=authorization)
    if not user or not user.get("user_id"):
        raise HTTPException(status_code=401, detail="Sign in required")
    user_id = user["user_id"]
    from app.db import get_db
    counts = {"projects": 0, "knowledge": 0, "facts": 0, "snapshots": 0}
    with get_db() as conn:
        # Order matters for FK: children first, then parent.
        for table in ("facts", "knowledge", "projects"):
            try:
                row = conn.execute(
                    f"SELECT COUNT(*) as cnt FROM {table} WHERE user_id = ?", (user_id,)
                ).fetchone()
                counts[table] = row["cnt"] if row else 0
                conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
            except Exception:
                pass  # table may not exist (snapshots is created lazily)
        try:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM snapshots WHERE user_id = ?", (user_id,)
            ).fetchone()
            counts["snapshots"] = row["cnt"] if row else 0
            conn.execute("DELETE FROM snapshots WHERE user_id = ?", (user_id,))
        except Exception:
            pass
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    return {"status": "deleted", "removed": counts}
