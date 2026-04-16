import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../store";
import { getConsent, giveConsent } from "../services/api";

export default function ConsentBanner() {
  const { t } = useTranslation();
  const user = useStore((s) => s.user);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;
    const dismissed = localStorage.getItem("bored-cv-consent-asked");
    if (dismissed) return;
    getConsent().then((res) => {
      if (!res.consented) setVisible(true);
    }).catch(() => {});
  }, [user]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem("bored-cv-consent-asked", "1");
  };

  const accept = () => {
    giveConsent().catch(() => {});
    dismiss();
  };

  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "12px 20px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.1)", display: "flex",
      alignItems: "center", gap: 12, zIndex: 1000, fontSize: 13,
    }}>
      <span style={{ color: "var(--text)" }}>{t("consent.text")}</span>
      <button className="btn-primary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={accept}>
        {t("consent.yes")}
      </button>
      <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={dismiss}>
        {t("consent.no")}
      </button>
    </div>
  );
}
