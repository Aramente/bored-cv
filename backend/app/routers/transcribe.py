import os
import tempfile

import google.generativeai as genai
from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile

from app.middleware.security import verify_turnstile, check_rate_limit

router = APIRouter(prefix="/api", tags=["transcribe"])


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

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Transcription service unavailable")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:  # 10MB max
        raise HTTPException(status_code=400, detail="Audio file too large (max 10MB)")
    if len(contents) < 100:
        return {"text": ""}

    # Determine mime type from filename or content type
    content_type = file.content_type or "audio/webm"
    suffix = ".webm"
    if "mp4" in content_type or "m4a" in content_type:
        suffix = ".m4a"
    elif "wav" in content_type:
        suffix = ".wav"
    elif "ogg" in content_type:
        suffix = ".ogg"

    # Write to temp file for Gemini upload
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        genai.configure(api_key=api_key)

        # Upload audio file to Gemini
        audio_file = genai.upload_file(tmp_path, mime_type=content_type)

        lang_name = "French" if x_lang.startswith("fr") else "English"
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(
            [
                audio_file,
                f"Transcribe this audio to text. The speaker is talking in {lang_name}. "
                f"Return ONLY the transcribed text, nothing else. No timestamps, no labels, no formatting. "
                f"If the audio is empty or inaudible, return an empty string.",
            ],
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=2000,
                temperature=0.1,
            ),
            request_options={"timeout": 30},
        )

        text = response.text.strip() if response.text else ""
        # Clean up uploaded file
        try:
            genai.delete_file(audio_file.name)
        except Exception:
            pass

        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}")
    finally:
        import os as _os
        try:
            _os.unlink(tmp_path)
        except Exception:
            pass
