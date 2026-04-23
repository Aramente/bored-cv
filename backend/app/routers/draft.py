from fastapi import APIRouter, Header, HTTPException, Request

from app.middleware.security import verify_turnstile, check_rate_limit
from app.models import CVData, GenerateRequest, ToneSamples, ToneSamplesRequest
from app.services.llm import LLMService

router = APIRouter(prefix="/api", tags=["draft"])


def get_llm() -> LLMService:
    return LLMService()


@router.post("/draft-cv", response_model=CVData)
async def draft_cv(req: GenerateRequest, request: Request, x_captcha_token: str = Header("")):
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    check_rate_limit(request)
    llm = get_llm()
    try:
        return llm.draft_cv(req.profile, req.offer, req.gap_analysis, req.messages, req.ui_language, target_market=req.target_market)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")


@router.post("/tone-samples", response_model=ToneSamples)
async def tone_samples(req: ToneSamplesRequest, request: Request, x_captcha_token: str = Header("")):
    """Rewrite one real bullet from the user's profile in 3 voices (startup,
    creative, minimal) so they can pick their CV voice in chat with concrete
    examples instead of abstract labels."""
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    check_rate_limit(request)
    llm = get_llm()
    try:
        return llm.tone_samples(req.profile, req.offer, req.ui_language)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")
