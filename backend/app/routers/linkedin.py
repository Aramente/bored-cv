import json
import os
import traceback

from fastapi import APIRouter, File, UploadFile, HTTPException

from app.models import Profile
from app.services.pdf_parser import parse_linkedin_pdf, extract_pdf_text

router = APIRouter(prefix="/api", tags=["linkedin"])


@router.post("/parse-linkedin", response_model=Profile)
async def parse_linkedin(file: UploadFile = File(...)):
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
async def debug_parse_pdf(file: UploadFile = File(...)):
    """Debug: show exactly what happens when parsing a PDF."""
    contents = await file.read()
    raw_text = extract_pdf_text(contents)

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return {"error": "no GEMINI_API_KEY", "text_length": len(raw_text)}

    import google.generativeai as genai
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash-lite")

    prompt = f"""Extract structured profile data from this LinkedIn PDF export.

RAW TEXT:
{raw_text[:8000]}

Return valid JSON with: name, title, email, phone, linkedin, location, summary, experiences (array), education (array), skills (array), languages (array). Use empty string for missing fields."""

    try:
        r = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=4000,
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )
        data = json.loads(r.text)
        return {
            "ok": True,
            "name": data.get("name"),
            "title": data.get("title"),
            "experiences_count": len(data.get("experiences", [])),
            "education_count": len(data.get("education", [])),
            "languages": data.get("languages", []),
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "traceback": traceback.format_exc()[:1000], "text_length": len(raw_text)}
