import { useTranslation } from "react-i18next";
import { PDFViewer } from "@react-pdf/renderer";
import { useStore, type TemplateId } from "../store";
import LanguageToggle from "../components/LanguageToggle";
import Clean from "../templates/Clean";
import Contrast from "../templates/Contrast";
import Minimal from "../templates/Minimal";

const templateComponents = { clean: Clean, contrast: Contrast, minimal: Minimal };
const templateKeys: TemplateId[] = ["clean", "contrast", "minimal"];

export default function Templates() {
  const { t } = useTranslation();
  const { cvData, selectedTemplate, setSelectedTemplate, setStep } = useStore();

  if (!cvData) return null;

  const PreviewComponent = templateComponents[selectedTemplate];

  return (
    <div className="page">
      <nav className="nav">
        <span className="logo">bored cv</span>
        <LanguageToggle />
      </nav>
      <div className="page-content">
        <h1>{t("templates.title")}</h1>
        <p className="subtitle">{t("templates.subtitle")}</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
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
