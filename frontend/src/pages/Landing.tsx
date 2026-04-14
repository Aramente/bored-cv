import { useTranslation } from "react-i18next";
import { useStore } from "../store";
import LanguageToggle from "../components/LanguageToggle";

export default function Landing() {
  const { t } = useTranslation();
  const setStep = useStore((s) => s.setStep);

  const steps = [
    { num: "01", text: t("landing.step1") },
    { num: "02", text: t("landing.step2") },
    { num: "03", text: t("landing.step3") },
    { num: "04", text: t("landing.step4") },
  ];

  return (
    <div className="page landing">
      <nav className="nav">
        <img src="/bored-cv/logo.webp" alt="Bored CV" className="logo-img" />
        <LanguageToggle />
      </nav>

      <section className="hero">
        <img src="/bored-cv/logo-hero.webp" alt="Bored CV character" className="logo-hero" />
        <h1>{t("landing.hero")}</h1>
        <p className="subtitle">{t("landing.subtitle")}</p>
        <button className="btn-primary btn-lg" onClick={() => setStep("upload")}>
          {t("landing.cta")}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginLeft: 8}}>
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
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
