import { useTranslation } from "react-i18next";
import { useStore } from "../store";

export default function Chat() {
  const { t } = useTranslation();
  const setStep = useStore((s) => s.setStep);

  return (
    <div>
      <h1>{t("chat.title")}</h1>
      <button onClick={() => setStep("templates")}>{t("common.next")}</button>
    </div>
  );
}
