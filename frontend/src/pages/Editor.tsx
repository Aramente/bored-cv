import { useTranslation } from "react-i18next";

export default function Editor() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t("editor.title")}</h1>
      <button>{t("editor.download")}</button>
    </div>
  );
}
