import { useCallback, useRef, useState, useEffect } from "react";
import { transcribeAudio } from "../services/api";

interface Props {
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (msg: string) => void;
  onListeningChange?: (listening: boolean) => void;
  lang: string;
  /** Names/terms to bias Voxtral toward (companies, people, jargon). */
  contextBias?: string[];
}

const hasMediaRecorder =
  typeof window !== "undefined" && typeof MediaRecorder !== "undefined";

const MIC_PREF_KEY = "bored-cv:preferred-mic";

// Devices we almost always want to avoid auto-selecting (macOS Continuity Mic,
// AirPods that aren't in use, etc.). User can still pick them from the dropdown.
const AUTO_EXCLUDE_RE = /\b(iphone|ipad|continuity|airpods)\b/i;

export default function VoiceInput({ onResult, onInterim, onError, onListeningChange, lang, contextBias }: Props) {
  const [active, setActive] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>(() => localStorage.getItem(MIC_PREF_KEY) || "");
  const [showPicker, setShowPicker] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>("audio/webm");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceAccumRef = useRef(0);
  const soundSeenRef = useRef(false);

  useEffect(() => {
    return () => {
      try { recorderRef.current?.state !== "inactive" && recorderRef.current?.stop(); } catch { /* */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      try { audioCtxRef.current?.close(); } catch { /* */ }
    };
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter((d) => d.kind === "audioinput" && d.deviceId);
      setDevices(mics);
      if (deviceId) {
        const current = mics.find((m) => m.deviceId === deviceId);
        // Clear stale preference: device gone, OR it's an iPhone/Continuity one
        // picked before we started filtering those.
        if (!current || (current.label && AUTO_EXCLUDE_RE.test(current.label))) {
          setDeviceId("");
          localStorage.removeItem(MIC_PREF_KEY);
        }
      }
    } catch (e) {
      console.warn("[voice] enumerateDevices failed:", e);
    }
  }, [deviceId]);

  useEffect(() => {
    refreshDevices();
    // Labels are only populated after getUserMedia has been granted at least
    // once. The devicechange event also fires when Continuity Mic connects.
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
    };
  }, [refreshDevices]);

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

  const pickDeviceId = (mics: MediaDeviceInfo[]): string | undefined => {
    if (deviceId && mics.some((m) => m.deviceId === deviceId)) return deviceId;
    // Filter out known problem devices (iPhone via Continuity, etc.)
    const safe = mics.filter((m) => !AUTO_EXCLUDE_RE.test(m.label));
    const preferred = safe.find((m) => m.deviceId === "default") || safe[0];
    return preferred?.deviceId;
  };

  const chooseDevice = (id: string) => {
    setDeviceId(id);
    if (id) localStorage.setItem(MIC_PREF_KEY, id);
    else localStorage.removeItem(MIC_PREF_KEY);
    setShowPicker(false);
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

    // Re-enumerate so we have the freshest list (labels populated after perm grant)
    await refreshDevices();
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    const mics = all.filter((d) => d.kind === "audioinput" && d.deviceId);

    const chosenId = pickDeviceId(mics);
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (chosenId) audioConstraints.deviceId = { exact: chosenId };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (e) {
      // If exact deviceId fails (device unplugged), retry without constraint
      if (chosenId && (e as DOMException).name === "OverconstrainedError") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          // Clear stale preference
          setDeviceId("");
          localStorage.removeItem(MIC_PREF_KEY);
        } catch (e2) {
          const err = e2 as DOMException;
          console.warn("[voice] getUserMedia fallback failed:", err.name);
          onError?.(lang.startsWith("fr") ? "Pas de micro disponible" : "No microphone available");
          return;
        }
      } else {
        const err = e as DOMException;
        console.warn("[voice] getUserMedia failed:", err.name, err.message);
        const isFr = lang.startsWith("fr");
        if (err.name === "NotAllowedError" || err.name === "SecurityError") {
          onError?.(isFr ? "Accès micro refusé — autorise dans le navigateur + Réglages Système" : "Microphone access denied — allow mic in browser + OS settings");
        } else if (err.name === "NotFoundError") {
          onError?.(isFr ? "Aucun micro détecté" : "No microphone found");
        } else if (err.name === "NotReadableError") {
          onError?.(isFr ? "Micro occupé — ferme Zoom, QuickTime, autres onglets" : "Mic is busy — close other apps (Zoom, QuickTime, other tabs)");
        } else {
          onError?.(`Mic error: ${err.message || err.name}`);
        }
        return;
      }
    }

    // Refresh again now that labels are guaranteed to be populated
    refreshDevices();

    // Log which device we actually got (helps user + debugging)
    const activeTrack = stream.getAudioTracks()[0];
    const activeLabel = activeTrack?.label || "unknown";
    console.warn("[voice] recording from:", activeLabel);

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

    // Audio level monitoring — catches silent-mic case early
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch (e) {
      console.warn("[voice] analyser setup failed:", e);
    }

    chunksRef.current = [];
    silenceAccumRef.current = 0;
    soundSeenRef.current = false;
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      try { audioCtxRef.current?.close(); } catch { /* */ }
      audioCtxRef.current = null;
      analyserRef.current = null;
      setActive(false);
      onListeningChange?.(false);

      const blob = new Blob(chunksRef.current, { type: mimeRef.current });
      chunksRef.current = [];

      const isFr = lang.startsWith("fr");
      if (blob.size < 500) {
        onInterim?.("");
        onError?.(isFr ? "Rien enregistré — reste appuyé sur le bouton et parle" : "Nothing recorded — hold the button and speak");
        return;
      }
      // If we detected silence throughout, don't waste a round-trip
      if (!soundSeenRef.current) {
        onInterim?.("");
        onError?.(isFr
          ? `Micro silencieux (${activeLabel}) — vérifie la source audio ou change de micro`
          : `Mic was silent (${activeLabel}) — check audio source or switch mic`);
        return;
      }

      setTranscribing(true);
      // Clear the "listening…" text from the textarea BEFORE awaiting, so if
      // transcription takes a moment the user isn't staring at stale text.
      // Don't touch it again on success — onResult writes the transcript and
      // any onInterim("") after that would wipe it.
      onInterim?.("");
      try {
        const text = await transcribeAudio(blob, lang, contextBias);
        if (text) {
          onResult(text);
        } else {
          onError?.(isFr ? "Pas de parole détectée" : "No speech detected");
        }
      } catch (e) {
        console.warn("[voice] transcribe failed:", e);
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
    const SILENCE_THRESHOLD = 0.01; // RMS on [0,1] — anything above is "heard something"
    const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    const isFr = lang.startsWith("fr");
    let secs = 0;
    const sampleBuffer = new Uint8Array(analyserRef.current?.frequencyBinCount || 256);

    const measureLevel = (): number => {
      const a = analyserRef.current;
      if (!a) return 0;
      a.getByteTimeDomainData(sampleBuffer);
      let sum = 0;
      for (let i = 0; i < sampleBuffer.length; i++) {
        const v = (sampleBuffer[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / sampleBuffer.length);
    };

    const tick = () => {
      const level = measureLevel();
      if (level > SILENCE_THRESHOLD) {
        soundSeenRef.current = true;
        silenceAccumRef.current = 0;
      } else if (!soundSeenRef.current) {
        silenceAccumRef.current++;
      }

      const remaining = MAX_SECS - secs;
      // After 3s of complete silence at the start, warn the user the mic may be wrong
      if (!soundSeenRef.current && silenceAccumRef.current >= 3) {
        onInterim?.(isFr
          ? `🔇 micro silencieux (${activeLabel}) — change de source ?`
          : `🔇 mic silent (${activeLabel}) — wrong source?`);
      } else if (remaining <= 20 && remaining > 0) {
        onInterim?.(isFr ? `🎙️ ${remaining}s restantes (max 2 min)` : `🎙️ ${remaining}s left (2 min max)`);
      } else {
        const bars = level > 0.15 ? "▮▮▮" : level > 0.05 ? "▮▮" : level > SILENCE_THRESHOLD ? "▮" : "·";
        onInterim?.(isFr ? `🎙️ ${bars} j'écoute… ${fmt(secs)} / 2:00` : `🎙️ ${bars} listening… ${fmt(secs)} / 2:00`);
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
  }, [lang, onResult, onInterim, onError, onListeningChange, refreshDevices, deviceId]);

  const stop = useCallback(() => {
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

  const isFr = lang.startsWith("fr");
  const showDevicePicker = devices.length > 1 && !active && !transcribing;
  const currentLabel = devices.find((d) => d.deviceId === deviceId)?.label;

  return (
    <div style={{ position: "relative", display: "flex", gap: 4, alignItems: "center" }}>
      <button
        className={`voice-btn ${active ? "recording" : ""} ${transcribing ? "transcribing" : ""}`}
        onClick={toggle}
        type="button"
        disabled={transcribing}
        title={
          active
            ? (isFr ? "Cliquer pour arrêter" : "Click to stop")
            : transcribing
            ? (isFr ? "Transcription…" : "Transcribing…")
            : (isFr ? `Parler (max 2 min)${currentLabel ? ` — ${currentLabel}` : ""}` : `Click to speak (max 2 min)${currentLabel ? ` — ${currentLabel}` : ""}`)
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
      {showDevicePicker && (
        <>
          <button
            type="button"
            onClick={() => setShowPicker((s) => !s)}
            title={isFr ? "Choisir le micro" : "Choose microphone"}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px 6px",
              fontSize: 12,
              color: "var(--text-muted)",
              lineHeight: 1,
            }}
          >
            ▾
          </button>
          {showPicker && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                right: 0,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 6,
                minWidth: 240,
                maxWidth: 320,
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                zIndex: 10,
                fontSize: 13,
              }}
            >
              <div style={{ padding: "4px 8px", color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {isFr ? "Source micro" : "Microphone"}
              </div>
              <button
                type="button"
                onClick={() => chooseDevice("")}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: !deviceId ? "var(--bg-muted, #f5f5f5)" : "transparent",
                  border: "none", padding: "6px 8px", cursor: "pointer", borderRadius: 4,
                  color: "var(--text)",
                }}
              >
                {isFr ? "Auto (recommandé)" : "Auto (recommended)"}
              </button>
              {devices.map((d) => {
                const selected = d.deviceId === deviceId;
                const risky = AUTO_EXCLUDE_RE.test(d.label);
                return (
                  <button
                    key={d.deviceId}
                    type="button"
                    onClick={() => chooseDevice(d.deviceId)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      background: selected ? "var(--bg-muted, #f5f5f5)" : "transparent",
                      border: "none", padding: "6px 8px", cursor: "pointer", borderRadius: 4,
                      color: risky ? "var(--text-muted)" : "var(--text)",
                      fontSize: 13,
                    }}
                  >
                    {d.label || (isFr ? "Micro inconnu" : "Unknown mic")}
                    {risky && <span style={{ marginLeft: 6, fontSize: 10 }}>⚠</span>}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
