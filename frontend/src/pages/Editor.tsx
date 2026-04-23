import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { generateCV } from "../services/api";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";
import StepIndicator from "../components/StepIndicator";
import CleanHtml from "../templates/CleanHtml";
import ContrastHtml from "../templates/ContrastHtml";
import MinimalHtml from "../templates/MinimalHtml";
import RetroHtml from "../templates/RetroHtml";
import ConsultantHtml from "../templates/ConsultantHtml";
import TimelineHtml from "../templates/TimelineHtml";
import MonoHtml from "../templates/MonoHtml";
import ExecutiveHtml from "../templates/ExecutiveHtml";
import EditorialHtml from "../templates/EditorialHtml";
import CompactHtml from "../templates/CompactHtml";
import type { TemplateId } from "../store";
import type { TFunction } from "i18next";

const templateHtmlComponents = {
  clean: CleanHtml,
  contrast: ContrastHtml,
  minimal: MinimalHtml,
  retro: RetroHtml,
  consultant: ConsultantHtml,
  timeline: TimelineHtml,
  mono: MonoHtml,
  executive: ExecutiveHtml,
  editorial: EditorialHtml,
  compact: CompactHtml,
} as const;
const templateIds: TemplateId[] = ["clean", "contrast", "minimal", "retro", "consultant", "timeline", "mono", "executive", "editorial", "compact"];

const RESPONSIBILITY_PATTERNS = /^(responsible for|helped with|worked on|assisted in|participated in|involved in|contributed to|supported the|managed the|in charge of)/i;
const BUZZWORDS = /\b(dynamic|innovative|passionate|leveraged|synergies|spearheaded|orchestrated|cutting-edge|best-in-class|world-class|thought leader|proven track record|results-driven|detail-oriented|team player|strong background|eager to leverage)\b/i;
const GAP_PATTERN = /\{GAP:\s*([^}]+)\}/g;

function countGaps(text: string): number {
  GAP_PATTERN.lastIndex = 0;
  let n = 0;
  while (GAP_PATTERN.exec(text) !== null) n++;
  return n;
}

function validateCV(
  cv: { summary: string; experiences: { bullets: string[]; company: string }[]; skills: string[] },
  t: TFunction,
) {
  const issues: { type: "warn" | "error" | "info"; text: string }[] = [];
  const allBullets = cv.experiences.flatMap((e) => e.bullets);
  const bulletsWithNumbers = allBullets.filter((b) => /\d/.test(b));
  const pctWithNumbers = allBullets.length > 0 ? Math.round((bulletsWithNumbers.length / allBullets.length) * 100) : 0;

  if (pctWithNumbers < 50) issues.push({ type: "warn", text: t("editor.bullets_no_numbers", { pct: pctWithNumbers }) });
  if (pctWithNumbers >= 60) issues.push({ type: "warn", text: t("editor.bullets_good", { pct: pctWithNumbers }) });

  const responsibilityBullets = allBullets.filter((b) => RESPONSIBILITY_PATTERNS.test(b.trim()));
  if (responsibilityBullets.length > 0) issues.push({ type: "error", text: t("editor.responsibility_voice") });

  const buzzwordBullets = allBullets.filter((b) => BUZZWORDS.test(b));
  if (buzzwordBullets.length > 0) {
    const found = allBullets.flatMap((b) => {
      const m = b.match(BUZZWORDS);
      return m ? [m[0]] : [];
    });
    issues.push({ type: "error", text: t("editor.buzzwords_found", { words: [...new Set(found)].join(", ") }) });
  }

  if (cv.summary.length > 300) issues.push({ type: "warn", text: t("editor.summary_long") });
  if (cv.summary.length === 0) issues.push({ type: "warn", text: t("editor.summary_missing") });

  const noContextCompanies = cv.experiences.filter((e) => !e.company.includes("("));
  if (noContextCompanies.length > 0) issues.push({ type: "warn", text: t("editor.no_company_context") });

  const softSkills = cv.skills.filter((s) => /^(leadership|communication|teamwork|problem.solving|strategic thinking|creativity|adaptability)$/i.test(s.trim()));
  if (softSkills.length > 0) issues.push({ type: "error", text: t("editor.soft_skills_found", { count: softSkills.length }) });

  // Count GAP tokens across summary + bullets — these are placeholders the
  // user needs to fill in before exporting.
  const totalGaps = countGaps(cv.summary) + allBullets.reduce((acc, b) => acc + countGaps(b), 0);
  if (totalGaps > 0) {
    issues.push({ type: "info", text: `${totalGaps} placeholder${totalGaps > 1 ? "s" : ""} to fill in (highlighted in amber on the CV)` });
  }

  return issues;
}

