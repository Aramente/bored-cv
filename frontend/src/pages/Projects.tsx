import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { API_URL } from "../services/api";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";

interface Project {
  id: number | string;
  name: string;
  offer_title: string;
  match_score: number;
  updated_at: string;
  source: "server" | "local";
}

export default function Projects() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const { offer, cvData, profile, gapAnalysis, messages } = useStore();

  useEffect(() => {
    const allProjects: Project[] = [];

    // Always check localStorage for current session project
    if (offer && cvData) {
      allProjects.push({
        id: "current",
        name: offer.company || offer.title || "Current project",
        offer_title: offer.title,
        match_score: cvData.match_score || 0,
        updated_at: new Date().toISOString(),
        source: "local",
      });
    }

    // Also try server DB if logged in
    const token = localStorage.getItem("bored-cv-token");
    if (token) {
      fetch(`${API_URL}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : [])
        .then((data) => {
          if (Array.isArray(data)) {
            const serverProjects = data.map((p: any) => ({ ...p, source: "server" as const }));
            // Merge: don't duplicate current project if it's also on server
            const merged = [...allProjects];
            for (const sp of serverProjects) {
              if (!merged.some((m) => m.name === sp.name)) {
                merged.push(sp);
              }
            }
            setProjects(merged);
          }
          setLoading(false);
        })
        .catch(() => { setProjects(allProjects); setLoading(false); });
    } else {
      setProjects(allProjects);
      setLoading(false);
    }
  }, [offer, cvData]);

  const loadCurrentProject = () => {
    // Data is already in the store from localStorage persist — just navigate
    navigate("/chat");
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1>{t("projects.title")}</h1>
          <button className="btn-primary" onClick={() => { useStore.getState().reset(); navigate("/upload"); }}>
            {t("projects.new")}
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}><span className="spinner" /></div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-dim)" }}>
            <p style={{ fontSize: 18, marginBottom: 8 }}>{t("projects.empty")}</p>
            <p style={{ fontSize: 14 }}>{t("projects.empty_hint")}</p>
          </div>
        ) : (
          <div className="projects-grid">
            {projects.map((p) => (
              <div key={p.id} className="project-card" onClick={async () => {
                if (p.source === "local") {
                  loadCurrentProject();
                } else {
                  try {
                    const { loadProject } = await import("../services/api");
                    const project = await loadProject(p.id as number);
                    const store = useStore.getState();
                    store.setProjectId(p.id as number);
                    if (project.profile_data) store.setProfile(project.profile_data);
                    if (project.offer_data) store.setOffer(project.offer_data);
                    if (project.gap_analysis) store.setGapAnalysis(project.gap_analysis);
                    if (project.cv_data) store.setCvData(project.cv_data);
                    store.setMessages(project.messages || []);
                    if (project.template) store.setSelectedTemplate(project.template);
                    if (project.tone) store.setTone(project.tone);
                    navigate("/chat");
                  } catch {
                    navigate("/upload");
                  }
                }
              }}>
                <div className="project-card-header">
                  <h3>{p.name}</h3>
                  {p.match_score > 0 && (
                    <span className="project-score">{p.match_score}%</span>
                  )}
                </div>
                <p className="project-offer">{p.offer_title}</p>
                <p className="project-date">
                  {p.source === "local" && "📱 "}
                  {new Date(p.updated_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
