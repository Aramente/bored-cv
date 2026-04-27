import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../store";

// Persistent reminder for unauthenticated users that nothing they do gets
// saved across sessions until they sign up. Hidden on the marketing/landing
// page, the login page itself, and public shared views.
const HIDDEN_PATHS = ["/", "/login"];

export default function GuestSaveNotice() {
  const { t } = useTranslation();
  const user = useStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("bored-cv-guest-notice-dismissed") === "1"
  );

  if (user) return null;
  if (dismissed) return null;
  if (HIDDEN_PATHS.includes(location.pathname)) return null;
  if (location.pathname.startsWith("/v/")) return null;

  const dismiss = () => {
    sessionStorage.setItem("bored-cv-guest-notice-dismissed", "1");
    setDismissed(true);
  };

  return (
    <div className="guest-save-notice" role="status">
      <span className="guest-save-notice__text">
        {t(
          "guest_notice.text",
          "Your work won't be saved unless you sign up — create an account to keep your CVs."
        )}
      </span>
      <button
        type="button"
        className="btn-primary guest-save-notice__cta"
        onClick={() => navigate("/login")}
      >
        {t("guest_notice.cta", "Sign up")}
      </button>
      <button
        type="button"
        className="guest-save-notice__close"
        aria-label={t("guest_notice.dismiss", "Dismiss")}
        onClick={dismiss}
      >
        ×
      </button>
    </div>
  );
}
