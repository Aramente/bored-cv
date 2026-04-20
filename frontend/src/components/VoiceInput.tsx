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

  // Shared refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const activeRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Speech API: accumulated text from completed recognition sessions
  const frozenTextRef = useRef("");
  // Speech API: latest full text from current session (final + interim)
  const sessionFinalRef = useRef("");

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
    const rec = new SR();
    rec.lang = lang.startsWith("fr") ? "fr-FR" : "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    frozenTextRef.current = "";
    sessionFinalRef.current = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      // Save this session's final text so onend can freeze it
      sessionFinalRef.current = final;
      // Live preview: frozen (previous sessions) + current session final + current interim
      onInterim?.((frozenTextRef.current + final + interim).trim());
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      onError?.(event.error === "not-allowed" ? "Microphone access denied" : `Voice: ${event.error}`);
      activeRef.current = false;
      setActive(false);
      onListeningChange?.(false);
    };

    rec.onend = () => {
      if (!activeRef.current) return;
      // Chrome auto-restart: freeze this session's final text
      frozenTextRef.current += sessionFinalRef.current;
      sessionFinalRef.current = "";
      try { rec.start(); } catch {
        activeRef.current = false;
        setActive(false);
        onListeningChange?.(false);
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      activeRef.current = true;
      setActive(true);
      onListeningChange?.(true);
      onInterim?.("🎙️ listening...");
    } catch (e) {
      onError?.(`Could not start: ${(e as Error).message}`);
    }
  }, [lang, onInterim, onError, onListeningChange]);

  const stopSpeech = useCallback(() => {
    activeRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* */ }
    recognitionRef.current = null;
    setActive(false);
    onListeningChange?.(false);

    // Final text = frozen (previous sessions) + current session final + any remaining interim
    // onresult already accumulated sessionFinalRef, and the last onInterim call showed everything
    // Just grab whatever was last displayed
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
        ? "audio/webm;codecs=opus" : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 100) return;
        setTranscribing(true);
        onInterim?.("...");
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
    } catch { onError?.("Microphone access denied"); }
  }, [lang, onResult, onInterim, onError, onListeningChange]);

  const stopRecorder = useCallback(() => {
    if (recorderRef.current?.state !== "inactive") try { recorderRef.current?.stop(); } catch { /* */ }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setActive(false);
    onListeningChange?.(false);
  }, [onListeningChange]);

  // ===================== TOGGLE =====================

  const toggle = useCallback(() => {
    if (active) { mode === "speech" ? stopSpeech() : stopRecorder(); }
    else { mode === "speech" ? startSpeech() : startRecorder(); }
  }, [active, mode, startSpeech, stopSpeech, startRecorder, stopRecorder]);

  if (!mode) return null;

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
