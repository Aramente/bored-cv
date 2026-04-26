import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  role: "assistant" | "user";
  content: string;
}

// Only allow safe link schemes inside assistant markdown. The default
// react-markdown allowlist already covers most cases, but we want a tight
// belt-and-braces in case the LLM emits a `javascript:` or `data:` URL —
// those are dropped to an empty href so the link is rendered inert.
const SAFE_URL_SCHEMES = /^(https?:|mailto:|#|\/)/i;
function safeUrl(url: string): string {
  if (!url) return "";
  return SAFE_URL_SCHEMES.test(url) ? url : "";
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
              urlTransform={safeUrl}
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
