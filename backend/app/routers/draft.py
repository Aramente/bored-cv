from fastapi import APIRouter, Header, HTTPException, Request

from app.middleware.security import verify_turnstile, check_rate_limit
from app.models import (
    ApplyGrammarFixesRequest, ApplyGrammarFixesResponse,
    AuditCvRequest, AuditCvResponse, CVData, GenerateRequest,
    ImproveBulletRequest, ImproveBulletResponse, ToneSamples, ToneSamplesRequest,
)
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


@router.post("/improve-bullet", response_model=ImproveBulletResponse)
async def improve_bullet(req: ImproveBulletRequest, request: Request, x_captcha_token: str = Header("")):
    """Per-bullet "improve wording" rewrite — the Notion-style hover button on the editor."""
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    check_rate_limit(request)
    llm = get_llm()
    try:
        out = llm.improve_bullet(
            text=req.text,
            role=req.role,
            company=req.company,
            offer_title=req.offer_title,
            ui_language=req.ui_language,
            tone=req.tone,
        )
        return ImproveBulletResponse(text=out)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")


@router.post("/audit-cv", response_model=AuditCvResponse)
async def audit_cv(req: AuditCvRequest, request: Request, x_captcha_token: str = Header("")):
    """End-of-edit CV audit — grammar, missing-vs-offer, and last-mile advice."""
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    check_rate_limit(request)
    llm = get_llm()
    try:
        out = llm.audit_cv(req.cv_data, req.offer, req.ui_language)
        return AuditCvResponse(**out)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")


@router.post("/apply-grammar-fixes", response_model=ApplyGrammarFixesResponse)
async def apply_grammar_fixes(req: ApplyGrammarFixesRequest, request: Request, x_captcha_token: str = Header("")):
    """Apply only the grammar bucket of an audit. Returns the rewritten CV
    plus how many substitutions actually landed (the LLM may hallucinate
    paths or `old` strings that don't exist — those are skipped silently)."""
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    check_rate_limit(request)
    llm = get_llm()
    try:
        findings = [f.model_dump() for f in req.findings]
        out = llm.apply_grammar_fixes(req.cv_data, findings, req.ui_language)
        return ApplyGrammarFixesResponse(
            cv_data=CVData(**out["cv_data"]),
            applied=out.get("applied", 0),
            skipped=out.get("skipped", 0),
            skipped_indices=out.get("skipped_indices", []),
        )
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
