import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { chatNext, generateCV, draftCV, translateCV, saveProject } from "../services/api";
import ChatMessage from "../components/ChatMessage";
import VoiceInput from "../components/VoiceInput";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";
import { PDFViewer } from "@react-pdf/renderer";
import Minimal from "../templates/Minimal";

function CVPreviewPanel({ onEdit, onQuickAction }: {
  onEdit?: (field: string, oldVal: string, newVal: string) => void;
  onQuickAction?: (action: string, expIndex: number) => void;
}) {
  const { t } = useTranslation();
  const { cvData, updateCvField, addCvExperience, removeCvExperience, addCvBullet, removeCvBullet, addCvEducation, removeCvEducation, addCvLanguage, removeCvLanguage, pushCvHistory, undo, cvHistory } = useStore();
  const profile = useStore((s) => s.profile);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
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
          <div className="cv-view-toggle">
            <button className={viewMode === "edit" ? "active" : ""} onClick={() => setViewMode("edit")}>edit</button>
            <button className={viewMode === "preview" ? "active" : ""} onClick={() => setViewMode("preview")}>preview</button>
          </div>
          <button className="cv-undo-btn" onClick={undo} disabled={cvHistory.length === 0} title="Undo">↩</button>
          <span className="cv-preview-badge">{t("chat.preview_editable")}</span>
        </div>
      </div>
      <p className="cv-preview-hint">{t("chat.preview_hint")}</p>
      {cvData.match_score > 0 && (
        <div className="match-score-mini">
          <span className="match-score-number-sm">{cvData.match_score}%</span>
          <span> match</span>
        </div>
      )}
      {viewMode === "preview" ? (
        <div style={{ height: "calc(100% - 80px)" }}>
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            <Minimal data={cvData} />
          </PDFViewer>
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
                    {isImproved ? '✓ improved' : 'raw'}
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
      </div>
      )}
    </div>
  );
}

