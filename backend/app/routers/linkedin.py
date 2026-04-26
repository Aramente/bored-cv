import json
import os
import traceback

from fastapi import APIRouter, File, Header, Request, UploadFile, HTTPException

from app.middleware.security import check_rate_limit
from app.models import Profile
from app.services.pdf_parser import parse_linkedin_pdf, extract_pdf_text

ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "")

router = APIRouter(prefix="/api", tags=["linkedin"])


@router.post("/parse-linkedin", response_model=Profile)
async def parse_linkedin(request: Request, file: UploadFile = File(...)):
    # Rate limit before doing any expensive work — this endpoint hits the LLM
    # and burns Mistral tokens. Anonymous: 50/day per IP. Authenticated: 500.
    check_rate_limit(request)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    try:
        profile = parse_linkedin_pdf(contents)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {e}")

    if not profile.name:
        raise HTTPException(status_code=422, detail="Could not extract profile data from PDF")

    # Return with debug info if parsing fell back to basic parser
    if len(profile.experiences) == 0 and len(contents) > 1000:
        # Likely fell back — return what we got but flag it
        import logging
        logging.warning(f"PDF parser returned 0 experiences for {len(contents)} byte file — likely fell back to basic parser")

    return profile


@router.post("/debug-parse-pdf")
async def debug_parse_pdf(file: UploadFile = File(...), x_admin_secret: str = Header("")):
    """Debug: show exactly what happens when parsing a PDF. Protected by ADMIN_SECRET header."""
    if not ADMIN_SECRET or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")
    contents = await file.read()
    raw_text = extract_pdf_text(contents)

    api_key = os.environ.get("MISTRAL_API_KEY", "")
    if not api_key:
        return {"error": "no MISTRAL_API_KEY", "text_length": len(raw_text)}

    from mistralai.client import Mistral
    client = Mistral(api_key=api_key)

    prompt = f"""Extract structured profile data from this LinkedIn PDF export.

RAW TEXT:
{raw_text[:8000]}

Return valid JSON with: name, title, email, phone, linkedin, location, summary, experiences (array), education (array), skills (array), languages (array). Use empty string for missing fields."""

    try:
        r = client.chat.complete(
            model="mistral-small-latest",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=4000,
            temperature=0.1,
        )
        raw_resp = r.choices[0].message.content.strip() if r.choices[0].message.content else ""
        return {
            "ok": True,
            "text_len": len(raw_resp),
            "text_preview": raw_resp[:300],
            "provider": "mistral",
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "traceback": traceback.format_exc()[:1000], "text_length": len(raw_text)}
