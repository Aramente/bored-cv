import { useCallback, useRef, useState } from "react";

interface Props {
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (msg: string) => void;
  onListeningChange?: (listening: boolean) => void;
  lang: string;
}

export default function VoiceInput({ onResult, onInterim, onError, onListeningChange, lang }: Props) {
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const fullTranscriptRef = useRef("");

  const supported = typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    listeningRef.current = false;
    onListeningChange?.(false);
    // Send the final accumulated transcript
    const final = fullTranscriptRef.current.trim();
    if (final) {
      onResult(final);
      fullTranscriptRef.current = "";
    }
  }, [onResult, onListeningChange]);

  const start = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = lang.startsWith("fr") ? "fr-FR" : "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    fullTranscriptRef.current = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      let finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      fullTranscriptRef.current = finalText;
      // Show live preview: final parts + current interim
      onInterim?.((finalText + interim).trim());
    };

    recognition.onerror = (event: any) => {
      const err = event.error;
      if (err === "not-allowed") {
        onError?.("Microphone access denied. Check browser permissions.");
      } else if (err === "no-speech") {
        // Don't stop — user might just be pausing
        return;
      } else if (err === "network") {
        onError?.("Network error. Voice requires an internet connection.");
      } else if (err !== "aborted") {
        onError?.(`Voice error: ${err || "unknown"}`);
      }
      setListening(false);
      listeningRef.current = false;
      onListeningChange?.(false);
    };

    recognition.onend = () => {
      // Use ref to avoid stale closure — state var would capture the value at start() time
      if (recognitionRef.current && listeningRef.current) {
        try { recognition.start(); } catch { /* already stopped */ }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    listeningRef.current = true;
    onListeningChange?.(true);
  }, [lang, onInterim, onError, onListeningChange]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, stop, start]);

  if (!supported) return null;

  return (
    <button
      className={`voice-btn ${listening ? "recording" : ""}`}
      onClick={toggle}
      type="button"
      title={listening ? "Click to stop & send" : "Click to speak"}
    >
      {listening ? (
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}
