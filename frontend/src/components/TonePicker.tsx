import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getToneSamples } from "../services/api";
import type { ToneSamples } from "../services/api";
import type { Profile, Offer } from "../store";

type ToneId = "startup" | "creative" | "minimal";
const TONES: ToneId[] = ["startup", "creative", "minimal"];

interface Props {
  profile: Profile;
  offer: Offer;
  lang: string;
  onPick: (tone: ToneId) => void;
  onSkip: () => void;
}

export default function TonePicker({ profile, offer, lang, onPick, onSkip }: Props) {
  const { t } = useTranslation();
  const [samples, setSamples] = useState<ToneSamples | null>(null);
  const [error, setError] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    getToneSamples(profile, offer, lang)
      .then((s) => setSamples(s))
      .catch(() => setError(true));
  }, [profile, offer, lang]);

  if (error) {
    return (
      <div className="chat-msg assistant">
        <div className="chat-bubble">
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("tone.picker_error")}</p>
          <button
            className="btn-primary"
            onClick={onSkip}
            style={{ marginTop: 8, padding: "6px 14px", fontSize: 13 }}
          >
            {t("tone.picker_skip")}
          </button>
        </div>
      </div>
    );
  }

  if (!samples) {
    return (
      <div className="chat-msg assistant">
        <div className="chat-bubble">
          <span className="spinner" /> <span style={{ marginLeft: 8, fontSize: 13, color: "var(--text-muted)" }}>{t("tone.picker_loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-msg assistant">
      <div className="chat-bubble" style={{ maxWidth: "100%" }}>
        <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{t("tone.picker_title")}</p>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>{t("tone.picker_hint")}</p>

        {samples.source && (
          <div style={{ fontSize: 12, color: "var(--text-dim, #94a3b8)", marginBottom: 14, paddingLeft: 10, borderLeft: "2px solid var(--border)" }}>
            <span style={{ fontWeight: 600, marginRight: 6 }}>{t("tone.picker_source_label")}:</span>
            {samples.source}
            {samples.company ? <span style={{ opacity: 0.7 }}> — {samples.company}</span> : null}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TONES.map((id) => (
            <button
              key={id}
              onClick={() => onPick(id)}
              className="tone-sample-card"
              style={{
                textAlign: "left",
                background: "#ffffff",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "12px 14px",
                cursor: "pointer",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                  {t(`tone.${id}`)}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-dim, #94a3b8)" }}>
                  {t(`tone.${id}_desc`)}
                </span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text)", margin: 0 }}>
                {samples[id] || "—"}
              </p>
            </button>
          ))}
        </div>

        <button
          onClick={onSkip}
          style={{
            marginTop: 12,
            padding: "6px 10px",
            fontSize: 12,
            color: "var(--text-muted)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {t("tone.picker_skip")}
        </button>
      </div>
    </div>
  );
}
