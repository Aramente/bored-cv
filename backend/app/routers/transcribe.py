import os
import tempfile

from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile
from mistralai.client import Mistral

from app.middleware.security import verify_turnstile, check_rate_limit

router = APIRouter(prefix="/api", tags=["transcribe"])

MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY", "")


def _ext_for(content_type: str) -> str:
    ct = (content_type or "").lower()
    if "mp4" in ct or "m4a" in ct or "aac" in ct:
        return ".mp4"
    if "ogg" in ct:
        return ".ogg"
    if "wav" in ct:
        return ".wav"
    if "mpeg" in ct or "mp3" in ct:
        return ".mp3"
    return ".webm"


async def _transcribe_mistral(contents: bytes, content_type: str, lang: str, context_bias: list[str] | None = None) -> str:
    """Transcribe via Mistral Voxtral."""
    suffix = _ext_for(content_type)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        client = Mistral(api_key=MISTRAL_API_KEY)
        with open(tmp_path, "rb") as fh:
            kwargs = {
                "model": "voxtral-mini-latest",
                "file": fh,
                "language": lang,
            }
            if context_bias:
                kwargs["context_bias"] = context_bias
            result = client.audio.transcriptions.complete(**kwargs)
        return result.text.strip() if result and result.text else ""
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


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
