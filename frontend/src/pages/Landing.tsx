import { useTranslation } from "react-i18next";
import { useStore } from "../store";
import LanguageToggle from "../components/LanguageToggle";

export default function Landing() {
  const { t } = useTranslation();
  const setStep = useStore((s) => s.setStep);

  const steps = [
    { num: "1", text: t("landing.step1") },
    { num: "2", text: t("landing.step2") },
    { num: "3", text: t("landing.step3") },
    { num: "4", text: t("landing.step4") },
  ];

  return (
    <div className="page landing">
      <nav className="nav">
        <div className="logo">Bored CV</div>
        <LanguageToggle />
      </nav>

      <section className="hero">
        <h1>{t("landing.hero")}</h1>
        <p className="subtitle">{t("landing.subtitle")}</p>
        <button className="btn-primary" onClick={() => setStep("upload")}>
          {t("landing.cta")}
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
    </div>
  );
}
