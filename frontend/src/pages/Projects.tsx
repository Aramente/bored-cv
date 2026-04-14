import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { API_URL } from "../services/api";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";

interface Project {
  id: number;
  name: string;
  offer_title: string;
  match_score: number;
  updated_at: string;
}

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("bored-cv-token");
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("not authed");
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

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
          <h1>your projects</h1>
          <button className="btn-primary" onClick={() => navigate("/upload")}>
            + new CV
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}><span className="spinner" /></div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-dim)" }}>
            <p style={{ fontSize: 18, marginBottom: 8 }}>no projects yet</p>
            <p style={{ fontSize: 14 }}>create your first CV to get started</p>
          </div>
        ) : (
          <div className="projects-grid">
            {projects.map((p) => (
              <div key={p.id} className="project-card" onClick={async () => {
                try {
                  const { loadProject } = await import("../services/api");
                  const project = await loadProject(p.id);
                  const store = useStore.getState();
                  store.setProjectId(p.id);
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
              }}>
                <div className="project-card-header">
                  <h3>{p.name}</h3>
                  {p.match_score > 0 && (
                    <span className="project-score">{p.match_score}%</span>
                  )}
                </div>
                <p className="project-offer">{p.offer_title}</p>
                <p className="project-date">{new Date(p.updated_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
