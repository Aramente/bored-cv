import { useStore } from "./store";
import Landing from "./pages/Landing";
import Upload from "./pages/Upload";
import Chat from "./pages/Chat";
import Templates from "./pages/Templates";
import Editor from "./pages/Editor";

export default function App() {
  const step = useStore((s) => s.step);

  switch (step) {
    case "landing":
      return <Landing />;
    case "upload":
      return <Upload />;
    case "chat":
      return <Chat />;
    case "templates":
      return <Templates />;
    case "editor":
      return <Editor />;
  }
}
