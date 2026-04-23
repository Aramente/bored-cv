FROM python:3.11-slim

WORKDIR /app

# ffmpeg: normalize user-uploaded audio (webm/opus, mp4/aac, etc.) to 16 kHz
# mono WAV before sending to Voxtral — its supported list is mp3/wav/m4a/flac/ogg.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
