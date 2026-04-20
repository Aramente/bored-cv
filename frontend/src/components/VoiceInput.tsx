import { useCallback, useRef, useState, useEffect } from "react";
import { transcribeAudio } from "../services/api";

interface Props {
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (msg: string) => void;
  onListeningChange?: (listening: boolean) => void;
  lang: string;
}

const hasSpeechAPI =
  typeof window !== "undefined" &&
  ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

const hasMediaRecorder =
  typeof window !== "undefined" && typeof MediaRecorder !== "undefined";

export default function VoiceInput({ onResult, onInterim, onError, onListeningChange, lang }: Props) {
  const [active, setActive] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const activeRef = useRef(false);
  const frozenTextRef = useRef("");
  const sessionFinalRef = useRef("");
  const restartCountRef = useRef(0);
  const restartTimerRef = useRef(0);
  const gotResultRef = useRef(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mode = hasSpeechAPI ? "speech" : hasMediaRecorder ? "recorder" : null;

  useEffect(() => {
    return () => {
      try { recognitionRef.current?.abort(); } catch { /* */ }
      if (recorderRef.current?.state !== "inactive") try { recorderRef.current?.stop(); } catch { /* */ }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ===================== WEB SPEECH API =====================

  const startSpeech = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      onError?.("Speech recognition not supported in this browser");
      return;
    }

    const rec = new SR();
    rec.lang = lang.startsWith("fr") ? "fr-FR" : "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    frozenTextRef.current = "";
    sessionFinalRef.current = "";
    restartCountRef.current = 0;
    restartTimerRef.current = Date.now();
    gotResultRef.current = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      gotResultRef.current = true;
      restartCountRef.current = 0; // Reset restart counter on successful result
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      sessionFinalRef.current = final;
      onInterim?.((frozenTextRef.current + final + interim).trim());
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (event: any) => {
      console.warn("[voice] error:", event.error);
      if (event.error === "aborted") return;
      if (event.error === "no-speech") {
        // Show feedback instead of silently ignoring
        if (!gotResultRef.current) {
          onInterim?.("🎙️ listening... (speak now)");
        }
        return;
      }
      if (event.error === "not-allowed") {
        onError?.("Microphone access denied — check browser permissions");
      } else if (event.error === "network") {
        onError?.("Network error — voice requires internet (Chrome uses Google servers)");
      } else {
        onError?.(`Voice error: ${event.error}`);
      }
      activeRef.current = false;
      setActive(false);
      onListeningChange?.(false);
    };

    rec.onend = () => {
      console.warn("[voice] onend, active:", activeRef.current, "restarts:", restartCountRef.current);
      if (!activeRef.current) return;

      // Prevent infinite restart loop
      restartCountRef.current++;
      const elapsed = Date.now() - restartTimerRef.current;
      if (restartCountRef.current > 5 && elapsed < 3000) {
        console.warn("[voice] too many restarts, giving up");
        onError?.("Voice keeps stopping — try refreshing the page or check mic permissions");
        activeRef.current = false;
        setActive(false);
        onListeningChange?.(false);
        return;
      }
      if (elapsed > 3000) {
        // Reset counter if enough time has passed (normal Chrome 60s restart)
        restartCountRef.current = 1;
        restartTimerRef.current = Date.now();
      }

      // Freeze current session's final text
      frozenTextRef.current += sessionFinalRef.current;
      sessionFinalRef.current = "";
      gotResultRef.current = false;

      try {
        rec.start();
        console.warn("[voice] restarted successfully");
      } catch (e) {
        console.warn("[voice] restart failed:", e);
        activeRef.current = false;
        setActive(false);
        onListeningChange?.(false);
        // Deliver whatever we have
        const text = frozenTextRef.current.trim();
        if (text) onResult(text);
        frozenTextRef.current = "";
        onInterim?.("");
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      activeRef.current = true;
      setActive(true);
      onListeningChange?.(true);
      onInterim?.("🎙️ listening...");
      console.warn("[voice] started, lang:", rec.lang);
    } catch (e) {
      console.warn("[voice] start failed:", e);
      onError?.(`Could not start voice: ${(e as Error).message}`);
    }
  }, [lang, onResult, onInterim, onError, onListeningChange]);

  const stopSpeech = useCallback(() => {
    console.warn("[voice] stopping");
    activeRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* */ }
    recognitionRef.current = null;
    setActive(false);
    onListeningChange?.(false);

    const text = (frozenTextRef.current + sessionFinalRef.current).trim();
    frozenTextRef.current = "";
    sessionFinalRef.current = "";
    onInterim?.("");

    if (text) {
      onResult(text);
    }
  }, [onResult, onInterim, onListeningChange]);

  // ===================== MEDIARECORDER FALLBACK =====================

  const startRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 100) return;
        setTranscribing(true);
        onInterim?.("transcribing...");
        try {
          const text = await transcribeAudio(blob, lang);
          if (text) onResult(text); else onError?.("No speech detected");
        } catch (e) {
          onError?.((e as Error).message || "Transcription failed");
        } finally {
          setTranscribing(false);
          onInterim?.("");
        }
      };

      recorderRef.current = rec;
      rec.start(1000);
      let secs = 0;
      timerRef.current = setInterval(() => {
        secs++;
        const m = Math.floor(secs / 60), s = secs % 60;
        onInterim?.(`🎙️ ${m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`}`);
      }, 1000);
      setActive(true);
      onListeningChange?.(true);
    } catch (e) {
      console.warn("[voice] recorder start failed:", e);
      onError?.("Microphone access denied");
    }
  }, [lang, onResult, onInterim, onError, onListeningChange]);

  const stopRecorder = useCallback(() => {
    if (recorderRef.current?.state !== "inactive") try { recorderRef.current?.stop(); } catch { /* */ }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setActive(false);
    onListeningChange?.(false);
  }, [onListeningChange]);

  // ===================== TOGGLE =====================

  const toggle = useCallback(() => {
    console.warn("[voice] toggle, active:", active, "mode:", mode);
    if (active) {
      mode === "speech" ? stopSpeech() : stopRecorder();
    } else {
      mode === "speech" ? startSpeech() : startRecorder();
    }
  }, [active, mode, startSpeech, stopSpeech, startRecorder, stopRecorder]);

  if (!mode) {
    console.warn("[voice] no mode available, not rendering");
    return null;
  }

  return (
    <button
      className={`voice-btn ${active ? "recording" : ""} ${transcribing ? "transcribing" : ""}`}
      onClick={toggle}
      type="button"
      disabled={transcribing}
      title={active ? "Click to stop" : transcribing ? "Transcribing..." : "Click to speak"}
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

declare global {
  interface Window {
    SpeechRecognition: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}
