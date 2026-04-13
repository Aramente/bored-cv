import { useTranslation } from "react-i18next";
import { PDFViewer, PDFDownloadLink } from "@react-pdf/renderer";
import { useStore } from "../store";
import LanguageToggle from "../components/LanguageToggle";
import Clean from "../templates/Clean";
import Contrast from "../templates/Contrast";
import Minimal from "../templates/Minimal";

const templateComponents = { clean: Clean, contrast: Contrast, minimal: Minimal } as const;

function EditableField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 11, color: "var(--text-dim)" }}>{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "6px 10px", fontSize: 13 }} />
    </div>
  );
}

export default function Editor() {
  const { t } = useTranslation();
  const { cvData, selectedTemplate, updateCvField, setStep } = useStore();

  if (!cvData) return null;

  const TemplateComponent = templateComponents[selectedTemplate];

  return (
    <div className="page">
      <nav className="nav">
        <div className="logo">Bored CV</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn-secondary" onClick={() => setStep("templates")}>{t("common.back")}</button>
          <LanguageToggle />
        </div>
      </nav>

      <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 4 }}>{t("editor.title")}</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>{t("editor.subtitle")}</p>

          <div style={{ marginBottom: 20 }}>
            <EditableField label="Name" value={cvData.name} onChange={(v) => updateCvField("name", v)} />
            <EditableField label="Title" value={cvData.title} onChange={(v) => updateCvField("title", v)} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="label">{t("editor.section_summary")}</label>
            <textarea className="input" value={cvData.summary} onChange={(e) => updateCvField("summary", e.target.value)} style={{ marginTop: 4, minHeight: 80 }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="label">{t("editor.section_experience")}</label>
            {cvData.experiences.map((exp, i) => (
              <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 12, marginTop: 8 }}>
                <EditableField label="Title" value={exp.title} onChange={(v) => updateCvField(`experiences.${i}.title`, v)} />
                <EditableField label="Company" value={exp.company} onChange={(v) => updateCvField(`experiences.${i}.company`, v)} />
                <EditableField label="Dates" value={exp.dates} onChange={(v) => updateCvField(`experiences.${i}.dates`, v)} />
                {exp.bullets.map((bullet, j) => (
                  <EditableField key={j} label={`Bullet ${j + 1}`} value={bullet} onChange={(v) => updateCvField(`experiences.${i}.bullets.${j}`, v)} />
                ))}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="label">{t("editor.section_skills")}</label>
            <input className="input" value={cvData.skills.join(", ")} onChange={(e) => updateCvField("skills", e.target.value)} style={{ marginTop: 4 }} />
            <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>Comma-separated</p>
          </div>

          <PDFDownloadLink document={<TemplateComponent data={cvData} />} fileName={`${cvData.name.replace(/\s+/g, "_")}_CV.pdf`}>
            {({ loading: pdfLoading }) => (
              <button className="btn-primary" style={{ width: "100%" }} disabled={pdfLoading}>
                {pdfLoading ? <span className="spinner" /> : t("editor.download")}
              </button>
            )}
          </PDFDownloadLink>
        </div>

        <div style={{ flex: 1, borderLeft: "1px solid var(--border)", background: "var(--surface)" }}>
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            <TemplateComponent data={cvData} />
          </PDFViewer>
        </div>
      </div>
    </div>
  );
}
