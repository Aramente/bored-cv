import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Document, Page, Text, StyleSheet, PDFDownloadLink } from "@react-pdf/renderer";
import { useStore, type CoverLetterData } from "../store";
import { generateCoverLetter } from "../services/api";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";

const pdfStyles = StyleSheet.create({
  page: { padding: 60, fontFamily: "Helvetica", fontSize: 11, color: "#1e293b", lineHeight: 1.6 },
  greeting: { marginBottom: 16, fontSize: 11 },
  paragraph: { marginBottom: 12, fontSize: 11 },
  signature: { marginTop: 24, fontSize: 11 },
});

function CoverLetterPDF({ data }: { data: CoverLetterData }) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={pdfStyles.greeting}>{data.greeting}</Text>
        <Text style={pdfStyles.paragraph}>{data.opening}</Text>
        <Text style={pdfStyles.paragraph}>{data.body}</Text>
        <Text style={pdfStyles.paragraph}>{data.closing}</Text>
        <Text style={pdfStyles.signature}>{data.signature}</Text>
      </Page>
    </Document>
  );
}

export default function CoverLetter() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { profile, offer, cvData, messages, coverLetterData, setCoverLetterData, tone, targetMarket } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [localData, setLocalData] = useState<CoverLetterData | null>(coverLetterData);

  const generate = useCallback(async () => {
    if (!profile || !offer || !cvData) return;
    setLoading(true);
    setError("");
    try {
      const result = await generateCoverLetter(profile, offer, cvData, messages, "", i18n.language, tone, targetMarket);
      setCoverLetterData(result);
      setLocalData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }, [profile, offer, cvData, messages, i18n.language, tone, targetMarket, setCoverLetterData]);

  useEffect(() => {
    if (!localData && profile && offer && cvData && !loading) {
      generate();
    }
  }, [localData, profile, offer, cvData, loading, generate]);

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

  const updateField = (field: keyof CoverLetterData, value: string) => {
    if (!localData) return;
    const updated = { ...localData, [field]: value };
    setLocalData(updated);
    setCoverLetterData(updated);
  };

  return (
    <div className="page">
      <nav className="nav">
        <span className="logo" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>bored cv</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn-secondary" onClick={() => navigate("/templates")} style={{ padding: "6px 12px", fontSize: 12 }}>
            {t("common.back")}
          </button>
          <AuthButton />
          <LanguageToggle />
        </div>
      </nav>
      <div className="page-content">
        <h1>{t("cover_letter.title")}</h1>
        <p className="subtitle">{t("cover_letter.subtitle")}</p>

        {loading && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div className="spinner" />
            <p style={{ marginTop: 16, color: "var(--text-muted)" }}>{t("cover_letter.generating")}</p>
          </div>
        )}

        {error && (
          <div style={{ padding: 16, background: "var(--danger-bg, #fef2f2)", borderRadius: "var(--radius)", marginBottom: 16 }}>
            <p style={{ color: "var(--danger, #dc2626)", fontSize: 14 }}>{error}</p>
            <button className="btn-secondary" style={{ marginTop: 8 }} onClick={generate}>{t("cover_letter.retry")}</button>
          </div>
        )}

        {localData && !loading && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
              {(["greeting", "opening", "body", "closing", "signature"] as const).map((field) => (
                <div key={field}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" }}>
                    {t(`cover_letter.${field}_label`)}
                  </label>
                  <textarea
                    className="input"
                    value={localData[field]}
                    onChange={(e) => updateField(field, e.target.value)}
                    rows={field === "body" ? 8 : field === "opening" || field === "closing" ? 4 : 2}
                    style={{ width: "100%", fontSize: 14, lineHeight: 1.6, resize: "vertical" }}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <PDFDownloadLink
                document={<CoverLetterPDF data={localData} />}
                fileName={`cover-letter-${offer?.company || "draft"}.pdf`}
                style={{ flex: 1 }}
              >
                {({ loading: pdfLoading }) => (
                  <button className="btn-primary" style={{ width: "100%" }} disabled={pdfLoading}>
                    {pdfLoading ? t("common.loading") : t("cover_letter.download")}
                  </button>
                )}
              </PDFDownloadLink>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
