from fastapi import APIRouter, Header, HTTPException, Request

from app.middleware.security import verify_turnstile, check_rate_limit
from app.models import CVData, GenerateRequest
from app.services.llm import LLMService

router = APIRouter(prefix="/api", tags=["generate"])


def get_llm() -> LLMService:
    return LLMService()


@router.post("/generate-cv", response_model=CVData)
async def generate_cv(req: GenerateRequest, request: Request, x_captcha_token: str = Header("")):
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    check_rate_limit(request)
    llm = get_llm()
    try:
        return llm.generate_cv(req.profile, req.offer, req.gap_analysis, req.messages)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")
