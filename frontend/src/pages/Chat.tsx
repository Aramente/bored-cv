import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { chatNext, generateCV, draftCV, translateCV, saveProject } from "../services/api";
import ChatMessage from "../components/ChatMessage";
import VoiceInput from "../components/VoiceInput";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";

function CVPreviewPanel({ onEdit }: { onEdit?: (field: string, oldVal: string, newVal: string) => void }) {
  const { cvData, updateCvField } = useStore();

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
        <p>your CV will appear here as we build it together</p>
      </div>
    );
  }

  return (
    <div className="cv-preview-panel">
      <div className="cv-preview-header">
        <h3>content draft</h3>
        <span className="cv-preview-badge">editable</span>
      </div>
      <p className="cv-preview-hint">focus: content. design & colors come later.</p>
      {cvData.match_score > 0 && (
        <div className="match-score-mini">
          <span className="match-score-number-sm">{cvData.match_score}%</span>
          <span> match</span>
        </div>
      )}
      <div className="cv-preview-content">
        <input
          className="cv-edit-name"
          value={cvData.name}
          onBlur={(e) => handleEdit("name", e.target.value)} onChange={(e) => updateCvField("name", e.target.value)}
        />
        <input
          className="cv-edit-title"
          value={cvData.title}
          onBlur={(e) => handleEdit("title", e.target.value)} onChange={(e) => updateCvField("title", e.target.value)}
        />
        <textarea
          className="cv-edit-summary"
          value={cvData.summary}
          onChange={(e) => updateCvField("summary", e.target.value)}
          rows={3}
        />
        {cvData.experiences.map((exp, i) => (
          <div key={i} className="cv-edit-exp">
            <div className="cv-edit-exp-header">
              <input
                className="cv-edit-exp-title"
                value={exp.title}
                onChange={(e) => updateCvField(`experiences.${i}.title`, e.target.value)}
              />
              <input
                className="cv-edit-exp-company"
                value={exp.company}
                onChange={(e) => updateCvField(`experiences.${i}.company`, e.target.value)}
              />
              <input
                className="cv-edit-exp-dates"
                value={exp.dates}
                onChange={(e) => updateCvField(`experiences.${i}.dates`, e.target.value)}
              />
            </div>
            {exp.bullets.map((bullet, j) => (
              <input
                key={j}
                className="cv-edit-bullet"
                value={bullet}
                onChange={(e) => updateCvField(`experiences.${i}.bullets.${j}`, e.target.value)}
              />
            ))}
          </div>
        ))}
        <div className="cv-edit-skills">
          <span className="cv-edit-label">Skills</span>
          <input
            className="cv-edit-skills-input"
            value={cvData.skills.join(", ")}
            onChange={(e) => updateCvField("skills", e.target.value)}
          />
        </div>
      </div>
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0 && gapAnalysis && gapAnalysis.questions.length > 0) {
      addMessage({ role: "assistant", content: gapAnalysis.questions[0] });
    }
  }, []);

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

      if (!response.is_complete) {
        // Background draft — update CV preview progressively
        draftCV(profile, offer, gapAnalysis, allMessages, captcha, lang)
          .then((cv) => setCvData(cv))
          .catch(() => {}); // silent fail — draft is best-effort
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
      const msg = err instanceof Error ? err.message : "Something went wrong";
      addMessage({ role: "assistant", content: `⚠️ ${msg}. Try again or start a new CV.` });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Route guard: redirect if no data
  if (!profile || !offer || !gapAnalysis) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 18, marginBottom: 12, color: "var(--text)" }}>no CV in progress</p>
          <button className="btn-primary" onClick={() => navigate("/upload")}>start a new CV</button>
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
              🎤 recording... click stop when you're done
            </div>
          )}
          <form className="chat-input-bar" onSubmit={handleSubmit}>
            <input
              className={`input ${isRecording ? "input-recording" : ""}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? "speaking..." : t("chat.placeholder")}
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
              Send
            </button>
          </form>
        </div>

        {/* Right: live CV preview */}
        <div className="cv-side">
          <CVPreviewPanel onEdit={handleCvEdit} />
        </div>
      </div>
    </div>
  );
}
