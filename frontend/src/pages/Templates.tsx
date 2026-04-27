import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PDFViewer, PDFDownloadLink } from "@react-pdf/renderer";
import { useStore } from "../store";
import { createSnapshot, SnapshotError } from "../services/api";
import TopNav from "../components/TopNav";
import StepIndicator from "../components/StepIndicator";
import Clean from "../templates/Clean";
import Contrast from "../templates/Contrast";
import Minimal from "../templates/Minimal";
import Retro from "../templates/Retro";
import Consultant from "../templates/Consultant";
import Timeline from "../templates/Timeline";
import Mono from "../templates/Mono";
import Executive from "../templates/Executive";
import Editorial from "../templates/Editorial";
import Compact from "../templates/Compact";

const templateComponents = {
  clean: Clean, contrast: Contrast, minimal: Minimal, retro: Retro, consultant: Consultant,
  timeline: Timeline, mono: Mono, executive: Executive, editorial: Editorial, compact: Compact,
};

export default function Templates() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cvData, cvDataAlt, cvLang, selectedTemplate, brandColors, useBrandColors, setUseBrandColors, cvOriginal, saveCvToLibrary } = useStore();
  const [beforeAfterOpen, setBeforeAfterOpen] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "creating" | "copied" | "auth" | "network" | "error">("idle");
  const [shareUrl, setShareUrl] = useState<string>("");

  const activeCv = cvLang === (cvData?.language || "en") ? cvData : (cvDataAlt || cvData);

  if (!cvData) {
    return (
      <div className="page">
        <TopNav />
        <div className="guard-state">
          <div>
            <p>{t("guards.no_generated")}</p>
            <button className="btn-primary" onClick={() => navigate("/upload")}>{t("guards.start")}</button>
          </div>
        </div>
      </div>
    );
  }

  const displayCv = activeCv || cvData;
  const PreviewComponent = templateComponents[selectedTemplate];

  // Persist the CV to the cross-project library as soon as the user reaches
  // Templates — i.e. they've finished editing and are picking a layout. The
  // earlier rule of "only save on PDF download / share" missed every user
  // who finalized a CV but didn't export, leaving the "Reuse your last CV"
  // card absent on their next job offer. Templates is the strongest "this
  // is my CV" signal short of an explicit download.
  useEffect(() => {
    if (displayCv) saveCvToLibrary(displayCv);
  }, [displayCv, saveCvToLibrary]);

  // R2 — memoize PDF document for PDFDownloadLink
  const pdfDocument = useMemo(
    () => <PreviewComponent data={displayCv} brandColors={useBrandColors ? brandColors : null} />,
    [displayCv, useBrandColors, brandColors, selectedTemplate]
  );

  return (
    <div className="page">
      <TopNav
        center={<StepIndicator current="download" />}
        extra={<button className="btn-secondary" onClick={() => navigate("/editor")}>{t("common.back")}</button>}
      />
      <div className="page-content">
        <h1>{t("templates.title")}</h1>
        <p className="subtitle">{t("templates.subtitle")}</p>

        {/* V2 — Before / After comparison */}
        {cvOriginal && cvOriginal.experiences.length > 0 && displayCv.experiences.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <button
              className="btn-secondary"
              style={{ fontSize: 13, marginBottom: 8 }}
              onClick={() => setBeforeAfterOpen(!beforeAfterOpen)}
            >
              {beforeAfterOpen ? "▾" : "▸"} {t("templates.before_after")}
            </button>
            {beforeAfterOpen && (
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16, opacity: 0.7 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-dim)", display: "block", marginBottom: 8 }}>{t("templates.linkedin_version")}</span>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{cvOriginal.experiences[0].title}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{cvOriginal.experiences[0].company}</p>
                  {cvOriginal.experiences[0].bullets.slice(0, 2).map((b, i) => (
                    <p key={i} style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4, lineHeight: 1.5 }}>{b}</p>
                  ))}
                </div>
                <div style={{ flex: 1, background: "rgba(30, 41, 59, 0.03)", border: "2px solid var(--gold)", borderRadius: "var(--radius)", padding: 16 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)", display: "block", marginBottom: 8 }}>{t("templates.bored_cv_version")}</span>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{displayCv.experiences[0].title}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{displayCv.experiences[0].company}</p>
                  {displayCv.experiences[0].bullets.slice(0, 2).map((b, i) => (
                    <p key={i} style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4, lineHeight: 1.5 }}>{b}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Language + template picker lived here in the v1 flow but they now
            live in the Editor as chip strips. Templates.tsx is the finalize /
            download step — avoid re-presenting the same choices twice. Brand
            colors stay because they only matter at export time. */}
        {brandColors && (
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}>
              <input
                type="checkbox"
                checked={useBrandColors}
                onChange={(e) => setUseBrandColors(e.target.checked)}
              />
              <span>{t("templates.use_company_colors")}</span>
              <span style={{ display: "inline-flex", gap: 4, marginLeft: 4 }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, background: brandColors.primary, border: "1px solid var(--border)" }} />
                <span style={{ width: 14, height: 14, borderRadius: 3, background: brandColors.secondary, border: "1px solid var(--border)" }} />
              </span>
            </label>
          </div>
        )}

        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", height: 500, marginBottom: 16 }}>
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            <PreviewComponent data={displayCv} brandColors={useBrandColors ? brandColors : null} />
          </PDFViewer>
        </div>

        <PDFDownloadLink document={pdfDocument} fileName={`${displayCv.name.replace(/\s+/g, "_")}_CV.pdf`}>
          {({ loading: pdfLoading }) => (
            <button
              className="btn-primary"
              style={{ width: "100%" }}
              disabled={pdfLoading}
              onClick={() => {
                // Persist finalized CV so the user's next project can reuse it.
                // Downloading is the strongest "I'm done" signal we have.
                if (!pdfLoading) saveCvToLibrary(displayCv);
              }}
            >
              {pdfLoading ? <span className="spinner" /> : t("editor.download")}
            </button>
          )}
        </PDFDownloadLink>
        <button className="btn-secondary" style={{ width: "100%", marginTop: 8 }} onClick={() => navigate("/cover-letter")}>
          {t("templates.cover_letter")}
        </button>

        {/* Shareable public URL — freezes the CV at share time. Creator must
            be signed in (backend enforces). Anyone with the link can view;
            robots are blocked at three layers. */}
        <button
          className="btn-secondary"
          style={{ width: "100%", marginTop: 8 }}
          disabled={shareState === "creating"}
          onClick={async () => {
            setShareState("creating");
            try {
              const { slug } = await createSnapshot({
                cv_data: displayCv,
                template: selectedTemplate,
                brand_colors: brandColors,
                use_brand_colors: useBrandColors,
              });
              const url = `${window.location.origin}/bored-cv/v/${slug}`;
              setShareUrl(url);
              saveCvToLibrary(displayCv);
              await navigator.clipboard.writeText(url).catch(() => {});
              setShareState("copied");
              setTimeout(() => setShareState("idle"), 4000);
            } catch (e) {
              console.error(e);
              const next = e instanceof SnapshotError
                ? (e.status === 401 || e.status === 403 ? "auth"
                  : e.status === 0 ? "network"
                  : "error")
                : "error";
              setShareState(next);
              setTimeout(() => setShareState("idle"), 4000);
            }
          }}
        >
          {shareState === "creating" ? <span className="spinner" />
            : shareState === "copied" ? t("templates.share_copied", { url: shareUrl })
            : shareState === "auth" ? t("templates.share_auth_required")
            : shareState === "network" ? t("templates.share_network_error")
            : shareState === "error" ? t("templates.share_failed")
            : t("templates.share_public_link")}
        </button>
      </div>
    </div>
  );
}