export default function Editor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cvData, tone, setTone, brandColors, useBrandColors, selectedTemplate, setSelectedTemplate } = useStore();
  const [regenerating, setRegenerating] = useState(false);

  const handleToneChange = async (newTone: string) => {
    setTone(newTone);
    const { profile, offer, gapAnalysis, messages, targetMarket } = useStore.getState();
    if (profile && offer && gapAnalysis) {
      setRegenerating(true);
      try {
        const lang = cvData?.language || "en";
        const cv = await generateCV(profile, offer, gapAnalysis, messages, "", lang, newTone, targetMarket);
        useStore.getState().pushCvHistory();
        useStore.getState().setCvData(cv);
      } catch (e) {
        console.warn("Regeneration failed:", e);
      } finally {
        setRegenerating(false);
      }
    }
  };

  if (!cvData) {
    return (
      <div className="page">
        <nav className="nav">
          <span className="logo" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>bored cv</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AuthButton />
            <LanguageToggle />
          </div>
        </nav>
        <div className="guard-state">
          <div>
            <p>{t("guards.no_generated")}</p>
            <button className="btn-primary" onClick={() => navigate("/upload")}>{t("guards.start")}</button>
          </div>
        </div>
      </div>
    );
  }

  const issues = validateCV(cvData, t);

  return (
    <div className="page">
      <nav className="nav">
        <span className="logo" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>bored cv</span>
        <StepIndicator current="editor" />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn-secondary" onClick={() => navigate("/chat")}>{t("common.back")}</button>
          <AuthButton />
          <LanguageToggle />
        </div>
      </nav>

      <div
        style={{
          padding: "24px 16px 60px",
          background: "#f1f5f9",
          minHeight: "calc(100vh - 60px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        {/* Toolbar — tone + continue. Stays small so the CV is the focus. */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            maxWidth: 794,
            width: "100%",
            background: "#ffffff",
            padding: "10px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("editor.tone_label")}
          </span>
          {[
            { id: "startup", label: t("tone.startup") },
            { id: "creative", label: t("tone.creative") },
            { id: "minimal", label: t("tone.minimal") },
          ].map((tn) => (
            <button
              key={tn.id}
              className={tone === tn.id ? "btn-primary" : "btn-secondary"}
              style={{ padding: "6px 12px", fontSize: 12 }}
              onClick={() => handleToneChange(tn.id)}
              disabled={regenerating}
            >
              {tn.label}
            </button>
          ))}
          {regenerating && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{t("editor.regenerating")}</span>}
          <div style={{ flex: 1 }} />
          <button className="btn-primary" onClick={() => navigate("/templates")}>
            {t("editor.continue")}
          </button>
        </div>

        {/* Template switcher — pick the layout, edit inline below */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            alignItems: "center",
            maxWidth: 794,
            width: "100%",
            background: "#ffffff",
            padding: "8px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("templates.title", "Template")}
          </span>
          {templateIds.map((id) => (
            <button
              key={id}
              className={selectedTemplate === id ? "btn-primary" : "btn-secondary"}
              style={{ padding: "6px 12px", fontSize: 12 }}
              onClick={() => setSelectedTemplate(id)}
            >
              {t(`templates.${id}`, id)}
            </button>
          ))}
        </div>

        {/* The editable CV itself — renders the currently selected template */}
        {(() => {
          const TemplateHtml = templateHtmlComponents[selectedTemplate] ?? CleanHtml;
          return <TemplateHtml data={cvData} brandColors={useBrandColors ? brandColors : null} />;
        })()}

        {/* Validation panel below the sheet — non-blocking */}
        {issues.length > 0 && (
          <div
            style={{
              maxWidth: 794,
              width: "100%",
              padding: 14,
              background: "#ffffff",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              {t("editor.validation_title")}
            </p>
            {issues.map((issue, i) => (
              <p
                key={i}
                style={{
                  fontSize: 12,
                  color: issue.type === "error" ? "var(--error, #d32f2f)" : issue.type === "info" ? "#92400E" : "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                {issue.type === "error" ? "\u2717" : issue.type === "info" ? "\u25CF" : "\u25cb"} {issue.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
