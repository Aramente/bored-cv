import { useEffect, useState } from "react";
import { useStore } from "../store";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:7860";

interface Project {
  id: number;
  name: string;
  offer_title: string;
  match_score: number;
  updated_at: string;
}

export default function Projects() {
  const setStep = useStore((s) => s.setStep);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/projects`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { setProjects(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <nav className="nav">
        <span className="logo">bored cv</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AuthButton />
          <LanguageToggle />
        </div>
      </nav>
      <div className="page-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1>your projects</h1>
          <button className="btn-primary" onClick={() => setStep("upload")}>
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
              <div key={p.id} className="project-card" onClick={() => {
                // TODO: load project and navigate to editor
                setStep("upload");
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
