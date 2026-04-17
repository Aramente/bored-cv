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
        <h2>{t("landing.ba_heading")}</h2>
        <div className="ba-container">
          <div className="ba-card ba-before">
            <span className="ba-label">LinkedIn</span>
            <div className="ba-content">
              <p className="ba-title">{t("landing.ba_before_title")}</p>
              <p className="ba-company">{t("landing.ba_before_company")}</p>
              <p className="ba-bullet">{t("landing.ba_before_bullet")}</p>
            </div>
          </div>
          <div className="ba-arrow">→</div>
          <div className="ba-card ba-after">
            <span className="ba-label">Bored CV</span>
            <div className="ba-content">
              <p className="ba-title">{t("landing.ba_after_title")}</p>
              <p className="ba-company">{t("landing.ba_after_company")}</p>
              <p className="ba-bullet">{t("landing.ba_after_bullet")}</p>
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
        <p>{t("landing.footer")}</p>
      </footer>
    </div>
  );
}
