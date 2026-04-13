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
    except Exception:
        raise HTTPException(status_code=422, detail="Could not parse PDF")

    if not profile.name:
        raise HTTPException(status_code=422, detail="Could not extract profile data from PDF")

    return profile
