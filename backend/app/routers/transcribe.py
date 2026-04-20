import os

import httpx
from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile

from app.middleware.security import verify_turnstile, check_rate_limit

router = APIRouter(prefix="/api", tags=["transcribe"])

MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY", "")


async def _transcribe_mistral(contents: bytes, content_type: str, lang: str) -> str:
    """Transcribe via Mistral Voxtral (audio transcription endpoint)."""
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            "https://api.mistral.ai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {MISTRAL_API_KEY}"},
            files={"file": ("recording.webm", contents, content_type)},
            data={
                "model": "mistral-small-latest",
                "language": lang,
                "response_format": "text",
            },
        )
    if resp.status_code != 200:
        raise Exception(f"Mistral STT error {resp.status_code}: {resp.text[:200]}")
    return resp.text.strip()


async def _transcribe_hf_whisper(contents: bytes, content_type: str) -> str:
    """Fallback: transcribe via HF Inference API (free Whisper endpoint)."""
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            "https://api-inference.huggingface.co/models/openai/whisper-large-v3",
            headers={"Content-Type": content_type},
            content=contents,
        )
    if resp.status_code != 200:
        raise Exception(f"HF error {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    return data.get("text", "").strip() if isinstance(data, dict) else ""


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

    contents = await file.read()
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 25MB)")
    if len(contents) < 100:
        return {"text": ""}

    lang = "fr" if x_lang.startswith("fr") else "en"
    content_type = file.content_type or "audio/webm"

    # Try Mistral Voxtral first, fallback to HF Whisper (free, no key needed)
    errors = []
    if MISTRAL_API_KEY:
        try:
            text = await _transcribe_mistral(contents, content_type, lang)
            if text:
                return {"text": text}
        except Exception as e:
            errors.append(f"Mistral: {e}")

    try:
        text = await _transcribe_hf_whisper(contents, content_type)
        if text:
            return {"text": text}
    except Exception as e:
        errors.append(f"HF: {e}")

    detail = " | ".join(errors) if errors else "No transcription service available"
    raise HTTPException(status_code=502, detail=f"Transcription failed: {detail}")