export default function Chat() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    profile, offer, gapAnalysis,
    messages, addMessage,
    setCvData, setCvDataAlt,
    tone,
  } = useStore();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleCvEdit = (field: string, oldVal: string, newVal: string) => {
    if (oldVal === newVal || !newVal.trim()) return;
    const fieldName = field.replace(/experiences\.(\d+)\./, (_, i) => `experience ${parseInt(i) + 1} → `).replace(/bullets\.(\d+)/, (_, i) => `bullet ${parseInt(i) + 1}`);
    addMessage({
      role: "user",
      content: `✏️ I edited ${fieldName}: "${newVal}"`,
    });
  };

  const handleQuickAction = (action: string, expIndex: number) => {
    const cv = useStore.getState().cvData;
    if (!cv || !cv.experiences[expIndex]) return;
    const exp = cv.experiences[expIndex];
    const actionText: Record<string, string> = {
      improve: `improve the description for my role as ${exp.title} at ${exp.company}`,
      shorten: `make the bullets shorter and punchier for ${exp.title} at ${exp.company}`,
      metrics: `add specific metrics and numbers to my ${exp.title} role at ${exp.company}`,
    };
    sendMessage(actionText[action] || action);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    // Create initial CV from profile if not already set
    if (profile && !useStore.getState().cvData) {
      setCvData({
        name: profile.name,
        title: profile.title,
        email: profile.email,
        phone: profile.phone || "",
        linkedin: profile.linkedin || "",
        location: profile.location,
        summary: profile.summary,
        experiences: profile.experiences.map((exp) => ({
          title: exp.title,
          company: exp.company,
          dates: exp.dates,
          bullets: exp.bullets.length > 0 ? exp.bullets : [exp.description],
        })),
        education: profile.education,
        skills: profile.skills,
        languages: profile.languages || [],
        language: i18n.language.startsWith("fr") ? "fr" : "en",
        match_score: 0,
        strengths: [],
        improvements: [],
      });
    }
  }, []);

  // Show first question when analysis completes (may arrive async from background)
  useEffect(() => {
    const currentMessages = useStore.getState().messages;
    if (currentMessages.length === 0 && gapAnalysis && gapAnalysis.questions.length > 0) {
      addMessage({ role: "assistant", content: gapAnalysis.questions[0] });
    }
  }, [gapAnalysis]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !profile || !offer || !gapAnalysis) return;

    addMessage({ role: "user", content: text });
    setInput("");
    setLoading(true);

    try {
      const currentMessages = useStore.getState().messages;
      const allMessages = [...currentMessages, { role: "user" as const, content: text }];
      const captcha = "";
      const lang = i18n.language.startsWith("fr") ? "fr" : "en";
      const response = await chatNext(profile, offer, gapAnalysis, allMessages, captcha, lang);

      addMessage({ role: "assistant", content: response.message });

      // Process CV actions from the chat
      if (response.cv_actions && response.cv_actions.length > 0) {
        useStore.getState().pushCvHistory(); // Save state before changes
        const store = useStore.getState();
        for (const action of response.cv_actions) {
          if (!action.target && action.action !== "edit_field") continue; // skip empty targets
          const target = (action.target || "").toLowerCase();

          if (action.action === "remove_experience" && store.cvData && target) {
            const idx = store.cvData.experiences.findIndex(
              (e) => e.company.toLowerCase().includes(target) ||
                     e.title.toLowerCase().includes(target)
            );
            if (idx >= 0) store.removeCvExperience(idx);
          } else if (action.action === "add_bullet" && store.cvData && target) {
            const idx = store.cvData.experiences.findIndex(
              (e) => e.company.toLowerCase().includes(target)
            );
            if (idx >= 0) {
              store.addCvBullet(idx);
              const newCv = useStore.getState().cvData;
              if (newCv) {
                const bulletIdx = newCv.experiences[idx].bullets.length - 1;
                store.updateCvField(`experiences.${idx}.bullets.${bulletIdx}`, action.value);
              }
            }
          } else if (action.action === "remove_education" && store.cvData && target) {
            const idx = store.cvData.education.findIndex(
              (e) => e.school.toLowerCase().includes(target) ||
                     e.degree.toLowerCase().includes(target)
            );
            if (idx >= 0) store.removeCvEducation(idx);
          } else if (action.action === "edit_field" && store.cvData) {
            store.updateCvField(action.target, action.value);
          }
        }
      }

      if (!response.is_complete) {
        // Background draft — MERGE with existing cvData, don't replace
        draftCV(profile, offer, gapAnalysis, allMessages, captcha, lang)
          .then((draft) => {
            const current = useStore.getState().cvData;
            if (!current) { setCvData(draft); return; }
            // Only update experiences/summary/skills from draft — preserve education, languages, personal info
            setCvData({
              ...current,
              summary: draft.summary || current.summary,
              experiences: draft.experiences.length > 0 ? draft.experiences : current.experiences,
              skills: draft.skills.length > 0 ? draft.skills : current.skills,
              match_score: draft.match_score || current.match_score,
              strengths: draft.strengths.length > 0 ? draft.strengths : current.strengths,
              improvements: draft.improvements.length > 0 ? draft.improvements : current.improvements,
              // PRESERVE these from the original — draft often drops them
              education: current.education,
              languages: current.languages,
              name: current.name,
              title: current.title,
              email: current.email,
              phone: current.phone,
              linkedin: current.linkedin,
              location: current.location,
              language: current.language,
            });
          })
          .catch(() => {});
      }

      if (response.is_complete) {
        setGenerating(true);
        const cv = await generateCV(profile, offer, gapAnalysis, allMessages, captcha, lang, tone);
        setCvData(cv);
        // Auto-translate to the other language
        const altLang = cv.language === "fr" ? "en" : "fr";
        translateCV(cv, altLang)
          .then((alt) => setCvDataAlt(alt))
          .catch(() => {}); // non-blocking
        // Auto-save project
        const token = localStorage.getItem("bored-cv-token");
        if (token && offer) {
          saveProject({
            id: useStore.getState().projectId || undefined,
            name: offer.company || offer.title || "Untitled",
            offer_title: offer.title,
            profile_data: profile,
            offer_data: offer,
            gap_analysis: gapAnalysis,
            cv_data: cv,
            messages: allMessages,
            match_score: cv.match_score || 0,
            template: tone,
            tone: tone,
          }).then((res) => {
            if (res.id) useStore.getState().setProjectId(res.id);
          }).catch(() => {});
        }
        navigate("/templates");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("chat.error_generic");
      addMessage({ role: "assistant", content: `⚠️ ${msg}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Route guard: need at least profile + offer
  if (!profile || !offer) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 18, marginBottom: 12, color: "var(--text)" }}>{t("guards.no_cv")}</p>
          <button className="btn-primary" onClick={() => navigate("/upload")}>{t("guards.start")}</button>
        </div>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <img src="/bored-cv/logo-hero.webp" alt="" style={{ width: 200, marginBottom: 24 }} />
          <div className="spinner" style={{ width: 40, height: 40, marginBottom: 16 }} />
          <p style={{ color: "var(--text-muted)" }}>{t("chat.generating")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page chat-split">
      <nav className="nav">
        <span className="logo" onClick={() => navigate("/")} style={{cursor:"pointer"}}>bored cv</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AuthButton />
          <LanguageToggle />
        </div>
      </nav>

      <div className="chat-split-body">
        {/* Left: chat */}
        <div className="chat-side">
          <div className="chat-header">
            <h1 style={{ fontSize: 20 }}>{t("chat.title")}</h1>
            <p className="subtitle" style={{ fontSize: 14, marginBottom: 0 }}>{t("chat.subtitle")}</p>
          </div>

          <div className="chat-messages">
            {!gapAnalysis && messages.length === 0 && (
              <div className="chat-msg assistant">
                <div className="chat-bubble">
                  <span className="spinner" style={{ marginRight: 8 }} />
                  {t("upload.step_analyzing")}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <ChatMessage key={`${i}-${msg.role}-${msg.content.slice(0, 20)}`} role={msg.role} content={msg.content} />
            ))}
            {loading && (
              <div className="chat-msg assistant">
                <div className="chat-bubble"><span className="spinner" /></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {voiceError && <div className="error" style={{ margin: "0 0 8px" }}>{voiceError}</div>}
          {isRecording && (
            <div className="recording-banner">
              🎤 {t("chat.recording_hint")}
            </div>
          )}
          <form className="chat-input-bar" onSubmit={handleSubmit}>
            <input
              className={`input ${isRecording ? "input-recording" : ""}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? t("chat.speaking") : t("chat.placeholder")}
              disabled={loading}
              readOnly={isRecording}
            />
            <VoiceInput
              onResult={(text) => { setVoiceError(""); setInput(""); sendMessage(text); }}
              onInterim={(text) => setInput(text)}
              onError={(msg) => setVoiceError(msg)}
              onListeningChange={(l) => { setIsRecording(l); if (l) setInput(""); }}
              lang={i18n.language}
            />
            <button className="btn-primary" type="submit" disabled={!input.trim() || loading}
              style={{ padding: "10px 20px" }}>
              {t("chat.send")}
            </button>
          </form>
        </div>

        {/* Right: live CV preview */}
        <div className="cv-side">
          <CVPreviewPanel onEdit={handleCvEdit} onQuickAction={handleQuickAction} />
        </div>
      </div>
    </div>
  );
}
