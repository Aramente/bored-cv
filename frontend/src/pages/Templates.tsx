import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PDFViewer, PDFDownloadLink } from "@react-pdf/renderer";
import { useStore, type TemplateId } from "../store";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";
import StepIndicator from "../components/StepIndicator";
import Clean from "../templates/Clean";
import Contrast from "../templates/Contrast";
import Minimal from "../templates/Minimal";
import Retro from "../templates/Retro";
import Consultant from "../templates/Consultant";

const templateComponents = { clean: Clean, contrast: Contrast, minimal: Minimal, retro: Retro, consultant: Consultant };
const templateKeys: TemplateId[] = ["clean", "contrast", "minimal", "retro", "consultant"];

const templateAccentStyles: Record<TemplateId, React.CSSProperties> = {
  clean: { borderLeft: "4px solid var(--gold)" },
  contrast: { borderLeft: "4px solid var(--text)" },
  minimal: { borderLeft: "2px solid var(--border)" },
  retro: { borderLeft: "4px dashed var(--text-dim)" },
  consultant: { borderLeft: "4px double var(--text-muted)" },
};

export default function Templates() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cvData, cvDataAlt, cvLang, setCvLang, selectedTemplate, setSelectedTemplate, brandColors, useBrandColors, setUseBrandColors, offer, cvOriginal } = useStore();
  const [beforeAfterOpen, setBeforeAfterOpen] = useState(false);

  const activeCv = cvLang === (cvData?.language || "en") ? cvData : (cvDataAlt || cvData);

  if (!cvData) {
    return (
      <div className="page">
        <nav className="nav">
          <span className="logo" onClick={() => navigate("/")} style={{cursor:"pointer"}}>bored cv</span>
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

  const displayCv = activeCv || cvData;
  const PreviewComponent = templateComponents[selectedTemplate];

  // R2 — memoize PDF document for PDFDownloadLink
  const pdfDocument = useMemo(
    () => <PreviewComponent data={displayCv} brandColors={useBrandColors ? brandColors : null} />,
    [displayCv, useBrandColors, brandColors, selectedTemplate]
  );

  return (
    <div className="page">
      <nav className="nav">
        <span className="logo" onClick={() => navigate("/")} style={{cursor:"pointer"}}>bored cv</span>
        <StepIndicator current="templates" />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn-secondary" onClick={() => navigate("/editor")}>{t("common.back")}</button>
          <AuthButton />
          <LanguageToggle />
        </div>
      </nav>
      <div className="page-content">
        <h1>{t("templates.title")}</h1>
        <p className="subtitle">{t("templates.subtitle")}</p>

        {displayCv.match_score > 0 && (
          <div className="match-score-card">
            <div className="match-score-header">
              <div className="match-score-number">{displayCv.match_score}%</div>
              <div className="match-score-label">ATS compatibility</div>
            </div>
            <div className="ats-bar">
              <div className="ats-bar-fill" style={{ width: `${displayCv.match_score}%` }} />
            </div>
            <div className="match-score-details">
              {displayCv.strengths.length > 0 && (
                <div className="match-strengths">
                  <span className="match-section-label">{t("templates.strengths_label")}</span>
                  {displayCv.strengths.map((s, i) => <p key={i}>{s}</p>)}
                </div>
              )}
              {displayCv.improvements.length > 0 && (
                <div className="match-improvements">
                  <span className="match-section-label">{t("templates.to_improve_label")}</span>
                  {displayCv.improvements.map((s, i) => (
                    <p key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{s}</span>
                      <a
                        onClick={(e) => { e.preventDefault(); navigate("/editor"); }}
                        href="/editor"
                        style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer", whiteSpace: "nowrap", marginLeft: 8, textDecoration: "none", fontWeight: 600 }}
                      >
                        {t("templates.fix")}
                      </a>
                    </p>
                  ))}
                </div>
              )}
            </div>
            <button
              className="btn-secondary share-score-btn"
              onClick={() => {
                const text = `My CV scored ${displayCv.match_score}% match for ${offer?.title || "this role"} at ${offer?.company || "the company"} — built with Bored CV \u{1F3AF}\nhttps://aramente.github.io/bored-cv/`;
                navigator.clipboard.writeText(text).then(() => {
                  const btn = document.querySelector('.share-score-btn');
                  if (btn) {
                    btn.textContent = t("templates.shared");
                    setTimeout(() => { btn.textContent = t("templates.share_score"); }, 2000);
                  }
                });
              }}
              style={{ marginTop: 12, fontSize: 12 }}
            >
              {t("templates.share_score")}
            </button>
          </div>
        )}

        {/* V2 — Before / After comparison */}
        {cvOriginal && cvOriginal.experiences.length > 0 && displayCv.experiences.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <button
              className="btn-secondary"
              style={{ fontSize: 13, marginBottom: 8 }}
              onClick={() => setBeforeAfterOpen(!beforeAfterOpen)}
            >
              {beforeAfterOpen ? "▾" : "▸"} {t("templates.before_after")}
            </button>
            {beforeAfterOpen && (
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16, opacity: 0.7 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-dim)", display: "block", marginBottom: 8 }}>{t("templates.linkedin_version")}</span>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{cvOriginal.experiences[0].title}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{cvOriginal.experiences[0].company}</p>
                  {cvOriginal.experiences[0].bullets.slice(0, 2).map((b, i) => (
                    <p key={i} style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4, lineHeight: 1.5 }}>{b}</p>
                  ))}
                </div>
                <div style={{ flex: 1, background: "rgba(232, 168, 0, 0.04)", border: "2px solid var(--gold)", borderRadius: "var(--radius)", padding: 16 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)", display: "block", marginBottom: 8 }}>{t("templates.bored_cv_version")}</span>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{displayCv.experiences[0].title}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{displayCv.experiences[0].company}</p>
                  {displayCv.experiences[0].bullets.slice(0, 2).map((b, i) => (
                    <p key={i} style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4, lineHeight: 1.5 }}>{b}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("templates.lang_label")}</p>
          <div className="lang-selector">
            <button
              className={`card ${cvLang === "fr" ? "selected" : ""}`}
              onClick={() => setCvLang("fr")}
              style={{ padding: "8px 20px", cursor: "pointer", border: cvLang === "fr" ? "2px solid var(--accent)" : "2px solid var(--border)" }}
            >
              {"\uD83C\uDDEB\uD83C\uDDF7"} {t("templates.lang_fr")}
            </button>
            <button
              className={`card ${cvLang === "en" ? "selected" : ""}`}
              onClick={() => setCvLang("en")}
              style={{ padding: "8px 20px", cursor: "pointer", border: cvLang === "en" ? "2px solid var(--accent)" : "2px solid var(--border)" }}
            >
              {"\uD83C\uDDEC\uD83C\uDDE7"} {t("templates.lang_en")}
            </button>
            {!cvDataAlt && <span style={{ fontSize: 12, color: "var(--text-dim)", alignSelf: "center" }}>{t("templates.translating")}</span>}
          </div>
        </div>

        {brandColors && (
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}>
              <input
                type="checkbox"
                checked={useBrandColors}
                onChange={(e) => setUseBrandColors(e.target.checked)}
              />
              <span>{t("templates.use_company_colors")}</span>
              <span style={{ display: "inline-flex", gap: 4, marginLeft: 4 }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, background: brandColors.primary, border: "1px solid var(--border)" }} />
                <span style={{ width: 14, height: 14, borderRadius: 3, background: brandColors.secondary, border: "1px solid var(--border)" }} />
              </span>
            </label>
          </div>
        )}

        {/* G4 — Template cards with colored accent strips */}
        <div className="templates-grid">
          {templateKeys.map((key) => (
            <div
              key={key}
              className={`card ${selectedTemplate === key ? "selected" : ""}`}
              onClick={() => setSelectedTemplate(key)}
              style={templateAccentStyles[key]}
            >
              <h3 style={{ fontSize: 16, marginBottom: 4 }}>{t(`templates.${key}`)}</h3>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{t(`templates.${key}_desc`)}</p>
            </div>
          ))}
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", height: 500, marginBottom: 16 }}>
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            <PreviewComponent data={displayCv} brandColors={useBrandColors ? brandColors : null} />
          </PDFViewer>
        </div>

        <PDFDownloadLink document={pdfDocument} fileName={`${displayCv.name.replace(/\s+/g, "_")}_CV.pdf`}>
          {({ loading: pdfLoading }) => (
            <button className="btn-primary" style={{ width: "100%" }} disabled={pdfLoading}>
              {pdfLoading ? <span className="spinner" /> : t("editor.download")}
            </button>
          )}
        </PDFDownloadLink>
        <button className="btn-secondary" style={{ width: "100%", marginTop: 8 }} onClick={() => navigate("/cover-letter")}>
          {t("templates.cover_letter")}
        </button>
      </div>
    </div>
  );
}
