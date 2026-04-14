import { useTranslation } from "react-i18next";
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
  const { cvData, selectedTemplate, setSelectedTemplate, setStep, tone, setTone } = useStore();

  const tones = [
    { id: "startup", label: "Startup", desc: "direct, punchy, ownership vibes" },
    { id: "corporate", label: "Corporate", desc: "polished but not generic" },
    { id: "creative", label: "Creative", desc: "bold, shows personality" },
    { id: "minimal", label: "Minimal", desc: "ultra-concise, pure signal" },
  ];

  if (!cvData) return null;

  const PreviewComponent = templateComponents[selectedTemplate];

  return (
    <div className="page">
      <nav className="nav">
        <span className="logo">bored cv</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AuthButton />
          <LanguageToggle />
        </div>
      </nav>
      <div className="page-content">
        <h1>{t("templates.title")}</h1>
        <p className="subtitle">{t("templates.subtitle")}</p>

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tone of voice</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
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
            <PreviewComponent data={cvData} />
          </PDFViewer>
        </div>

        <button className="btn-primary" style={{ width: "100%" }} onClick={() => setStep("editor")}>
          {t("templates.select")}
        </button>
      </div>
    </div>
  );
}
