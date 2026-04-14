import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { parseLinkedIn, scrapeOffer, analyzeProfile } from "../services/api";
import type { CVData } from "../store";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";

export default function Upload() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { setProfile, setOffer, setGapAnalysis, setCvData } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [offerTab, setOfferTab] = useState<"url" | "text">("url");
  const [offerUrl, setOfferUrl] = useState("");
  const [offerText, setOfferText] = useState("");
  const [showTutorial, setShowTutorial] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState("");

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.type === "application/pdf") setFile(f);
    else setError("PDF only");
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const canSubmit = file && (offerUrl || offerText);

  const handleSubmit = async () => {
    if (!file || (!offerUrl && !offerText)) return;
    setLoading(true);
    setError("");

    try {
      const captcha = "";

      setLoadingStep(t("upload.step_parsing"));
      const [profile, offer] = await Promise.all([
        parseLinkedIn(file, captcha),
        scrapeOffer(offerTab === "url" ? offerUrl : "", offerTab === "text" ? offerText : "", captcha),
      ]);
      setProfile(profile);
      setOffer(offer);

      // Immediately create a CV draft from the LinkedIn profile — don't start blank
      const initialCv: CVData = {
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
      };
      setCvData(initialCv);

      // Go to chat immediately — analyze in background
      setLoadingStep(t("upload.step_ready"));
      navigate("/chat");

      // Background: analyze profile vs offer (first chat question appears when done)
      const lang = i18n.language.startsWith("fr") ? "fr" : "en";
      analyzeProfile(profile, offer, captcha, lang)
        .then((gap) => useStore.getState().setGapAnalysis(gap))
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  return (
    <div className="page">
      <nav className="nav">
        <span className="logo" onClick={() => navigate("/")} style={{cursor:"pointer"}}>bored cv</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AuthButton />
          <LanguageToggle />
        </div>
      </nav>
      <div className="page-content">
        <h1>{t("upload.title")}</h1>

        {error && <div className="error">{error}</div>}

        <section style={{ marginBottom: 32 }}>
          <label className="label">{t("upload.linkedin_label")}</label>
          <div
            className="drop-zone"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: "2px dashed var(--border-light)",
              borderRadius: "var(--radius-lg)",
              padding: "40px",
              textAlign: "center",
              cursor: "pointer",
              background: file ? "var(--accent-subtle)" : "var(--surface)",
              marginTop: 8,
            }}
          >
            {file ? (
              <p style={{ fontWeight: 600, color: "var(--accent)" }}>{file.name}</p>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>{t("upload.linkedin_drop")}</p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </div>

          <button
            className="btn-secondary"
            style={{ marginTop: 8 }}
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {t("upload.linkedin_help_title")}
          </button>

          {showTutorial && (
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: 16,
              marginTop: 8,
            }}>
              <ol style={{ paddingLeft: 20 }}>
                <li>{t("upload.linkedin_help_1")}</li>
                <li>{t("upload.linkedin_help_2")}</li>
                <li>{t("upload.linkedin_help_3")}</li>
                <li>{t("upload.linkedin_help_4")}</li>
              </ol>
            </div>
          )}
        </section>

        <section style={{ marginBottom: 32 }}>
          <label className="label">{t("upload.offer_label")}</label>
          <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 12 }}>
            <button
              className={offerTab === "url" ? "btn-primary" : "btn-secondary"}
              style={{ padding: "8px 16px", fontSize: 13 }}
              onClick={() => setOfferTab("url")}
            >
              {t("upload.offer_tab_url")}
            </button>
            <button
              className={offerTab === "text" ? "btn-primary" : "btn-secondary"}
              style={{ padding: "8px 16px", fontSize: 13 }}
              onClick={() => setOfferTab("text")}
            >
              {t("upload.offer_tab_text")}
            </button>
          </div>

          {offerTab === "url" ? (
            <input
              className="input"
              type="url"
              placeholder={t("upload.offer_url_placeholder")}
              value={offerUrl}
              onChange={(e) => setOfferUrl(e.target.value)}
            />
          ) : (
            <textarea
              className="input"
              placeholder={t("upload.offer_text_placeholder")}
              value={offerText}
              onChange={(e) => setOfferText(e.target.value)}
            />
          )}
        </section>

        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          style={{ width: "100%" }}
        >
          {loading ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="spinner" />
              {loadingStep}
            </span>
          ) : t("upload.next")}
        </button>
      </div>
    </div>
  );
}
