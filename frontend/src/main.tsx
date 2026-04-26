import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./i18n";
import "./index.css";

// Handle GitHub Pages SPA redirect
const redirect = sessionStorage.getItem('redirect');
if (redirect) {
  sessionStorage.removeItem('redirect');
  window.history.replaceState(null, '', '/bored-cv' + redirect);
}

// Capture OAuth token from URL fragment/query and clean the URL BEFORE React
// mounts. The token previously survived the entire initial render — it sat in
// window.location until AuthButton's useEffect ran, by which time React,
// react-router, and any analytics had already read window.location.href and
// the URL had been written to browser history with the token intact. Reading
// it here (synchronously, top of bundle) means the token never appears in
// history beyond a single invisible frame.
//
// The token is stashed in sessionStorage under a one-shot key; AuthButton
// drains it on mount. sessionStorage (vs localStorage) so it dies with the
// tab — the persistent auth token still lives in localStorage downstream.
(() => {
  const hashParams = new URLSearchParams(window.location.hash.replace("#", "?"));
  const searchParams = new URLSearchParams(window.location.search);
  const token = hashParams.get("token") || searchParams.get("token");
  const email = hashParams.get("email") || searchParams.get("email");
  const provider = hashParams.get("provider") || searchParams.get("provider");
  if (!token || !email || !provider) return;
  try {
    sessionStorage.setItem("bored-cv-oauth-pending", JSON.stringify({ token, email, provider }));
  } catch {
    // Storage disabled — fall back to leaving it in URL; AuthButton can still read it.
    return;
  }
  // Strip both hash AND query so neither is left in the URL bar / history.
  window.history.replaceState({}, "", window.location.pathname);
})();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
