from fastapi import APIRouter, File, UploadFile, HTTPException

from app.models import Profile
from app.services.pdf_parser import parse_linkedin_pdf

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
