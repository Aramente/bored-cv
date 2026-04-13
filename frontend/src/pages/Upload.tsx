import { useTranslation } from "react-i18next";
import { useStore } from "../store";

export default function Upload() {
  const { t } = useTranslation();
  const setStep = useStore((s) => s.setStep);

  return (
    <div>
      <h1>{t("upload.title")}</h1>
      <button onClick={() => setStep("chat")}>{t("upload.next")}</button>
    </div>
  );
}
