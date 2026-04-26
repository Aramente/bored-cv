import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { translateCV, auditCV, applyGrammarFixes, type AuditCvResult } from "../services/api";
import type { CVData } from "../store";
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

export default function Editor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cvData, cvDataAlt, cvLang, setCvLang, brandColors, useBrandColors, selectedTemplate, setSelectedTemplate, setCvData, setCvDataAlt, offer } = useStore();
  const [translating, setTranslating] = useState(false);
  const translateAttempted = useRef(false);
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditCvResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  // Grammar-fix apply flow — keeps a snapshot of the pre-apply CV so the user
  // can roll back in one click without leaving the audit panel.
  const [applyingGrammar, setApplyingGrammar] = useState(false);
  const [grammarSnapshot, setGrammarSnapshot] = useState<CVData | null>(null);
  const [grammarApplied, setGrammarApplied] = useState<{ count: number; skipped: number } | null>(null);
  const [grammarError, setGrammarError] = useState<string | null>(null);

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
      .catch(() => { /* swallow — chip stays click-to-translate */ })
      .finally(() => setTranslating(false));
  }, [cvData, cvDataAlt, translating, setCvDataAlt]);

  // Manual translation trigger — fires when the user clicks a language chip
  // that has no data yet (auto-translate failed or never ran). Resets the
  // attempt-ref so subsequent failures don't permanently brick the chip.
  const triggerTranslation = (target: "fr" | "en") => {
    if (!cvData || translating) return;
    const source = cvData;
    setTranslating(true);
    translateAttempted.current = true;
    translateCV(source, target)
      .then((alt) => {
        setCvDataAlt(alt);
        setCvLang(target);
      })
      .catch((err) => {
        console.error("manual translation failed", err);
        translateAttempted.current = false;
      })
      .finally(() => setTranslating(false));
  };

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
    // Reset any prior apply state — the new audit may have different findings.
    setGrammarApplied(null);
    setGrammarSnapshot(null);
    setGrammarError(null);
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

  const runApplyGrammar = async () => {
    if (!cvData || !auditResult || auditResult.grammar.length === 0 || applyingGrammar) return;
    // Apply fixes to the CV that was audited (the active language). We snapshot
    // BEFORE the swap so the rollback button in the panel can restore it.
    const target = cvLang === (cvData.language || "en") ? cvData : (cvDataAlt || cvData);
    setApplyingGrammar(true);
    setGrammarError(null);
    try {
      const res = await applyGrammarFixes(target, auditResult.grammar, cvLang || "en", "");
      setGrammarSnapshot(target);
      // The applied CV is in the active language. If it matches cvData's
      // language, swap cvData; otherwise it came from cvDataAlt.
      if (cvLang === (cvData.language || "en")) {
        setCvData(res.cv_data);
      } else {
        setCvDataAlt(res.cv_data);
      }
      setGrammarApplied({ count: res.applied, skipped: res.skipped });
    } catch (e) {
      console.error("apply grammar failed", e);
      setGrammarError(t("editor.audit_apply_failed"));
    } finally {
      setApplyingGrammar(false);
    }
  };

  const undoApplyGrammar = () => {
    if (!grammarSnapshot) return;
    if (cvLang === (cvData?.language || "en")) {
      setCvData(grammarSnapshot);
    } else {
      setCvDataAlt(grammarSnapshot);
    }
    setGrammarSnapshot(null);
    setGrammarApplied(null);
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
          <span className="ed-toolbar-label">{t("editor.style_label", "Style")} <span className="ed-toolbar-scrollhint" aria-hidden>›</span></span>
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
                onClick={() => (hasLang ? setCvLang(lang) : triggerTranslation(lang))}
                disabled={isPending}
                title={
                  hasLang
                    ? undefined
                    : isPending
                      ? t("editor.translation_in_progress", "Translating…")
                      : t("editor.translation_click_to_translate", "Click to translate")
                }
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
                  {/* Grammar-only auto-apply CTA. Lives inside the grammar
                      section so the user knows exactly which bucket the
                      button acts on (vs the missing/advice buckets, which
                      need human judgment and can't be auto-applied). */}
                  {bucket === "grammar" && items.length > 0 && (
                    <div className="cv-audit-apply-row">
                      {grammarApplied ? (
                        <>
                          <span className="cv-audit-apply-status">
                            {t("editor.audit_apply_done", { count: grammarApplied.count })}
                            {grammarApplied.skipped > 0 && (
                              <span className="cv-audit-apply-skipped">
                                {" "}{t("editor.audit_apply_skipped", { count: grammarApplied.skipped })}
                              </span>
                            )}
                          </span>
                          <button type="button" className="cv-audit-apply-undo" onClick={undoApplyGrammar}>
                            {t("editor.audit_apply_undo")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="cv-audit-apply-btn"
                          onClick={runApplyGrammar}
                          disabled={applyingGrammar}
                        >
                          {applyingGrammar
                            ? t("editor.audit_apply_running")
                            : t("editor.audit_apply_grammar", { count: items.length })}
                        </button>
                      )}
                    </div>
                  )}
                  {bucket === "grammar" && grammarError && (
                    <p className="cv-audit-apply-error">{grammarError}</p>
                  )}
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
