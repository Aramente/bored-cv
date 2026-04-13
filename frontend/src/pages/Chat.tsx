import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../store";
import { chatNext, generateCV } from "../services/api";
import ChatMessage from "../components/ChatMessage";
import VoiceInput from "../components/VoiceInput";
import LanguageToggle from "../components/LanguageToggle";

export default function Chat() {
  const { t, i18n } = useTranslation();
  const {
    profile, offer, gapAnalysis,
    messages, addMessage,
    setCvData, setStep,
  } = useStore();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      const allMessages = [...messages, { role: "user" as const, content: text }];
      const captcha = "";
      const response = await chatNext(profile, offer, gapAnalysis, allMessages, captcha);

      addMessage({ role: "assistant", content: response.message });

      if (response.is_complete) {
        setGenerating(true);
        const cv = await generateCV(profile, offer, gapAnalysis, allMessages, captcha);
        setCvData(cv);
        setStep("templates");
      }
    } catch {
      addMessage({ role: "assistant", content: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (generating) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ textAlign: "center" }}>
          <div className="spinner" style={{ width: 40, height: 40, marginBottom: 16 }} />
          <p style={{ color: "var(--text-muted)" }}>{t("chat.generating")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page chat-page">
      <nav className="nav">
        <div className="logo">Bored CV</div>
        <LanguageToggle />
      </nav>

      <div className="chat-container">
        <div className="chat-header">
          <h1 style={{ fontSize: 20, color: "var(--text)" }}>{t("chat.title")}</h1>
          <p className="subtitle" style={{ fontSize: 14, marginBottom: 0, color: "var(--text-muted)" }}>{t("chat.subtitle")}</p>
        </div>

        <div className="chat-messages">
          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} />
          ))}
          {loading && (
            <div className="chat-msg assistant">
              <div className="chat-bubble"><span className="spinner" /></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className="chat-input-bar" onSubmit={handleSubmit}>
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("chat.placeholder")}
            disabled={loading}
          />
          <VoiceInput
            onResult={(text) => sendMessage(text)}
            lang={i18n.language}
          />
          <button className="btn-primary" type="submit" disabled={!input.trim() || loading}
            style={{ padding: "10px 20px" }}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
