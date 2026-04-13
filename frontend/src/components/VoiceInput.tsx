import { useCallback, useRef, useState } from "react";

interface Props {
  onResult: (text: string) => void;
  onError?: (msg: string) => void;
  lang: string;
}

export default function VoiceInput({ onResult, onError, lang }: Props) {
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const supported = typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const toggle = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = lang.startsWith("fr") ? "fr-FR" : "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0][0].transcript;
      onResult(text);
      setListening(false);
    };

    recognition.onerror = (event: any) => {
      setListening(false);
      const err = event.error;
      if (err === "not-allowed") {
        onError?.("Microphone access denied. Check your browser permissions.");
      } else if (err === "no-speech") {
        onError?.("No speech detected. Try again.");
      } else if (err === "network") {
        onError?.("Network error. Voice requires an internet connection.");
      } else {
        onError?.(`Voice error: ${err || "unknown"}`);
      }
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, onResult, lang]);

  if (!supported) return null;

  return (
    <button
      className={`voice-btn ${listening ? "recording" : ""}`}
      onClick={toggle}
      type="button"
      title={listening ? "Stop" : "Speak"}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  );
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}
