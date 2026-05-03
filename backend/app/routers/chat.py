from fastapi import APIRouter, Header, HTTPException, Request

from app.middleware.security import verify_turnstile, check_rate_limit
from app.models import (
    AgentBrief,
    AnalyzeRequest,
    BriefRequest,
    ChatRequest,
    ChatResponse,
    GapAnalysis,
)
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
        return llm.analyze(req.profile, req.offer, req.ui_language)
    except Exception:
        import logging
        logging.exception("LLM call failed")
        raise HTTPException(status_code=502, detail="AI service error")


@router.post("/brief", response_model=AgentBrief)
async def brief(req: BriefRequest, request: Request, x_captcha_token: str = Header("")):
    """Pre-chat agent brief — fuses recruiter-as-gatekeeper and agent-as-
    seller views of (CV, offer) into a single diagnostic that drives the
    chat. Frontend calls this once after /api/analyze, persists the result
    on the session, and includes it in every /api/chat call.

    Failure-tolerant: returns an empty AgentBrief on LLM failure so the
    frontend can either retry or fall through to the legacy theme-ranked
    chat. The chat handler treats an empty brief as opt-out."""
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    check_rate_limit(request)
    llm = get_llm()
    try:
        return llm.agent_brief(req.profile, req.offer, req.gap_analysis, req.ui_language)
    except Exception:
        import logging
        logging.exception("agent_brief call failed; returning empty brief")
        return AgentBrief()


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request, x_captcha_token: str = Header("")):
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    check_rate_limit(request)
    llm = get_llm()
    try:
        return llm.generate_next_question(
            req.profile, req.offer, req.gap_analysis, req.messages, req.ui_language,
            known_facts=req.known_facts, contradictions=req.contradictions,
            cv_draft=req.cv_draft,
            agent_brief=req.agent_brief,
        )
    except Exception:
        import logging
        logging.exception("LLM call failed")
        raise HTTPException(status_code=502, detail="AI service error")
