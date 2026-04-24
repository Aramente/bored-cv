import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PDFViewer, PDFDownloadLink } from "@react-pdf/renderer";
import { getSnapshot, type SnapshotPayload } from "../services/api";
import TopNav from "../components/TopNav";
import type { TemplateId } from "../store";
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

const templateComponents: Record<TemplateId, React.ComponentType<any>> = {
  clean: Clean, contrast: Contrast, minimal: Minimal, retro: Retro, consultant: Consultant,
  timeline: Timeline, mono: Mono, executive: Executive, editorial: Editorial, compact: Compact,
};

export default function SharedView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<SnapshotPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Belt-and-suspenders noindex — in addition to server X-Robots-Tag header
  // and /robots.txt blocking /v/. If any one layer fails, the others hold.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow, noarchive";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  useEffect(() => {
    if (!slug) return;
    getSnapshot(slug).then(setSnapshot).catch((e) => setError(e.message));
  }, [slug]);

  const PreviewComponent = snapshot ? templateComponents[snapshot.template as TemplateId] || Clean : null;
  const pdfDocument = useMemo(() => {
    if (!snapshot || !PreviewComponent) return null;
    return (
      <PreviewComponent
        data={snapshot.cv_data}
        brandColors={snapshot.use_brand_colors ? snapshot.brand_colors : null}
      />
    );
  }, [snapshot, PreviewComponent]);

  if (error) {
    return (
      <div className="page">
        <TopNav minimal />
        <div className="guard-state">
          <div>
            <p>This CV link is no longer available.</p>
            <button className="btn-primary" onClick={() => navigate("/")}>Build your own</button>
          </div>
        </div>
      </div>
    );
  }

  if (!snapshot || !pdfDocument) {
    return (
      <div className="page">
        <TopNav
          minimal
          extra={
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: "var(--radius-pill)", background: "var(--bg-muted)", color: "var(--text-muted)", letterSpacing: 0.3 }}>
              Shared · view only
            </span>
          }
        />
        <div className="guard-state"><div><span className="spinner" /></div></div>
      </div>
    );
  }

  return (
    <div className="page">
      <TopNav
        minimal
        extra={
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: "var(--radius-pill)", background: "var(--bg-muted)", color: "var(--text-muted)", letterSpacing: 0.3 }}>
            Shared · view only
          </span>
        }
      />
      <div className="page-content">
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", height: 700, marginBottom: 16 }}>
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            {pdfDocument}
          </PDFViewer>
        </div>
        <PDFDownloadLink document={pdfDocument} fileName={`${snapshot.cv_data.name.replace(/\s+/g, "_")}_CV.pdf`}>
          {({ loading }) => (
            <button className="btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? <span className="spinner" /> : "Download PDF"}
            </button>
          )}
        </PDFDownloadLink>
        <button className="btn-secondary" style={{ width: "100%", marginTop: 8 }} onClick={() => navigate("/")}>
          Build your own CV
        </button>
      </div>
    </div>
  );
}
