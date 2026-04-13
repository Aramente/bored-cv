import { useTranslation } from "react-i18next";

export default function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = i18n.language.startsWith("fr") ? "fr" : "en";

  return (
    <button
      className="lang-toggle"
      onClick={() => i18n.changeLanguage(current === "fr" ? "en" : "fr")}
    >
      {current === "fr" ? "EN" : "FR"}
    </button>
  );
}
