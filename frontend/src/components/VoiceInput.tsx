import { useCallback, useRef, useState } from "react";
import { transcribeAudio } from "../services/api";

interface Props {
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (msg: string) => void;
  onListeningChange?: (listening: boolean) => void;
  lang: string;
}

export default function VoiceInput({ onResult, onInterim, onError, onListeningChange, lang }: Props) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);

  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    onListeningChange?.(false);
  }, [onListeningChange]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Find best supported mime type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 100) {
          onError?.("No audio recorded");
          return;
        }

        // Show transcribing state
        setTranscribing(true);
        onInterim?.("...");

        try {
          const text = await transcribeAudio(blob, lang);
          if (text) {
            onResult(text);
          } else {
            onError?.("No speech detected");
          }
        } catch (e) {
          onError?.((e as Error).message || "Transcription failed");
        } finally {
          setTranscribing(false);
          onInterim?.("");
        }
      };

      recorderRef.current = recorder;
      recorder.start(1000); // Collect data every second

      // Live duration counter
      secondsRef.current = 0;
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        const mins = Math.floor(secondsRef.current / 60);
        const secs = secondsRef.current % 60;
        const time = mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
        onInterim?.(`🎙️ ${time}`);
      }, 1000);

      setRecording(true);
      onListeningChange?.(true);
    } catch {
      onError?.("Microphone access denied. Check browser permissions.");
    }
  }, [lang, onResult, onInterim, onError, onListeningChange]);

  const toggle = useCallback(() => {
    if (recording) {
      stop();
    } else {
      start();
    }
  }, [recording, stop, start]);

  if (!supported) return null;

  return (
    <button
      className={`voice-btn ${recording ? "recording" : ""} ${transcribing ? "transcribing" : ""}`}
      onClick={toggle}
      type="button"
      disabled={transcribing}
      title={recording ? "Click to stop & transcribe" : transcribing ? "Transcribing..." : "Click to speak"}
    >
      {transcribing ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin">
          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
        </svg>
      ) : recording ? (
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
