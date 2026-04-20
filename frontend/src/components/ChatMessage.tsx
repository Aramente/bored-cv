import { useState } from "react";

interface Props {
  role: "assistant" | "user";
  content: string;
}

export default function ChatMessage({ role, content }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={`chat-msg ${role}`}>
      <div className="chat-bubble" onClick={handleCopy} title="Click to copy">
        {content}
        {copied && <span className="copied-badge">Copied</span>}
      </div>
    </div>
  );
}
