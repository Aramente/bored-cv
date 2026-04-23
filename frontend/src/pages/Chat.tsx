import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { chatNext, generateCV, draftCV, translateCV, saveProject, getKnowledge } from "../services/api";
import ChatMessage from "../components/ChatMessage";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";
import StepIndicator from "../components/StepIndicator";
import VoiceInput from "../components/VoiceInput";
import TonePicker from "../components/TonePicker";

export default function Chat() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    profile, offer, gapAnalysis,
    messages, addMessage,
    setCvData, setCvDataAlt,
    setTone, setToneChosen, targetMarket,
  } = useStore();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [knownFacts, setKnownFacts] = useState<string[]>([]);
  const [contradictions, setContradictions] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [showSkip, setShowSkip] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [showTonePicker, setShowTonePicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);
  const draftInFlight = useRef(false);
  const progressRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-grow textarea on content change (including live voice transcript)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [input]);


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

    // Instant first question — no API wait
    const currentMessages = useStore.getState().messages;
    if (currentMessages.length === 0 && profile && offer) {
      const firstName = profile.name.split(" ")[0];
      const isFr = i18n.language.startsWith("fr");
      const firstQ = isFr
        ? `${firstName}, j'ai lu l'offre de ${offer.title} chez ${offer.company}. Je vais te poser quelques questions pour enrichir ton CV. On commence ?`
        : `${firstName}, I read the ${offer.title} role at ${offer.company}. I'll ask you a few questions to make your CV stronger. Ready?`;
      addMessage({ role: "assistant", content: firstQ });
    }
  }, []);

  // When gap analysis arrives, DON'T add another first message — it's already shown
  // Just let subsequent chatNext calls use the gap analysis data

  const handleGenerateNow = useCallback(async () => {
    if (!profile || !offer) return;
    setGenerating(true);
    try {
      const captcha = "";
      const lang = i18n.language.startsWith("fr") ? "fr" : "en";
      const allMessages = useStore.getState().messages;
      const currentGap = useStore.getState().gapAnalysis || { matched_skills: [], gaps: [], questions: [] };
      // Read tone from store (not closure) — the in-chat tone picker calls
      // setTone() immediately before handleGenerateNow() and the closure would
      // still hold the previous value.
      const currentTone = useStore.getState().tone;
      const cv = await generateCV(profile, offer, currentGap, allMessages, captcha, lang, currentTone, targetMarket);
      setCvData(cv);
      const altLang = cv.language === "fr" ? "en" : "fr";
      translateCV(cv, altLang)
        .then((alt) => setCvDataAlt(alt))
        .catch(() => {});
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
          template: currentTone,
          tone: currentTone,
        }).then((res) => {
          if (res.id) {
            useStore.getState().setProjectId(res.id);
            useStore.getState().setLastSaved(new Date().toISOString());
          }
        }).catch(() => {});
      }
      navigate("/editor");
    } catch (err) {
      console.error("[generateCV]", err);
      const msg = err instanceof Error ? err.message : "CV generation failed";
      addMessage({ role: "assistant", content: `⚠️ ${msg}` });
      setGenerating(false);
    }
  }, [profile, offer, gapAnalysis, targetMarket, i18n.language, setCvData, setCvDataAlt, navigate, addMessage]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !profile || !offer) return;
    if (sendingRef.current) return; // prevent double-send
    sendingRef.current = true;

    // B1: Read currentMessages BEFORE addMessage to avoid duplicate
    const currentMessages = useStore.getState().messages;
    addMessage({ role: "user", content: text });
    const allMessages = [...currentMessages, { role: "user" as const, content: text }];
    setInput("");
    setLoading(true);
    setShowSkip(true);

    // R7: Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const captcha = "";
      const lang = i18n.language.startsWith("fr") ? "fr" : "en";
      const currentCv = useStore.getState().cvData;
      const currentGap = useStore.getState().gapAnalysis || { matched_skills: [], gaps: [], questions: [] };
      const response = await chatNext(profile, offer, currentGap, allMessages, captcha, lang, knownFacts, contradictions, currentCv, controller.signal);

      addMessage({ role: "assistant", content: response.message });

      // R6: Clamp progress so it never goes backward
      if (response.progress !== undefined) {
        const clamped = Math.max(progressRef.current, response.progress);
        progressRef.current = clamped;
        setProgress(clamped);
      }

      // Process CV actions from the chat
      if (response.cv_actions && response.cv_actions.length > 0) {
        useStore.getState().pushCvHistory(); // Save state before changes
        // B3: Read store inside loop so each iteration gets fresh state
        for (const action of response.cv_actions) {
          const store = useStore.getState();
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
          } else if (action.action === "replace_bullet" && store.cvData && target) {
            const idx = store.cvData.experiences.findIndex(
              (e) => e.company.toLowerCase().includes(target) || e.title.toLowerCase().includes(target)
            );
            if (idx >= 0 && typeof action.index === "number" && action.index >= 0) {
              store.updateCvField(`experiences.${idx}.bullets.${action.index}`, action.value as string);
            }
          } else if (action.action === "remove_education" && store.cvData && target) {
            const idx = store.cvData.education.findIndex(
              (e) => e.school.toLowerCase().includes(target) ||
                     e.degree.toLowerCase().includes(target)
            );
            if (idx >= 0) store.removeCvEducation(idx);
          } else if (action.action === "merge_experiences" && store.cvData && target) {
            // Re-read store for fresh state (prior actions in this loop may have changed it)
            const freshStore = useStore.getState();
            if (!freshStore.cvData) continue;
            // Robust matching: strip parenthetical context and match partial company names
            const stripParens = (s: string) => s.toLowerCase().replace(/\s*\(.*\)/, "").trim();
            const targetClean = stripParens(target);
            const indices = freshStore.cvData.experiences
              .map((e, i) => {
                const companyClean = stripParens(e.company);
                const titleClean = e.title.toLowerCase();
                return (companyClean.includes(targetClean) || targetClean.includes(companyClean) ||
                        e.company.toLowerCase().includes(target) || titleClean.includes(target)) ? i : -1;
              })
              .filter((i) => i >= 0);
            if (indices.length >= 1) {
              let merged: Record<string, unknown> = {};
              try {
                merged = typeof action.value === "string" && action.value ? JSON.parse(action.value) : (action.value && typeof action.value === "object" ? action.value : {});
              } catch { merged = {}; }
              // Collect all bullets from all matching experiences before removing
              const allBullets = indices.flatMap((i) => freshStore.cvData!.experiences[i].bullets);
              const mergedBullets = merged.bullets as string[] | undefined;
              useStore.setState((s) => {
                if (!s.cvData) return s;
                const cv = structuredClone(s.cvData);
                const first = cv.experiences[indices[0]];
                first.title = (merged.title as string) || first.title;
                first.company = (merged.company as string) || first.company;
                first.dates = (merged.dates as string) || first.dates;
                // Use LLM's merged bullets if provided and non-empty, otherwise combine all
                first.bullets = (mergedBullets && mergedBullets.length > 0) ? mergedBullets : allBullets;
                // Remove all other matches (reverse order to preserve indices)
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

      // Force completion after 8 user messages if LLM won't stop
      const userMsgCount = allMessages.filter(m => m.role === "user").length;
      if (userMsgCount >= 8 && !response.is_complete) {
        response.is_complete = true;
      }

      if (!response.is_complete) {
        // R1: Only fire background draft if none is in-flight
        const hadActions = response.cv_actions && response.cv_actions.length > 0;
        if (!hadActions && !draftInFlight.current) {
          draftInFlight.current = true;
          draftCV(profile, offer, currentGap, allMessages, captcha, lang, targetMarket)
            .then((draft) => {
              const current = useStore.getState().cvData;
              if (!current) { setCvData(draft); return; }
              setCvData({
                ...current,
                summary: draft.summary || current.summary,
                experiences: current.experiences, // ALWAYS keep user's experiences
                skills: draft.skills.length > 0 ? draft.skills : current.skills,
                match_score: draft.match_score || current.match_score,
                strengths: draft.strengths.length > 0 ? draft.strengths : current.strengths,
                improvements: draft.improvements.length > 0 ? draft.improvements : current.improvements,
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
            .catch(() => {})
            .finally(() => { draftInFlight.current = false; });
        }
      }

      if (response.is_complete) {
        // Spec 46afe50: before final generation, show the in-chat tone picker
        // so the user picks voice with concrete sample paragraphs (not abstract
        // labels). If the user has already picked a voice this session, skip
        // straight to generation.
        if (!useStore.getState().toneChosen) {
          setShowTonePicker(true);
        } else {
          await handleGenerateNow();
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Request was aborted by a newer send — ignore
      } else {
        const msg = err instanceof Error ? err.message : t("chat.error_generic");
        addMessage({ role: "assistant", content: `\u26a0\ufe0f ${msg}` });
      }
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Route guard: need at least profile + offer
  if (!profile || !offer) {
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
            <p>{t("guards.no_cv")}</p>
            <button className="btn-primary" onClick={() => navigate("/upload")}>{t("guards.start")}</button>
          </div>
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
    <div className="page">
      <nav className="nav">
        <span className="logo" onClick={() => navigate("/")} style={{cursor:"pointer"}}>bored cv</span>
        <StepIndicator current="chat" />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="btn-secondary"
            onClick={() => {
              if (window.confirm(t("chat.start_over_confirm"))) {
                useStore.getState().reset();
                navigate("/upload");
              }
            }}
            style={{ padding: "6px 12px", fontSize: 12 }}
          >
            {t("chat.start_over")}
          </button>
          <AuthButton />
          <LanguageToggle />
        </div>
      </nav>

      <div className="chat-container-centered">
        {/* Progress bar */}
        <div className="chat-progress">
          <div className="chat-progress-bar">
            <div className="chat-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="chat-progress-text">{progress}%</span>
        </div>

        <div className="chat-header">
          <h1>{t("chat.title")}</h1>
          <p className="subtitle">{t("chat.subtitle")}</p>
        </div>

        {knownFacts.length > 0 && (
          <div className="knowledge-banner" style={{ padding: "8px 12px", marginBottom: 8, background: "var(--bg-muted, #f5f5f5)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)" }}>
            {i18n.language.startsWith("fr")
              ? `💡 Nous avons ${knownFacts.length} info${knownFacts.length > 1 ? "s" : ""} de vos précédents CVs`
              : `💡 We remember ${knownFacts.length} fact${knownFacts.length > 1 ? "s" : ""} from your previous CVs`}
          </div>
        )}

        <div className="chat-messages">
          {messages.map((msg, i) => (
            <ChatMessage key={`${i}-${msg.role}-${msg.content.slice(0, 20)}`} role={msg.role} content={msg.content} />
          ))}
          {loading && (
            <div className="chat-msg assistant">
              <div className="chat-bubble"><span className="spinner" /></div>
            </div>
          )}
          {showTonePicker && profile && offer && (
            <TonePicker
              profile={profile}
              offer={offer}
              lang={i18n.language.startsWith("fr") ? "fr" : "en"}
              onPick={(picked) => {
                setTone(picked);
                setToneChosen(true);
                setShowTonePicker(false);
                handleGenerateNow();
              }}
              onSkip={() => {
                // Mark chosen so we don't re-ask. Keep whatever tone is in store.
                setToneChosen(true);
                setShowTonePicker(false);
                handleGenerateNow();
              }}
            />
          )}
          <div ref={bottomRef} />
        </div>

        {voiceError && !showTonePicker && (
          <div className="error" style={{ marginBottom: 8, fontSize: 12 }}>{voiceError}</div>
        )}
        {!showTonePicker && (
        <form className="chat-input-bar" onSubmit={handleSubmit} style={{ alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !listening) {
                e.preventDefault();
                if (input.trim() && !loading) sendMessage(input);
              }
            }}
            placeholder={listening ? t("chat.speaking") : t("chat.placeholder")}
            disabled={loading || listening}
            rows={1}
            style={{
              resize: "none",
              overflowY: "auto",
              minHeight: 44,
              maxHeight: 240,
              lineHeight: 1.5,
              fontFamily: "inherit",
            }}
          />
          <VoiceInput
            lang={i18n.language}
            contextBias={[
              ...(offer?.company ? [offer.company] : []),
              ...(offer?.title ? [offer.title] : []),
              ...(profile?.name ? [profile.name] : []),
              ...((profile?.experiences || []).map((e) => e.company).filter(Boolean)),
              ...((profile?.experiences || []).map((e) => e.title).filter(Boolean)),
            ]}
            onInterim={(text) => setInput(text)}
            onResult={(text) => setInput(text)}
            onError={(msg) => setVoiceError(msg)}
            onListeningChange={(isListening) => {
              setListening(isListening);
              if (isListening) setVoiceError("");
            }}
          />
          <button className="btn-primary" type="submit" disabled={!input.trim() || loading || listening}
            style={{ padding: "10px 20px" }}>
            {t("chat.send")}
          </button>
        </form>
        )}
        {showSkip && !generating && !showTonePicker && (
          <button
            className="btn-secondary"
            onClick={() => {
              if (!useStore.getState().toneChosen) {
                setShowTonePicker(true);
              } else {
                handleGenerateNow();
              }
            }}
            disabled={loading || generating}
            style={{ marginTop: 8, fontSize: 13, padding: "6px 16px", alignSelf: "center" }}
          >
            {i18n.language.startsWith("fr") ? "Générer le CV maintenant →" : "Generate CV now →"}
          </button>
        )}
      </div>
    </div>
  );
}
