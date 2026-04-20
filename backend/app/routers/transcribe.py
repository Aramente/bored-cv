import os

import httpx
from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile

from app.middleware.security import verify_turnstile, check_rate_limit

router = APIRouter(prefix="/api", tags=["transcribe"])

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")


@router.post("/transcribe")
async def transcribe_audio(
    request: Request,
    file: UploadFile = File(...),
    x_captcha_token: str = Header(""),
    x_lang: str = Header("en"),
):
    if not await verify_turnstile(x_captcha_token):
        raise HTTPException(status_code=403, detail="Captcha verification failed")
    check_rate_limit(request)

    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="Transcription service unavailable")

    contents = await file.read()
    if len(contents) > 25 * 1024 * 1024:  # Groq supports up to 25MB
        raise HTTPException(status_code=400, detail="Audio file too large (max 25MB)")
    if len(contents) < 100:
        return {"text": ""}

    lang = "fr" if x_lang.startswith("fr") else "en"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                files={"file": ("recording.webm", contents, file.content_type or "audio/webm")},
                data={
                    "model": "whisper-large-v3",
                    "language": lang,
                    "response_format": "text",
                },
            )

        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Transcription failed: {resp.text[:200]}")

        text = resp.text.strip()
        return {"text": text}
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Transcription timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}")
