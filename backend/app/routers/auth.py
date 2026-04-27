import logging
import os
from urllib.parse import urlencode

import bcrypt
import httpx
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import RedirectResponse
from itsdangerous import URLSafeTimedSerializer
from pydantic import BaseModel, EmailStr, Field

from app.middleware.security import check_rate_limit, verify_turnstile

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ntfy.sh topic for signup notifications. Set NTFY_TOPIC to a long random string
# (it's the only auth — anyone who knows the topic can read the feed). Install
# the ntfy app on iPhone, subscribe to the topic, get a push for every new user.
# If NTFY_TOPIC is unset, signup notifications are silently skipped.
NTFY_TOPIC = os.environ.get("NTFY_TOPIC", "")


def _notify_signup(email: str, provider: str) -> None:
    """Fire a push notification when a new user signs up. Best-effort — never
    raise (a notification failure must not break login). Reads NTFY_TOPIC
    at call time rather than module load so a secret-change-without-restart
    doesn't leave us silently disabled."""
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        logging.warning("ntfy: NTFY_TOPIC unset — skipping notification for %s", email)
        return
    try:
        resp = httpx.post(
            f"https://ntfy.sh/{topic}",
            content=f"{email} via {provider}".encode("utf-8"),
            headers={
                "Title": "Bored CV - new signup",
                "Priority": "default",
                "Tags": "tada",
            },
            timeout=5.0,
        )
        logging.info("ntfy: posted signup notification (status=%s, topic_len=%d)", resp.status_code, len(topic))
    except Exception:
        logging.exception("ntfy: signup notification POST failed")


def _record_signup_if_new(email: str, provider: str) -> None:
    """Insert a fresh user row on first OAuth login and fire a push notification.
    Idempotent — subsequent logins by the same user are a no-op. Best-effort:
    never raise, never block the OAuth callback."""
    if not email or not provider:
        return
    try:
        from app.db import get_db
        user_id = namespaced_user_id(email, provider)
        with get_db() as conn:
            row = conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone()
            if row:
                return  # already signed up
            conn.execute(
                "INSERT OR IGNORE INTO users (id, email, provider) VALUES (?, ?, ?)",
                (user_id, email, provider),
            )
        _notify_signup(email, provider)
    except Exception:
        logging.exception("signup recording failed")

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
    _record_signup_if_new(email, "google")
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
    _record_signup_if_new(email, "github")
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


# ---------------------------------------------------------------------------
# Email + password auth — alongside Google/GitHub OAuth, not replacing it
# ---------------------------------------------------------------------------

class EmailSignupRequest(BaseModel):
    email: EmailStr
    # Modern password guidance: prefer length over complexity rules. 8 chars min
    # blocks the obvious brute-force candidates without nagging users about
    # mixed case / digits / symbols.
    password: str = Field(min_length=8, max_length=200)


class EmailLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class AuthTokenResponse(BaseModel):
    token: str
    email: str
    provider: str = "email"


def _hash_password(password: str) -> str:
    """bcrypt with default 12 rounds. Returns the encoded hash as a string for
    column storage — bcrypt embeds salt + cost factor in the output, so we
    don't need separate columns."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
    except Exception:
        return False


@router.post("/signup", response_model=AuthTokenResponse)
async def email_signup(payload: EmailSignupRequest, request: Request, x_captcha_token: str = Header("")):
    """Create an account with email + password. Captcha-gated to keep bots out."""
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    check_rate_limit(request)

    email = payload.email.lower().strip()
    user_id = namespaced_user_id(email, "email")

    from app.db import get_db
    with get_db() as conn:
        existing = conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists. Try logging in.")
        password_hash = _hash_password(payload.password)
        conn.execute(
            "INSERT INTO users (id, email, provider, password_hash) VALUES (?, ?, ?, ?)",
            (user_id, email, "email", password_hash),
        )

    _notify_signup(email, "email")
    return AuthTokenResponse(token=_make_token(email, "email"), email=email, provider="email")


@router.post("/login", response_model=AuthTokenResponse)
async def email_login(payload: EmailLoginRequest, request: Request):
    """Log in with email + password. No captcha — use rate limiting alone so the
    flow stays one-tap for returning users; brute-force cost is bounded by the
    per-IP limit + bcrypt's cost factor (~250 ms/check)."""
    check_rate_limit(request)

    email = payload.email.lower().strip()
    user_id = namespaced_user_id(email, "email")

    from app.db import get_db
    with get_db() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()

    # Constant-ish-time response: always run bcrypt against *something* so a
    # missing email doesn't return measurably faster than a wrong password.
    stored = row["password_hash"] if row else ""
    if not stored or not _verify_password(payload.password, stored):
        # Run a dummy bcrypt check on the absent path so timing is comparable.
        if not stored:
            _verify_password(payload.password, _hash_password("decoy"))
        raise HTTPException(status_code=401, detail="Wrong email or password")

    return AuthTokenResponse(token=_make_token(email, "email"), email=email, provider="email")
