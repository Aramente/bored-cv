import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
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
  const { cvData, cvDataAlt, cvLang, setCvLang, brandColors, useBrandColors, selectedTemplate, setSelectedTemplate } = useStore();

  // Language resolution — matches Templates.tsx. If the user toggled cvLang to
  // the opposite of the stored CV language, show the translated alt (falling
  // back to the original if translation hasn't finished). Without this, the
  // Editor always rendered cvData regardless of cvLang, so loading a legacy
  // EN-generated project meant you couldn't see the FR translation.
  const activeCv = cvData && cvLang === (cvData.language || "en") ? cvData : (cvDataAlt || cvData);

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

  const issues = validateCV(activeCv || cvData, t);

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
          padding: "40px 24px 80px",
          background: "#e2e8f0",
          minHeight: "calc(100vh - 60px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        {/* Continue to templates */}
        <div className="ed-toolbar" style={{ justifyContent: "flex-end" }}>
          <button className="btn-primary" style={{ padding: "6px 14px", fontSize: 12, flexShrink: 0 }} onClick={() => navigate("/templates")}>
            {t("editor.continue")}
          </button>
        </div>

        {/* Template picker + CV language. Chips are the single source of truth —
            no more btn-primary/secondary rectangles that wrap into a cramped
            three-row block. The inner strip scrolls horizontally when 10
            templates overflow on narrower viewports. */}
        <div className="ed-toolbar">
          <span className="ed-toolbar-label">{t("templates.title", "Template")}</span>
          <div className="ed-toolbar-chips">
            {templateIds.map((id) => (
              <button
                key={id}
                className={`chip ${selectedTemplate === id ? "is-active" : ""}`}
                onClick={() => setSelectedTemplate(id)}
              >
                {t(`templates.${id}`, id)}
              </button>
            ))}
          </div>
          <div className="ed-toolbar-divider" aria-hidden />
          <span className="ed-toolbar-label">CV</span>
          {(["fr", "en"] as const).map((lang) => {
            const hasLang = cvData?.language === lang || cvDataAlt?.language === lang;
            return (
              <button
                key={lang}
                className={`chip ${cvLang === lang ? "is-active" : ""}`}
                onClick={() => setCvLang(lang)}
                disabled={!hasLang}
                title={hasLang ? undefined : t("editor.translation_pending", "Translation not ready yet")}
              >
                {lang.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* The editable CV itself — renders the currently selected template */}
        {(() => {
          const TemplateHtml = templateHtmlComponents[selectedTemplate] ?? CleanHtml;
          return <TemplateHtml data={activeCv || cvData} brandColors={useBrandColors ? brandColors : null} />;
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
