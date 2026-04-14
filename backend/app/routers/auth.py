import os

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

BASE_URL = os.environ.get("BASE_URL", "https://aramente-bored-cv-api.hf.space")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://aramente.github.io/bored-cv/")

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


@router.get("/google/login")
async def google_login(request: Request):
    redirect_uri = f"{BASE_URL}/api/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get("userinfo", {})
    request.session["user"] = {"email": user_info.get("email", ""), "provider": "google"}
    return RedirectResponse(url=FRONTEND_URL)


@router.get("/github/login")
async def github_login(request: Request):
    redirect_uri = f"{BASE_URL}/api/auth/github/callback"
    return await oauth.github.authorize_redirect(request, redirect_uri)


@router.get("/github/callback")
async def github_callback(request: Request):
    token = await oauth.github.authorize_access_token(request)
    resp = await oauth.github.get("user", token=token)
    user_data = resp.json()
    request.session["user"] = {"email": user_data.get("login", ""), "provider": "github"}
    return RedirectResponse(url=FRONTEND_URL)


@router.get("/me")
async def get_user(request: Request):
    user = request.session.get("user")
    if not user:
        return {"authenticated": False}
    return {"authenticated": True, **user}


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@router.get("/quota")
async def get_quota(request: Request):
    user = request.session.get("user")
    is_auth = user is not None
    return {
        "authenticated": is_auth,
        "daily_limit": 5 if is_auth else 1,
        "provider": user.get("provider") if user else None,
    }
