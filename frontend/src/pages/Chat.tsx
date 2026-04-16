import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { chatNext, generateCV, draftCV, translateCV, saveProject, getKnowledge } from "../services/api";
import ChatMessage from "../components/ChatMessage";
import VoiceInput from "../components/VoiceInput";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";
import CVPreviewPanel from "../components/CVPreviewPanel";

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
  const [knownFacts, setKnownFacts] = useState<string[]>([]);
  const [contradictions, setContradictions] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleCvEdit = useCallback((field: string, oldVal: string, newVal: string) => {
    if (oldVal === newVal || !newVal.trim()) return;
    const fieldName = field.replace(/experiences\.(\d+)\./, (_, i) => `experience ${parseInt(i) + 1} → `).replace(/bullets\.(\d+)/, (_, i) => `bullet ${parseInt(i) + 1}`);
    addMessage({
      role: "user",
      content: `✏️ I edited ${fieldName}: "${newVal}"`,
    });
  }, [addMessage]);


  useEffect(() => {
    const token = localStorage.getItem("bored-cv-token");
    if (token) {
      getKnowledge()
        .then((kb) => {
          const facts = kb.experiences.map((e: any) =>
            `${e.company} (${e.title}): ${(e.best_bullets || []).slice(0, 2).join("; ")}`
          ).filter((f: string) => f.length > 10);
          setKnownFacts(facts);
          setContradictions(kb.contradictions || []);
        })
        .catch(() => {});
    }
  }, []);

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
      const currentCv = useStore.getState().cvData;
      const response = await chatNext(profile, offer, gapAnalysis, allMessages, captcha, lang, knownFacts, contradictions, currentCv);

      addMessage({ role: "assistant", content: response.message });

      // Process CV actions from the chat
      if (response.cv_actions && response.cv_actions.length > 0) {
        console.log("[cv_actions]", JSON.stringify(response.cv_actions, null, 2));
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
                store.updateCvField(`experiences.${idx}.bullets.${bulletIdx}`, action.value as string);
              }
            }
          } else if (action.action === "remove_education" && store.cvData && target) {
            const idx = store.cvData.education.findIndex(
              (e) => e.school.toLowerCase().includes(target) ||
                     e.degree.toLowerCase().includes(target)
            );
            if (idx >= 0) store.removeCvEducation(idx);
          } else if (action.action === "merge_experiences" && store.cvData && target) {
            const indices = store.cvData.experiences
              .map((e, i) => (e.company.toLowerCase().includes(target) || e.title.toLowerCase().includes(target)) ? i : -1)
              .filter((i) => i >= 0);
            if (indices.length >= 2) {
              const merged = typeof action.value === "string" && action.value ? JSON.parse(action.value) : (action.value || {});
              // Collect all bullets from all matching experiences before removing
              const allBullets = indices.flatMap((i) => store.cvData!.experiences[i].bullets);
              useStore.setState((s) => {
                if (!s.cvData) return s;
                const cv = structuredClone(s.cvData);
                const first = cv.experiences[indices[0]];
                first.title = merged.title || first.title;
                first.company = merged.company || first.company;
                first.dates = merged.dates || first.dates;
                // Use LLM's merged bullets if provided and non-empty, otherwise combine all
                first.bullets = (merged.bullets && merged.bullets.length > 0) ? merged.bullets : allBullets;
                for (let i = indices.length - 1; i >= 1; i--) {
                  cv.experiences.splice(indices[i], 1);
                }
                return { cvData: cv };
              });
            }
          } else if (action.action === "edit_field" && store.cvData) {
            store.updateCvField(action.target, action.value as string);
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
            if (res.id) {
              useStore.getState().setProjectId(res.id);
              useStore.getState().setLastSaved(new Date().toISOString());
            }
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
          <CVPreviewPanel onEdit={handleCvEdit} />
        </div>
      </div>
    </div>
  );
}
