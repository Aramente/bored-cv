import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Upload from "./pages/Upload";
import Chat from "./pages/Chat";
import Templates from "./pages/Templates";
import Editor from "./pages/Editor";
import Projects from "./pages/Projects";
import CoverLetter from "./pages/CoverLetter";
import SharedView from "./pages/SharedView";
import ConsentBanner from "./components/ConsentBanner";
import { useStore } from "./store";

export default function App() {
  const { i18n } = useTranslation();
  const setCvLang = useStore((s) => s.setCvLang);

  // Keep CV preview language tied to UI language. Without this, a user with
  // an English browser still saw a French-defaulted cvLang, and toggling the
  // UI did nothing to the CV chrome (section titles, placeholders, buttons).
  // Manual FR/EN chips in the editor still override until the user touches
  // the global UI toggle again.
  useEffect(() => {
    setCvLang(i18n.language.startsWith("fr") ? "fr" : "en");
  }, [i18n.language, setCvLang]);

  return (
    <BrowserRouter basename="/bored-cv">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
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
