import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  role: "assistant" | "user";
  content: string;
}

export default function ChatMessage({ role, content }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    // Don't copy when clicking a link inside markdown
    if ((e.target as HTMLElement).closest("a")) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={`chat-msg ${role}`}>
      <div className="chat-bubble" onClick={handleCopy} title="Click to copy">
        {role === "assistant" ? (
          <div className="md-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          content
        )}
        {copied && <span className="copied-badge">Copied</span>}
      </div>
    </div>
  );
}
