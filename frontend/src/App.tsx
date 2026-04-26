import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Upload from "./pages/Upload";
import Chat from "./pages/Chat";
import Templates from "./pages/Templates";
import Editor from "./pages/Editor";
import Projects from "./pages/Projects";
import CoverLetter from "./pages/CoverLetter";
import SharedView from "./pages/SharedView";
import ConsentBanner from "./components/ConsentBanner";
import { useStore } from "./store";
import { translateCV } from "./services/api";

export default function App() {
  const { i18n } = useTranslation();
  const setCvLang = useStore((s) => s.setCvLang);
  const fixLangAttempted = useRef(false);

  // Keep CV preview language tied to UI language. Without this, a user with
  // an English browser still saw a French-defaulted cvLang, and toggling the
  // UI did nothing to the CV chrome (section titles, placeholders, buttons).
  // Manual FR/EN chips in the editor still override until the user touches
  // the global UI toggle again.
  useEffect(() => {
    setCvLang(i18n.language.startsWith("fr") ? "fr" : "en");
  }, [i18n.language, setCvLang]);

  // One-shot localStorage migration for kevin@. The persisted CV ended up in
  // the FR slot but the content was English (the version actually worked on),
  // and the EN slot was unused. Visiting `?fix-lang=1` does:
  //   1. force cvData.language = "en" (the truth on the ground)
  //   2. translateCV(en → fr) and store result as cvDataAlt
  //   3. set cvLang = "en" so the editor opens on the worked-on language
  //   4. strip the query param so a refresh doesn't re-run the migration
  // Idempotent guard via the URL param removal + ref. Will be removed after
  // Kevin confirms the fix landed.
  useEffect(() => {
    if (fixLangAttempted.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("fix-lang") !== "1") return;
    fixLangAttempted.current = true;

    const store = useStore.getState();
    const cv = store.cvData;
    if (!cv) {
      console.warn("[fix-lang] no cvData in localStorage — nothing to migrate");
      params.delete("fix-lang");
      const next = window.location.pathname + (params.toString() ? `?${params}` : "") + window.location.hash;
      window.history.replaceState({}, "", next);
      return;
    }

    console.log("[fix-lang] migrating — before:", { cvDataLang: cv.language, cvDataAltLang: store.cvDataAlt?.language });
    const englishCv = { ...cv, language: "en" as const };
    store.setCvData(englishCv);
    store.setCvLang("en");

    translateCV(englishCv, "fr")
      .then((fr) => {
        useStore.getState().setCvDataAlt(fr);
        console.log("[fix-lang] done — cvData=en, cvDataAlt=fr");
        // eslint-disable-next-line no-alert
        alert("✓ Fix appliqué : EN dans cvData, FR dans cvDataAlt. Recharge l'éditeur.");
      })
      .catch((err) => {
        console.error("[fix-lang] translation failed", err);
        // eslint-disable-next-line no-alert
        alert("Translation a échoué — cvData est en EN mais cvDataAlt n'a pas été régénéré. Détails dans la console.");
      })
      .finally(() => {
        params.delete("fix-lang");
        const next = window.location.pathname + (params.toString() ? `?${params}` : "") + window.location.hash;
        window.history.replaceState({}, "", next);
      });
  }, []);

  return (
    <BrowserRouter basename="/bored-cv">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/cover-letter" element={<CoverLetter />} />
        <Route path="/v/:slug" element={<SharedView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ConsentBanner />
    </BrowserRouter>
  );
}
