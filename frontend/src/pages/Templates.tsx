import { useTranslation } from "react-i18next";
import { useStore } from "../store";

export default function Templates() {
  const { t } = useTranslation();
  const setStep = useStore((s) => s.setStep);

  return (
    <div>
      <h1>{t("templates.title")}</h1>
      <button onClick={() => setStep("editor")}>{t("common.next")}</button>
    </div>
  );
}
