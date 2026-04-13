import { useTranslation } from "react-i18next";
import { useStore } from "../store";

export default function Landing() {
  const { t } = useTranslation();
  const setStep = useStore((s) => s.setStep);

  return (
    <div>
      <h1>{t("landing.hero")}</h1>
      <p>{t("landing.subtitle")}</p>
      <button onClick={() => setStep("upload")}>{t("landing.cta")}</button>
    </div>
  );
}
