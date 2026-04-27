import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useStore } from "../store";
import { API_URL } from "../services/api";
import { useTranslation } from "react-i18next";

export default function AuthButton() {
  const { user, setUser, reset } = useStore();
  const messages = useStore((s) => s.messages);
  const cvData = useStore((s) => s.cvData);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const hasDirtyState = () => messages.length > 0 || cvData !== null;
  const confirmReset = (label: string) => {
    if (!hasDirtyState()) return true;
    return window.confirm(label);
  };

  useEffect(() => {
    // Drain the OAuth handoff stashed by main.tsx. main.tsx grabs the token
    // out of the URL synchronously (so it never lingers in history) and parks
    // it in sessionStorage for us to consume here. Falling back to URL parsing
    // covers the edge case where sessionStorage was disabled.
    let token: string | null = null;
    let email: string | null = null;
    let provider: string | null = null;
    try {
      const pending = sessionStorage.getItem("bored-cv-oauth-pending");
      if (pending) {
        const parsed = JSON.parse(pending);
        token = parsed.token || null;
        email = parsed.email || null;
        provider = parsed.provider || null;
        sessionStorage.removeItem("bored-cv-oauth-pending");
      }
    } catch {
      // ignore — fall through to URL parsing below
    }
    if (!token) {
      const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
      const searchParams = new URLSearchParams(window.location.search);
      token = hashParams.get("token") || searchParams.get("token");
      email = hashParams.get("email") || searchParams.get("email");
      provider = hashParams.get("provider") || searchParams.get("provider");
    }

    if (token && email && provider) {
      localStorage.setItem("bored-cv-token", token);
      setUser({ email, provider });
      // Belt-and-braces: clean URL again in case main.tsx's pass missed it.
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    // Check localStorage for existing token
    const saved = localStorage.getItem("bored-cv-token");
    if (saved && !user) {
      fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${saved}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.authenticated) {
            setUser({ email: data.email, provider: data.provider });
          } else {
            localStorage.removeItem("bored-cv-token");
          }
        })
        .catch(() => {});
    }
  }, [setUser]);

  const showReset = location.pathname !== "/";

  if (user) {
    return (
      <div className="auth-user">
        {showReset && (
          <>
            <button className="auth-reset" onClick={() => navigate("/projects")}>
              my projects
            </button>
            <button className="auth-reset" onClick={() => {
              if (!confirmReset("Start a new CV? Unsaved edits will be lost.")) return;
              reset();
              navigate("/");
            }}>
              new CV
            </button>
          </>
        )}
        <span className="auth-email">{user.email}</span>
        <button
          className="auth-logout"
          onClick={() => {
            if (!confirmReset("Log out? Unsaved edits will be lost.")) return;
            localStorage.removeItem("bored-cv-token");
            setUser(null);
            reset();
            navigate("/");
          }}
        >
          logout
        </button>
      </div>
    );
  }

  return (
    <div className="auth-buttons">
      {showReset && (
        <button className="auth-reset" onClick={() => {
          if (!confirmReset("Start a new CV? Unsaved edits will be lost.")) return;
          reset();
          navigate("/");
        }}>
          new CV
        </button>
      )}
      <button
        className="auth-btn auth-btn-signin"
        onClick={() => navigate("/login")}
      >
        {t("auth.signin", "Sign in")}
      </button>
    </div>
  );
}
