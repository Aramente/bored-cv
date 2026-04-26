from fastapi import APIRouter, Header, HTTPException, Request

from app.middleware.security import verify_turnstile, check_rate_limit
from app.models import CoverLetterData, CoverLetterRequest
from app.services.llm import LLMService

router = APIRouter(prefix="/api", tags=["cover-letter"])


def get_llm() -> LLMService:
    return LLMService()


@router.post("/generate-cover-letter", response_model=CoverLetterData)
async def generate_cover_letter(req: CoverLetterRequest, request: Request, x_captcha_token: str = Header("")):
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    check_rate_limit(request)
    llm = get_llm()
    try:
        return llm.generate_cover_letter(req.profile, req.offer, req.cv_data, req.messages, req.ui_language, req.tone, req.target_market)
    except Exception:
        import logging
        logging.exception("LLM call failed")
        raise HTTPException(status_code=502, detail="AI service error")
