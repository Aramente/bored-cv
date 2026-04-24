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

export default function App() {
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
