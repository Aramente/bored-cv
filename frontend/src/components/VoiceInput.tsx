import { useCallback, useRef, useState, useEffect } from "react";
import { transcribeAudio } from "../services/api";

interface Props {
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (msg: string) => void;
  onListeningChange?: (listening: boolean) => void;
  lang: string;
}

const hasMediaRecorder =
  typeof window !== "undefined" && typeof MediaRecorder !== "undefined";

export default function VoiceInput({ onResult, onInterim, onError, onListeningChange, lang }: Props) {
  const [active, setActive] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>("audio/webm");

  useEffect(() => {
    return () => {
      try { recorderRef.current?.state !== "inactive" && recorderRef.current?.stop(); } catch { /* */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const pickMime = (): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const m of candidates) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return "audio/webm";
  };

  const start = useCallback(async () => {
    if (!hasMediaRecorder) {
      onError?.("Audio recording not supported in this browser");
      return;
    }
    if (!window.isSecureContext) {
      onError?.("Mic requires HTTPS — try the deployed site, not a local IP");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.("Mic API unavailable in this browser");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (e) {
      const err = e as DOMException;
      console.warn("[voice] getUserMedia failed:", err.name, err.message);
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        onError?.("Microphone access denied — allow mic in browser + OS settings");
      } else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
        onError?.("No microphone found — plug one in or check System Settings");
      } else if (err.name === "NotReadableError") {
        onError?.("Mic is busy — close other apps using it (Zoom, QuickTime, other tabs)");
      } else {
        onError?.(`Mic error: ${err.message || err.name}`);
      }
      return;
    }

    streamRef.current = stream;
    const mime = pickMime();
    mimeRef.current = mime;

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime });
    } catch (e) {
      console.warn("[voice] MediaRecorder init failed:", e);
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      onError?.("Could not start recorder — unsupported audio format");
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setActive(false);
      onListeningChange?.(false);

      const blob = new Blob(chunksRef.current, { type: mimeRef.current });
      chunksRef.current = [];

      if (blob.size < 500) {
        onInterim?.("");
        onError?.("Nothing recorded — hold the button and speak");
        return;
      }

      setTranscribing(true);
      onInterim?.(lang.startsWith("fr") ? "transcription…" : "transcribing…");
      try {
        const text = await transcribeAudio(blob, lang);
        if (text) {
          onResult(text);
          onInterim?.("");
        } else {
          onInterim?.("");
          onError?.(lang.startsWith("fr") ? "Pas de parole détectée" : "No speech detected");
        }
      } catch (e) {
        console.warn("[voice] transcribe failed:", e);
        onInterim?.("");
        const msg = (e as Error).message || "Transcription failed";
        onError?.(msg);
      } finally {
        setTranscribing(false);
      }
    };

    rec.onerror = (e: Event) => {
      console.warn("[voice] recorder error:", e);
      onError?.("Recorder error — try again");
      try { rec.stop(); } catch { /* */ }
    };

    recorderRef.current = rec;
    rec.start(1000);

    const MAX_SECS = 120;
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    const isFr = lang.startsWith("fr");
    let secs = 0;
    const tick = () => {
      const remaining = MAX_SECS - secs;
      if (remaining <= 20 && remaining > 0) {
        onInterim?.(isFr ? `🎙️ ${remaining}s restantes (max 2 min)` : `🎙️ ${remaining}s left (2 min max)`);
      } else {
        onInterim?.(isFr ? `🎙️ j'écoute… ${fmt(secs)} / 2:00` : `🎙️ listening… ${fmt(secs)} / 2:00`);
      }
    };
    tick();
    timerRef.current = setInterval(() => {
      secs++;
      tick();
      if (secs >= MAX_SECS) {
        try { rec.state !== "inactive" && rec.stop(); } catch { /* */ }
      }
    }, 1000);

    setActive(true);
    onListeningChange?.(true);
  }, [lang, onResult, onInterim, onError, onListeningChange]);

  const stop = useCallback(() => {
    // State reset happens in rec.onstop so it covers both manual + auto-stop paths
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch { /* */ }
  }, []);

  const toggle = useCallback(() => {
    if (active) stop(); else start();
  }, [active, start, stop]);

  if (!hasMediaRecorder) return null;

  return (
    <button
      className={`voice-btn ${active ? "recording" : ""} ${transcribing ? "transcribing" : ""}`}
      onClick={toggle}
      type="button"
      disabled={transcribing}
      title={
        active
          ? (lang.startsWith("fr") ? "Cliquer pour arrêter" : "Click to stop")
          : transcribing
          ? (lang.startsWith("fr") ? "Transcription…" : "Transcribing…")
          : (lang.startsWith("fr") ? "Parler (max 2 min)" : "Click to speak (max 2 min)")
      }
    >
      {transcribing ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin">
          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
        </svg>
      ) : active ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )}
    </button>
  );
}
