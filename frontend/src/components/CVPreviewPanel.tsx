import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../store";

interface CVPreviewPanelProps {
  onEdit?: (field: string, oldVal: string, newVal: string) => void;
  onQuickAction?: (action: string, expIndex: number) => void;
}

function CVPreviewPanelInner({ onEdit, onQuickAction }: CVPreviewPanelProps) {
  const { t } = useTranslation();
  const { cvData, cvOriginal, cvDataAlt, cvLang, setCvLang, updateCvField, addCvExperience, removeCvExperience, addCvBullet, removeCvBullet, addCvEducation, removeCvEducation, addCvLanguage, removeCvLanguage, pushCvHistory, undo, cvHistory } = useStore();
  const profile = useStore((s) => s.profile);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showOriginal, setShowOriginal] = useState(false);
  const toggle = (section: string) => setCollapsed((c) => ({ ...c, [section]: !c[section] }));

  const handleEdit = (path: string, newVal: string) => {
    if (!cvData) return;
    // Get old value for the chat log
    const keys = path.split(".");
    let old: unknown = cvData;
    for (const k of keys) {
      if (old && typeof old === "object") {
        old = (old as Record<string, unknown>)[k] ?? (old as unknown[])[parseInt(k)];
      }
    }
    const oldStr = typeof old === "string" ? old : String(old || "");
    if (oldStr !== newVal) {
      updateCvField(path, newVal);
      onEdit?.(path, oldStr, newVal);
    }
  };

  if (!cvData) {
    return (
      <div className="cv-preview-empty">
        <p>{t("chat.preview_empty")}</p>
      </div>
    );
  }

  return (
    <div className="cv-preview-panel">
      <div className="cv-preview-header">
        <h3>{t("chat.preview_title")}</h3>
        <div className="cv-preview-actions">
          <button className="cv-undo-btn" onClick={undo} disabled={cvHistory.length === 0} title="Undo">↩</button>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className="cv-preview-hint">{t("chat.preview_hint")}</p>
        {cvDataAlt && (
          <div className="cv-view-toggle" style={{ marginBottom: 8 }}>
            <button className={cvLang === "fr" ? "active" : ""} onClick={() => setCvLang("fr")}>FR</button>
            <button className={cvLang === "en" ? "active" : ""} onClick={() => setCvLang("en")}>EN</button>
          </div>
        )}
      </div>
      {cvData.match_score > 0 && (
        <div className="match-score-mini">
          <span className="match-score-number-sm">{cvData.match_score}%</span>
          <span> match</span>
        </div>
      )}
      {/* Alt language read-only view */}
      {cvDataAlt && cvLang !== (cvData.language || "en") ? (
        <div className="cv-preview-content cv-original">
          <p className="cv-original-label">{cvLang === "fr" ? "version française" : "english version"} — read only</p>
          <div className="cv-edit-name" style={{ opacity: 0.8 }}>{cvDataAlt.name}</div>
          <div className="cv-edit-title" style={{ opacity: 0.8 }}>{cvDataAlt.title}</div>
          <p style={{ fontSize: 13, color: "#666", margin: "8px 0" }}>{cvDataAlt.summary}</p>
          {cvDataAlt.experiences.map((exp, i) => (
            <div key={i} className="cv-edit-exp" style={{ opacity: 0.8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{exp.title}</div>
              <div style={{ fontSize: 12, color: "#666" }}>{exp.company} — {exp.dates}</div>
              {exp.bullets.map((b, j) => <div key={j} style={{ fontSize: 12, color: "#888", paddingLeft: 10 }}>• {b}</div>)}
            </div>
          ))}
        </div>
      ) : showOriginal && cvOriginal ? (
        <div className="cv-preview-content cv-original">
          <p className="cv-original-label">original LinkedIn — read only</p>
          <div className="cv-edit-name" style={{ opacity: 0.6 }}>{cvOriginal.name}</div>
          <div className="cv-edit-title" style={{ opacity: 0.6 }}>{cvOriginal.title}</div>
          {cvOriginal.experiences.map((exp, i) => (
            <div key={i} className="cv-edit-exp" style={{ opacity: 0.6 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{exp.title}</div>
              <div style={{ fontSize: 12, color: "#666" }}>{exp.company} — {exp.dates}</div>
              {exp.bullets.map((b, j) => <div key={j} style={{ fontSize: 12, color: "#888", paddingLeft: 10 }}>• {b}</div>)}
            </div>
          ))}
        </div>
      ) : (
      <div className="cv-preview-content">
        {/* Personal Info */}
        <div className="cv-section">
          <input
            className="cv-edit-name"
            value={cvData.name}
            onBlur={(e) => handleEdit("name", e.target.value)}
            onChange={(e) => updateCvField("name", e.target.value)}
          />
          <input
            className="cv-edit-title"
            value={cvData.title}
            onBlur={(e) => handleEdit("title", e.target.value)}
            onChange={(e) => updateCvField("title", e.target.value)}
          />
          <div className="cv-edit-contact-row">
            {cvData.email && <span className="cv-edit-contact">{cvData.email}</span>}
            {cvData.phone && <span className="cv-edit-contact">{cvData.phone}</span>}
            {cvData.location && <span className="cv-edit-contact">{cvData.location}</span>}
            {cvData.linkedin && <span className="cv-edit-contact">{cvData.linkedin}</span>}
          </div>
        </div>

        {/* Summary */}
        <div className="cv-section">
          <span className="cv-edit-label">{t("editor.section_summary")}</span>
          <textarea
            className="cv-edit-summary"
            value={cvData.summary}
            onChange={(e) => updateCvField("summary", e.target.value)}
            onBlur={(e) => handleEdit("summary", e.target.value)}
            rows={3}
          />
        </div>

        {/* Experiences */}
        <div className="cv-section">
          <div className="cv-section-header" onClick={() => toggle("experiences")}>
            <span className="cv-edit-label">{t("editor.section_experience")} ({cvData.experiences.length})</span>
            <span className="cv-collapse-icon">{collapsed.experiences ? '▸' : '▾'}</span>
            <button className="cv-add-btn" onClick={(e) => { e.stopPropagation(); addCvExperience(); }}>+</button>
          </div>
          {!collapsed.experiences && cvData.experiences.map((exp, i) => {
            const isImproved = profile && profile.experiences[i] && (
              exp.bullets.join("") !== (profile.experiences[i]?.bullets || []).join("") ||
              exp.title !== profile.experiences[i]?.title
            );
            return (
              <div key={`exp-${i}-${exp.company}`} className={`cv-edit-exp ${flashIndex === i ? 'just-changed' : ''}`}>
                <div className="cv-edit-exp-top-row">
                  <span className={`cv-progress-badge ${isImproved ? 'improved' : 'raw'}`}>
                    {isImproved ? '✓ edited' : 'original'}
                  </span>
                  <button className="cv-remove-btn" onClick={() => { pushCvHistory(); removeCvExperience(i); }}>×</button>
                </div>
                <div className="cv-edit-exp-header">
                  <input
                    className="cv-edit-exp-title"
                    value={exp.title}
                    onChange={(e) => updateCvField(`experiences.${i}.title`, e.target.value)}
                    onBlur={(e) => handleEdit(`experiences.${i}.title`, e.target.value)}
                    placeholder="Job title"
                  />
                  <input
                    className="cv-edit-exp-company"
                    value={exp.company}
                    onChange={(e) => updateCvField(`experiences.${i}.company`, e.target.value)}
                    onBlur={(e) => handleEdit(`experiences.${i}.company`, e.target.value)}
                    placeholder="Company"
                  />
                  <input
                    className="cv-edit-exp-dates"
                    value={exp.dates}
                    onChange={(e) => updateCvField(`experiences.${i}.dates`, e.target.value)}
                    placeholder="Dates"
                  />
                </div>
                {exp.bullets.map((bullet, j) => (
                  <div key={`bullet-${i}-${j}`} className="cv-bullet-row">
                    <input
                      className="cv-edit-bullet"
                      value={bullet}
                      onChange={(e) => updateCvField(`experiences.${i}.bullets.${j}`, e.target.value)}
                      onBlur={(e) => handleEdit(`experiences.${i}.bullets.${j}`, e.target.value)}
                      placeholder="Achievement..."
                    />
                    <button className="cv-remove-btn-sm" onClick={() => removeCvBullet(i, j)}>×</button>
                  </div>
                ))}
                <button className="cv-add-btn-sm" onClick={() => addCvBullet(i)}>+ bullet</button>
                <div className="cv-quick-actions">
                  <button onClick={() => { onQuickAction?.("improve", i); setFlashIndex(i); setTimeout(() => setFlashIndex(null), 1500); }}>✨ improve</button>
                  <button onClick={() => { onQuickAction?.("shorten", i); setFlashIndex(i); setTimeout(() => setFlashIndex(null), 1500); }}>✂️ shorten</button>
                  <button onClick={() => { onQuickAction?.("metrics", i); setFlashIndex(i); setTimeout(() => setFlashIndex(null), 1500); }}>📊 add metrics</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Education */}
        <div className="cv-section">
          <div className="cv-section-header" onClick={() => toggle("education")}>
            <span className="cv-edit-label">{t("editor.section_education")} ({cvData.education.length})</span>
            <span className="cv-collapse-icon">{collapsed.education ? '▸' : '▾'}</span>
            <button className="cv-add-btn" onClick={(e) => { e.stopPropagation(); addCvEducation(); }}>+</button>
          </div>
          {!collapsed.education && cvData.education.map((edu, i) => (
            <div key={`edu-${i}-${edu.school}`} className="cv-edit-edu">
              <button className="cv-remove-btn-sm" onClick={() => { pushCvHistory(); removeCvEducation(i); }}>×</button>
              <input className="cv-edit-edu-degree" value={edu.degree} onChange={(e) => updateCvField(`education.${i}.degree`, e.target.value)} placeholder="Degree" />
              <input className="cv-edit-edu-school" value={edu.school} onChange={(e) => updateCvField(`education.${i}.school`, e.target.value)} placeholder="School" />
              <input className="cv-edit-edu-year" value={edu.year} onChange={(e) => updateCvField(`education.${i}.year`, e.target.value)} placeholder="Year" />
            </div>
          ))}
        </div>

        {/* Languages */}
        <div className="cv-section">
          <div className="cv-section-header" onClick={() => toggle("languages")}>
            <span className="cv-edit-label">Languages ({(cvData.languages || []).length})</span>
            <span className="cv-collapse-icon">{collapsed.languages ? '▸' : '▾'}</span>
            <button className="cv-add-btn" onClick={(e) => {
              e.stopPropagation();
              const lang = prompt("Language (e.g. Spanish (Professional))");
              if (lang) addCvLanguage(lang);
            }}>+</button>
          </div>
          {!collapsed.languages && (
            <div className="cv-edit-languages">
              {(cvData.languages || []).map((lang, i) => (
                <span key={i} className="cv-edit-lang-tag">
                  {lang}
                  <button className="cv-remove-btn-inline" onClick={() => { pushCvHistory(); removeCvLanguage(i); }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Skills */}
        <div className="cv-section">
          <span className="cv-edit-label">{t("chat.skills_label")}</span>
          <input
            className="cv-edit-skills-input"
            value={cvData.skills.join(", ")}
            onChange={(e) => updateCvField("skills", e.target.value)}
          />
        </div>

        {/* See original link */}
        {cvOriginal && (
          <button
            className="cv-see-original"
            onClick={() => setShowOriginal(!showOriginal)}
          >
            {showOriginal ? "← back to draft" : "see original LinkedIn →"}
          </button>
        )}
      </div>
      )}
    </div>
  );
}

export default memo(CVPreviewPanelInner);
