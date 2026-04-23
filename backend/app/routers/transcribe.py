import os

from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile
from mistralai.client import Mistral

from app.middleware.security import verify_turnstile, check_rate_limit

router = APIRouter(prefix="/api", tags=["transcribe"])

MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY", "")


def _filename_for(content_type: str) -> str:
    ct = (content_type or "").lower()
    if "mp4" in ct or "m4a" in ct or "aac" in ct:
        return "audio.mp4"
    if "ogg" in ct:
        return "audio.ogg"
    if "wav" in ct:
        return "audio.wav"
    if "mpeg" in ct or "mp3" in ct:
        return "audio.mp3"
    return "audio.webm"


async def _transcribe_mistral(contents: bytes, content_type: str, lang: str, context_bias: list[str] | None = None) -> str:
    """Transcribe via Mistral Voxtral."""
    client = Mistral(api_key=MISTRAL_API_KEY)
    kwargs = {
        "model": "voxtral-mini-latest",
        "file": {"file_name": _filename_for(content_type), "content": contents},
        "language": lang,
    }
    if context_bias:
        kwargs["context_bias"] = context_bias
    result = client.audio.transcriptions.complete(**kwargs)
    return result.text.strip() if result and result.text else ""


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

    if not MISTRAL_API_KEY:
        raise HTTPException(status_code=503, detail="Transcription service not configured")

    # Read form data for context_bias (company names, etc.)
    form = await request.form()
    context_bias_raw = form.get("context_bias", "")
    context_bias: list[str] = []
    if context_bias_raw:
        try:
            import json
            context_bias = json.loads(str(context_bias_raw))
        except Exception:
            pass

    contents = await file.read()
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 25MB)")
    if len(contents) < 100:
        return {"text": ""}

    lang = "fr" if x_lang.startswith("fr") else "en"
    content_type = file.content_type or "audio/webm"

    try:
        text = await _transcribe_mistral(contents, content_type, lang, context_bias or None)
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}") from e
