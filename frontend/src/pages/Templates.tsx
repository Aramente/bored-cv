import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PDFViewer } from "@react-pdf/renderer";
import { useStore, type TemplateId } from "../store";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";
import Clean from "../templates/Clean";
import Contrast from "../templates/Contrast";
import Minimal from "../templates/Minimal";
import Retro from "../templates/Retro";
import Consultant from "../templates/Consultant";

const templateComponents = { clean: Clean, contrast: Contrast, minimal: Minimal, retro: Retro, consultant: Consultant };
const templateKeys: TemplateId[] = ["clean", "contrast", "minimal", "retro", "consultant"];

export default function Templates() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cvData, cvDataAlt, cvLang, setCvLang, selectedTemplate, setSelectedTemplate, tone, setTone } = useStore();

  const activeCv = cvLang === (cvData?.language || "en") ? cvData : (cvDataAlt || cvData);

  const tones = [
    { id: "startup", label: "Startup", desc: "direct, punchy, ownership vibes" },
    { id: "corporate", label: "Corporate", desc: "polished but not generic" },
    { id: "creative", label: "Creative", desc: "bold, shows personality" },
    { id: "minimal", label: "Minimal", desc: "ultra-concise, pure signal" },
  ];

  if (!cvData) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 18, marginBottom: 12, color: "var(--text)" }}>{t("guards.no_generated")}</p>
          <button className="btn-primary" onClick={() => navigate("/upload")}>{t("guards.start")}</button>
        </div>
      </div>
    );
  }

  const displayCv = activeCv || cvData;
  const PreviewComponent = templateComponents[selectedTemplate];

  return (
    <div className="page">
      <nav className="nav">
        <span className="logo" onClick={() => navigate("/")} style={{cursor:"pointer"}}>bored cv</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AuthButton />
          <LanguageToggle />
        </div>
      </nav>
      <div className="page-content">
        <h1>{t("templates.title")}</h1>
        <p className="subtitle">{t("templates.subtitle")}</p>

        {cvData.match_score > 0 && (
          <div className="match-score-card">
            <div className="match-score-header">
              <div className="match-score-number">{cvData.match_score}%</div>
              <div className="match-score-label">match score</div>
            </div>
            <div className="match-score-details">
              {cvData.strengths.length > 0 && (
                <div className="match-strengths">
                  <span className="match-icon">💪</span>
                  {cvData.strengths.map((s, i) => <p key={i}>{s}</p>)}
                </div>
              )}
              {cvData.improvements.length > 0 && (
                <div className="match-improvements">
                  <span className="match-icon">🎯</span>
                  {cvData.improvements.map((s, i) => <p key={i}>{s}</p>)}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("templates.tone_label")}</p>
          <div className="tone-selector">
            {tones.map((t) => (
              <div
                key={t.id}
                className={`card ${tone === t.id ? "selected" : ""}`}
                onClick={() => setTone(t.id)}
                style={{ flex: "0 0 auto", padding: "8px 14px", cursor: "pointer" }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t.label}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 6 }}>{t.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("templates.lang_label")}</p>
          <div className="lang-selector">
            <button
              className={`card ${cvLang === "fr" ? "selected" : ""}`}
              onClick={() => setCvLang("fr")}
              style={{ padding: "8px 20px", cursor: "pointer", border: cvLang === "fr" ? "2px solid var(--accent)" : "2px solid var(--border)" }}
            >
              🇫🇷 {t("templates.lang_fr")}
            </button>
            <button
              className={`card ${cvLang === "en" ? "selected" : ""}`}
              onClick={() => setCvLang("en")}
              style={{ padding: "8px 20px", cursor: "pointer", border: cvLang === "en" ? "2px solid var(--accent)" : "2px solid var(--border)" }}
            >
              🇬🇧 {t("templates.lang_en")}
            </button>
            {!cvDataAlt && <span style={{ fontSize: 12, color: "var(--text-dim)", alignSelf: "center" }}>{t("templates.translating")}</span>}
          </div>
        </div>

        <div className="templates-grid">
          {templateKeys.map((key) => (
            <div
              key={key}
              className={`card ${selectedTemplate === key ? "selected" : ""}`}
              onClick={() => setSelectedTemplate(key)}
            >
              <h3 style={{ fontSize: 16, marginBottom: 4 }}>{t(`templates.${key}`)}</h3>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{t(`templates.${key}_desc`)}</p>
            </div>
          ))}
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", height: 500, marginBottom: 16 }}>
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            <PreviewComponent data={displayCv} />
          </PDFViewer>
        </div>

        <button className="btn-primary" style={{ width: "100%" }} onClick={() => navigate("/editor")}>
          {t("templates.select")}
        </button>
      </div>
    </div>
  );
}
