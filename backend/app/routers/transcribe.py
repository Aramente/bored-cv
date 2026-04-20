import base64
import os

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
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 10MB)")
    if len(contents) < 100:
        return {"text": ""}

    content_type = file.content_type or "audio/webm"

    try:
        genai.configure(api_key=api_key)

        # Use inline base64 data — no file upload needed, faster on HF Spaces
        audio_b64 = base64.b64encode(contents).decode("utf-8")
        audio_part = {
            "inline_data": {
                "mime_type": content_type,
                "data": audio_b64,
            }
        }

        lang_name = "French" if x_lang.startswith("fr") else "English"
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(
            [
                audio_part,
                f"Transcribe this audio to text. The speaker is talking in {lang_name}. "
                f"Return ONLY the transcribed text, nothing else. No timestamps, no labels, no formatting. "
                f"If the audio is empty or inaudible, return an empty string.",
            ],
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=2000,
                temperature=0.1,
            ),
            request_options={"timeout": 60},
        )

        text = response.text.strip() if response.text else ""
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}")
