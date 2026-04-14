import os
import time
from collections import defaultdict

import httpx
from fastapi import Request, HTTPException

TURNSTILE_SECRET = os.environ.get("TURNSTILE_SECRET", "")
DAILY_TOKEN_BUDGET = int(os.environ.get("DAILY_TOKEN_BUDGET", "500000"))

_ip_usage: dict[str, list[float]] = defaultdict(list)
_daily_tokens_used = 0
_day_start = 0.0


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
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    limit = 20 if is_authenticated else 10
    now = time.time()
    day_ago = now - 86400
    _ip_usage[ip] = [t for t in _ip_usage[ip] if t > day_ago]
    if len(_ip_usage[ip]) >= limit:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Sign in for more generations." if not is_authenticated
            else "Daily limit reached. Try again tomorrow.",
        )
    _ip_usage[ip].append(now)


def check_daily_budget() -> dict:
    global _daily_tokens_used, _day_start
    now = time.time()
    if now - _day_start > 86400:
        _daily_tokens_used = 0
        _day_start = now
    remaining = DAILY_TOKEN_BUDGET - _daily_tokens_used
    if remaining <= 0:
        raise HTTPException(status_code=429, detail="Service at capacity. Please try again tomorrow.")
    return {"remaining": remaining, "used": _daily_tokens_used}


def record_token_usage(tokens: int) -> None:
    global _daily_tokens_used
    _daily_tokens_used += tokens
