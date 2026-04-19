import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PDFViewer } from "@react-pdf/renderer";
import { useStore } from "../store";
import { generateCV } from "../services/api";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";
import StepIndicator from "../components/StepIndicator";
import Clean from "../templates/Clean";
import Contrast from "../templates/Contrast";
import Minimal from "../templates/Minimal";
import Retro from "../templates/Retro";
import Consultant from "../templates/Consultant";

const templateComponents = { clean: Clean, contrast: Contrast, minimal: Minimal, retro: Retro, consultant: Consultant } as const;

const RESPONSIBILITY_PATTERNS = /^(responsible for|helped with|worked on|assisted in|participated in|involved in|contributed to|supported the|managed the|in charge of)/i;
const BUZZWORDS = /\b(dynamic|innovative|passionate|leveraged|synergies|spearheaded|orchestrated|cutting-edge|best-in-class|world-class|thought leader|proven track record|results-driven|detail-oriented|team player|strong background|eager to leverage)\b/i;

function validateCV(cv: { summary: string; experiences: { bullets: string[]; company: string }[]; skills: string[] }) {
  const issues: { type: "warn" | "error"; text: string }[] = [];
  const allBullets = cv.experiences.flatMap((e) => e.bullets);
  const bulletsWithNumbers = allBullets.filter((b) => /\d/.test(b));
  const pctWithNumbers = allBullets.length > 0 ? Math.round((bulletsWithNumbers.length / allBullets.length) * 100) : 0;

  if (pctWithNumbers < 50) issues.push({ type: "warn", text: `Only ${pctWithNumbers}% of bullets have numbers — aim for 60%+` });
  if (pctWithNumbers >= 60) issues.push({ type: "warn", text: `${pctWithNumbers}% of bullets have numbers — solid` });

  const responsibilityBullets = allBullets.filter((b) => RESPONSIBILITY_PATTERNS.test(b.trim()));
  if (responsibilityBullets.length > 0) issues.push({ type: "error", text: `${responsibilityBullets.length} bullet(s) start with responsibility-voice ("Responsible for...", "Managed the...")` });

  const buzzwordBullets = allBullets.filter((b) => BUZZWORDS.test(b));
  if (buzzwordBullets.length > 0) issues.push({ type: "error", text: `${buzzwordBullets.length} bullet(s) contain banned buzzwords` });

  if (cv.summary.length > 300) issues.push({ type: "warn", text: "Summary is long — keep it under 2 sentences" });
  if (cv.summary.length === 0) issues.push({ type: "warn", text: "No summary — consider adding 2 sentences" });

  const noContextCompanies = cv.experiences.filter((e) => !e.company.includes("("));
  if (noContextCompanies.length > 0) issues.push({ type: "warn", text: `${noContextCompanies.length} company name(s) missing context "(sector, stage, headcount)"` });

  const softSkills = cv.skills.filter((s) => /^(leadership|communication|teamwork|problem.solving|strategic thinking|creativity|adaptability)$/i.test(s.trim()));
  if (softSkills.length > 0) issues.push({ type: "error", text: `${softSkills.length} generic soft skill(s) in skills list — remove them` });

  return issues;
}

function EditableField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", display: "block", marginBottom: 2 }}>{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "6px 10px", fontSize: 13 }} />
    </div>
  );
}

export default function Editor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cvData, selectedTemplate, updateCvField, tone, setTone } = useStore();
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

  const TemplateComponent = templateComponents[selectedTemplate];

  return (
    <div className="page">
      <nav className="nav">
        <span className="logo" onClick={() => navigate("/")} style={{cursor:"pointer"}}>bored cv</span>
        <StepIndicator current="editor" />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn-secondary" onClick={() => navigate("/chat")}>{t("common.back")}</button>
          <AuthButton />
          <LanguageToggle />
        </div>
      </nav>

      <div className="editor-split" style={{ display: "flex", height: "calc(100vh - 60px)" }}>
        <div className="editor-left" style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 4 }}>{t("editor.title")}</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>{t("editor.subtitle")}</p>

          <div style={{ marginBottom: 20 }}>
            <EditableField label={t("editor.name_label")} value={cvData.name} onChange={(v) => updateCvField("name", v)} />
            <EditableField label={t("editor.title_label")} value={cvData.title} onChange={(v) => updateCvField("title", v)} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="label">{t("editor.section_summary")}</label>
            <textarea className="input" value={cvData.summary} onChange={(e) => updateCvField("summary", e.target.value)} style={{ minHeight: 80 }} />
          </div>

          {/* Tone selector */}
          <div style={{ marginBottom: 20 }}>
            <label className="label">{t("editor.tone_label")}</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { id: "startup", label: t("tone.startup"), desc: t("tone.startup_desc") },
                { id: "corporate", label: t("tone.corporate"), desc: t("tone.corporate_desc") },
                { id: "creative", label: t("tone.creative"), desc: t("tone.creative_desc") },
                { id: "minimal", label: t("tone.minimal"), desc: t("tone.minimal_desc") },
              ].map((tn) => (
                <button
                  key={tn.id}
                  className={tone === tn.id ? "btn-primary" : "btn-secondary"}
                  style={{ padding: "8px 16px", fontSize: 13 }}
                  onClick={() => handleToneChange(tn.id)}
                  disabled={regenerating}
                >
                  {tn.label}
                </button>
              ))}
            </div>
            {regenerating && <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>{t("editor.regenerating")}</p>}
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
            <input className="input" value={cvData.skills.join(", ")} onChange={(e) => updateCvField("skills", e.target.value)} />
            <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{t("editor.comma_hint")}</p>
          </div>

          {(() => {
            const issues = validateCV(cvData);
            if (issues.length === 0) return null;
            return (
              <div style={{ marginBottom: 16, padding: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>{t("editor.validation_title")}</p>
                {issues.map((issue, i) => (
                  <p key={i} style={{ fontSize: 12, color: issue.type === "error" ? "var(--error, #d32f2f)" : "var(--text-muted)", marginBottom: 4 }}>
                    {issue.type === "error" ? "\u2717" : "\u25cb"} {issue.text}
                  </p>
                ))}
              </div>
            );
          })()}

          <button className="btn-primary" style={{ width: "100%" }} onClick={() => navigate("/templates")}>
            {t("editor.continue")}
          </button>
        </div>

        <div className="editor-right" style={{ flex: 1, borderLeft: "1px solid var(--border)", background: "var(--surface)" }}>
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            <TemplateComponent data={cvData} />
          </PDFViewer>
        </div>
      </div>
    </div>
  );
}
