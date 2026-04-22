import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../store";
import { getKnowledge } from "../services/api";

type Knowledge = {
  experiences: Array<{ id: number; company: string; title: string; dates?: string; best_bullets?: string[] }>;
  facts: Array<{ id: number; key: string; value: string }>;
  contradictions: string[];
};

const DISMISS_KEY = "bored-cv-remembered-dismissed";

export default function RememberedCard() {
  const { t } = useTranslation();
  const user = useStore((s) => s.user);
  const [kb, setKb] = useState<Knowledge | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!user?.email || dismissed) return;
    let cancelled = false;
    getKnowledge()
      .then((data) => {
        if (!cancelled) setKb(data as Knowledge);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.email, dismissed]);

  if (!user?.email || dismissed || !kb) return null;

  const experiences = kb.experiences || [];
  const facts = kb.facts || [];
  if (experiences.length === 0 && facts.length === 0) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  };

  const companyNames = Array.from(new Set(experiences.map((e) => e.company).filter(Boolean)));
  const visibleCompanies = companyNames.slice(0, expanded ? companyNames.length : 4);
  const visibleFacts = expanded ? facts : facts.slice(0, 3);

  return (
    <section
      style={{
        background: "var(--accent-subtle)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 20,
        marginBottom: 24,
        position: "relative",
      }}
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t("remembered.dismiss")}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 18,
          lineHeight: 1,
          padding: 4,
        }}
      >
        ×
      </button>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, paddingRight: 24 }}>
        <strong style={{ fontSize: 15 }}>{t("remembered.title")}</strong>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {t("remembered.subtitle", {
            companies: companyNames.length,
            facts: facts.length,
          })}
        </span>
      </div>

      {visibleCompanies.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: visibleFacts.length ? 12 : 0 }}>
          {visibleCompanies.map((c) => (
            <span
              key={c}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-light)",
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 12,
                color: "var(--text)",
              }}
            >
              {c}
            </span>
          ))}
          {!expanded && companyNames.length > visibleCompanies.length && (
            <span style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>
              +{companyNames.length - visibleCompanies.length}
            </span>
          )}
        </div>
      )}

      {visibleFacts.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text)" }}>
          {visibleFacts.map((f) => (
            <li key={f.id} style={{ marginBottom: 4 }}>
              {f.value.length > 140 ? f.value.slice(0, 140) + "…" : f.value}
            </li>
          ))}
        </ul>
      )}

      {(companyNames.length > 4 || facts.length > 3) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 10,
            background: "transparent",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            fontSize: 13,
            padding: 0,
            fontWeight: 600,
          }}
        >
          {expanded ? t("remembered.show_less") : t("remembered.show_more")}
        </button>
      )}

      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, marginBottom: 0 }}>
        {t("remembered.hint")}
      </p>
    </section>
  );
}
