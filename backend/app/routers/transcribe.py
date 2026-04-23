import logging
import os
import shutil
import subprocess
import tempfile

from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from mistralai.client import Mistral

from app.middleware.security import verify_turnstile, check_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["transcribe"])

MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY", "")
HAS_FFMPEG = shutil.which("ffmpeg") is not None


def _normalize_to_wav(contents: bytes) -> bytes:
    """Transcode arbitrary audio bytes into 16 kHz mono 16-bit PCM WAV.

    Voxtral officially accepts mp3/wav/m4a/flac/ogg — webm/opus from browsers
    is not on that list, so we normalize server-side to guarantee a supported
    container and a consistent sample rate.
    """
    if not HAS_FFMPEG:
        raise RuntimeError("ffmpeg not available on server")

    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner", "-loglevel", "error",
            "-i", "pipe:0",     # read input from stdin
            "-ac", "1",         # mono
            "-ar", "16000",     # 16 kHz
            "-c:a", "pcm_s16le",
            "-f", "wav",
            "pipe:1",           # write output to stdout
        ],
        input=contents,
        capture_output=True,
        timeout=60,
        check=False,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"ffmpeg transcode failed: {err}")
    if not proc.stdout or len(proc.stdout) < 100:
        raise RuntimeError("ffmpeg produced empty output")
    return proc.stdout


def _transcribe_mistral_sync(wav_bytes: bytes, lang: str, context_bias: list[str] | None = None) -> str:
    """Blocking Voxtral SDK call — must be run in threadpool."""
    client = Mistral(api_key=MISTRAL_API_KEY)
    kwargs = {
        "model": "voxtral-mini-latest",
        "file": {"file_name": "audio.wav", "content": wav_bytes},
        "language": lang,
    }
    if context_bias:
        # Voxtral requires each term to match ^[^,\s]+$ — no spaces, no commas.
        # Split multi-word inputs into individual tokens, dedupe, cap at 20.
        seen: set[str] = set()
        cleaned: list[str] = []
        for term in context_bias:
            raw = (term or "").replace(",", " ")
            for tok in raw.split():
                t = tok.strip()
                if not t or t.lower() in seen:
                    continue
                seen.add(t.lower())
                cleaned.append(t)
                if len(cleaned) >= 20:
                    break
            if len(cleaned) >= 20:
                break
        if cleaned:
            kwargs["context_bias"] = cleaned
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
    if not HAS_FFMPEG:
        raise HTTPException(status_code=503, detail="Audio transcoder not available on server")

    # Optional context_bias from form body (JSON-encoded list of strings)
    form = await request.form()
    context_bias_raw = form.get("context_bias", "")
    context_bias: list[str] = []
    if context_bias_raw:
        try:
            import json
            parsed = json.loads(str(context_bias_raw))
            if isinstance(parsed, list):
                context_bias = [str(x) for x in parsed if x]
        except Exception:
            pass

    contents = await file.read()
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 25MB)")
    if len(contents) < 100:
        return {"text": ""}

    lang = "fr" if x_lang.startswith("fr") else "en"

    # Normalize to 16 kHz mono WAV so Voxtral gets a format on its supported list
    try:
        wav_bytes = await run_in_threadpool(_normalize_to_wav, contents)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Audio transcode timeout") from None
    except Exception as e:
        logger.warning("Audio normalization failed: %s", e)
        raise HTTPException(status_code=400, detail="Could not decode audio — is the file a valid recording?") from e

    try:
        text = await run_in_threadpool(
            _transcribe_mistral_sync, wav_bytes, lang, context_bias or None
        )
        return {"text": text}
    except Exception as e:
        logger.exception("Voxtral transcription failed")
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}") from e
