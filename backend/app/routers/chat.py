from fastapi import APIRouter, Header, HTTPException, Request

from app.middleware.security import verify_turnstile, check_rate_limit
from app.models import AnalyzeRequest, ChatRequest, ChatResponse, GapAnalysis
from app.services.llm import LLMService

router = APIRouter(prefix="/api", tags=["chat"])


def get_llm() -> LLMService:
    return LLMService()


@router.post("/analyze", response_model=GapAnalysis)
async def analyze(req: AnalyzeRequest, request: Request, x_captcha_token: str = Header("")):
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    check_rate_limit(request)
    llm = get_llm()
    try:
        return llm.analyze(req.profile, req.offer)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request, x_captcha_token: str = Header("")):
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    llm = get_llm()
    try:
        return llm.generate_next_question(req.profile, req.offer, req.gap_analysis, req.messages)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")
