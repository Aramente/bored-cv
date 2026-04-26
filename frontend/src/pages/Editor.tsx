import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { translateCV, auditCV, type AuditCvResult } from "../services/api";
import TopNav from "../components/TopNav";
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
  const { cvData, cvDataAlt, cvLang, setCvLang, brandColors, useBrandColors, selectedTemplate, setSelectedTemplate, setCvDataAlt, offer } = useStore();
  const [translating, setTranslating] = useState(false);
  const translateAttempted = useRef(false);
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditCvResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Legacy-project backfill: projects created before the auto-translate flow
  // existed have cvData but no cvDataAlt, which leaves the FR/EN toggle stuck.
  // Kick off a translation once when Editor mounts so the toggle works. The
  // ref guard prevents re-firing if translateCV briefly fails.
  useEffect(() => {
    if (!cvData || cvDataAlt || translating || translateAttempted.current) return;
    translateAttempted.current = true;
    const altLang = (cvData.language || "en") === "en" ? "fr" : "en";
    setTranslating(true);
    translateCV(cvData, altLang)
      .then((alt) => setCvDataAlt(alt))
      .catch(() => { /* swallow — toggle will just remain disabled */ })
      .finally(() => setTranslating(false));
  }, [cvData, cvDataAlt, translating, setCvDataAlt]);

  // Language resolution — matches Templates.tsx. If the user toggled cvLang to
  // the opposite of the stored CV language, show the translated alt (falling
  // back to the original if translation hasn't finished). Without this, the
  // Editor always rendered cvData regardless of cvLang, so loading a legacy
  // EN-generated project meant you couldn't see the FR translation.
  const activeCv = cvData && cvLang === (cvData.language || "en") ? cvData : (cvDataAlt || cvData);

  if (!cvData) {
    return (
      <div className="page">
        <TopNav />
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

  // Audit gating — every experience must have a contractType picked AND at
  // least one headcount endpoint filled. Forces the user to give the LLM
  // structured metadata to audit against, instead of inferring it from prose.
  const audCv = activeCv || cvData;
  const incompleteCount = (audCv?.experiences || []).filter((e) => {
    const hasContract = !!(e.contractType && String(e.contractType).trim());
    const hasHeadcount = !!((e.headcountStart && String(e.headcountStart).trim()) || (e.headcountEnd && String(e.headcountEnd).trim()));
    return !hasContract || !hasHeadcount;
  }).length;
  const auditDisabled = incompleteCount > 0 || auditing || !offer;

  const runAudit = async () => {
    if (!audCv || !offer || auditDisabled) return;
    setAuditing(true);
    setAuditError(null);
    try {
      const res = await auditCV(audCv, offer, cvLang || "en", "");
      setAuditResult(res);
    } catch (e) {
      console.error("audit failed", e);
      setAuditError(t("editor.audit_failed"));
    } finally {
      setAuditing(false);
    }
  };

  return (
    <div className="page">
      <TopNav
        center={<StepIndicator current="editor" />}
        extra={<button className="btn-secondary" onClick={() => navigate("/chat")}>{t("common.back")}</button>}
      />

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
        {/* Page intro — sets expectation that this is the content-review step,
            not a template picker. The "continue" CTA moved to the bottom so
            users edit first, advance second. */}
        <div style={{ maxWidth: 794, width: "100%", textAlign: "center", marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>
            {t("editor.heading", "Review & edit your content")}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>
            {t("editor.intro", "Click any field to edit inline. Pick the visual style below, then download your CV.")}
          </p>
        </div>

        {/* Template picker + CV language. Chips are the single source of truth —
            no more btn-primary/secondary rectangles that wrap into a cramped
            three-row block. The inner strip scrolls horizontally when 10
            templates overflow on narrower viewports. */}
        <div className="ed-toolbar">
          <span className="ed-toolbar-label">{t("templates.title", "Template")} · {templateIds.length}</span>
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
            const isPending = !hasLang && translating;
            return (
              <button
                key={lang}
                className={`chip ${cvLang === lang ? "is-active" : ""}`}
                onClick={() => setCvLang(lang)}
                disabled={!hasLang}
                title={hasLang ? undefined : isPending ? t("editor.translation_in_progress", "Translating…") : t("editor.translation_pending", "Translation not ready yet")}
              >
                {lang.toUpperCase()}{isPending ? " …" : ""}
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

        {/* AI audit panel — appears once the user clicks the audit button. */}
        {auditError && (
          <div className="cv-audit-panel" style={{ borderColor: "#dc2626" }}>
            <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>{auditError}</p>
          </div>
        )}
        {auditResult && (
          <div className="cv-audit-panel">
            <div className="cv-audit-panel-header">
              <h3 className="cv-audit-panel-title">{t("editor.audit_panel_title")}</h3>
              <button type="button" className="cv-audit-panel-close" onClick={() => setAuditResult(null)} aria-label="Close">×</button>
            </div>
            {(["grammar", "missing_from_offer", "advice"] as const).map((bucket) => {
              const items = auditResult[bucket] || [];
              const titleKey = bucket === "grammar" ? "editor.audit_grammar" : bucket === "missing_from_offer" ? "editor.audit_missing" : "editor.audit_advice";
              const sectionClass = bucket === "grammar" ? "is-grammar" : bucket === "missing_from_offer" ? "is-missing" : "is-advice";
              return (
                <div key={bucket} className={`cv-audit-section ${sectionClass}`}>
                  <p className="cv-audit-section-title">{t(titleKey)}</p>
                  {items.length === 0 ? (
                    <p className="cv-audit-empty">{t("editor.audit_empty_section")}</p>
                  ) : items.map((f, i) => (
                    <div key={i} className="cv-audit-finding">
                      {f.where && <span className="cv-audit-where">{f.where}</span>}
                      {f.text}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Audit CTA — promoted to its own row above the navigation. The
            sparkle icon + indigo gradient + larger padding make it the most
            visible action on the page so users actually notice the AI audit
            exists before clicking Continue. Gated until every experience has
            contract type + headcount filled. */}
        <div style={{ maxWidth: 794, width: "100%", display: "flex", justifyContent: "center", marginTop: 8 }}>
          <button
            type="button"
            className="cv-audit-btn-hero"
            onClick={runAudit}
            disabled={auditDisabled}
            title={incompleteCount > 0 ? t("editor.audit_gated_tip", { count: incompleteCount }) : undefined}
          >
            <span className="cv-audit-btn-icon" aria-hidden>{auditing ? "⏳" : "✨"}</span>
            <span>{auditing ? t("editor.audit_running") : t("editor.audit_button")}</span>
          </button>
        </div>

        {/* Continue to download — secondary action below the audit CTA. */}
        <div style={{ maxWidth: 794, width: "100%", display: "flex", justifyContent: "center", marginTop: 4 }}>
          <button
            className="btn-primary"
            style={{ padding: "10px 20px", fontSize: 14 }}
            onClick={() => navigate("/templates")}
          >
            {t("editor.continue", "Continue to download")}
          </button>
        </div>
      </div>
    </div>
  );
}
