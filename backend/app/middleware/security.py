import os
import time

import httpx
from fastapi import Request, HTTPException

from app.db import get_db

TURNSTILE_SECRET = os.environ.get("TURNSTILE_SECRET", "")


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")


async def verify_turnstile(token: str) -> bool:
    if not TURNSTILE_SECRET:
        return True  # Skip in dev
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": TURNSTILE_SECRET, "response": token},
        )
        return resp.json().get("success", False)


def check_rate_limit(request: Request, is_authenticated: bool = False) -> None:
    ip = _get_client_ip(request)
    # Check auth from Authorization header
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer ") and len(auth_header) > 20:
        is_authenticated = True
    limit = 500 if is_authenticated else 50
    now = time.time()
    day_ago = now - 86400

    with get_db() as conn:
        # Clean old entries
        conn.execute("DELETE FROM rate_limits WHERE timestamp < ?", (day_ago,))
        # Count recent requests from this IP
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM rate_limits WHERE ip = ? AND timestamp > ?",
            (ip, day_ago),
        ).fetchone()
        count = row["cnt"] if row else 0
        if count >= limit:
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Sign in for more generations." if not is_authenticated
                else "Daily limit reached. Try again tomorrow.",
            )
        conn.execute("INSERT INTO rate_limits (ip, timestamp) VALUES (?, ?)", (ip, now))
