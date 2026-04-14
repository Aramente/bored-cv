import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import LanguageToggle from "../components/LanguageToggle";
import AuthButton from "../components/AuthButton";

export default function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useStore((s) => s.user);

  const steps = [
    { num: "01", text: t("landing.step1") },
    { num: "02", text: t("landing.step2") },
    { num: "03", text: t("landing.step3") },
    { num: "04", text: t("landing.step4") },
  ];

  return (
    <div className="page landing">
      <nav className="nav">
        <span className="logo">bored cv</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AuthButton />
          <LanguageToggle />
        </div>
      </nav>

      <section className="hero">
        <img src="/bored-cv/logo-hero.webp" alt="Bored CV character" className="logo-hero" />
        <h1>{t("landing.hero")}</h1>
        <p className="subtitle">{t("landing.subtitle")}</p>
        <button className="btn-primary btn-lg" onClick={() => navigate("/upload")}>
          {t("landing.cta")}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginLeft: 8}}>
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
        {user && (
          <button className="btn-secondary" onClick={() => navigate("/projects")} style={{ marginLeft: 12 }}>
            my projects →
          </button>
        )}
      </section>

      <section className="before-after">
        <h2>before → after</h2>
        <div className="ba-container">
          <div className="ba-card ba-before">
            <span className="ba-label">LinkedIn</span>
            <div className="ba-content">
              <p className="ba-title">Head of People & BDR</p>
              <p className="ba-company">Mindflow</p>
              <p className="ba-bullet">My goal is to provide the best experience for candidates and employees. We are remote first. We are building a great automation tool for enterprises.</p>
            </div>
          </div>
          <div className="ba-arrow">→</div>
          <div className="ba-card ba-after">
            <span className="ba-label">Bored CV</span>
            <div className="ba-content">
              <p className="ba-title">Head of People Operations</p>
              <p className="ba-company">Mindflow (AI automation, seed→Series A, 12→45 employees)</p>
              <p className="ba-bullet">Built People ops from scratch for a distributed team across 3 countries. Ran payroll in FR/US/UK with zero errors over 14 months. Cut onboarding time from 3 weeks to 5 days through structured buddy program.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <h2>{t("landing.how_it_works")}</h2>
        <div className="steps-grid">
          {steps.map((s) => (
            <div key={s.num} className="step-card">
              <div className="step-num">{s.num}</div>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <p>made with caffeine & Gemini Flash ⚡</p>
      </footer>
    </div>
  );
}
