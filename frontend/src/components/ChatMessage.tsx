import { useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  role: "assistant" | "user";
  content: string;
  // Optional: when true, the message is a brief-driven pushback (challenge
  // on a generic/underselling/evasive answer). Renders a small "challenged"
  // chip so the user understands they're being deliberately pressed, not
  // glitching out.
  isPushback?: boolean;
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

export default function ChatMessage({ role, content, isPushback }: Props) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

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
      <div
        className={`chat-bubble${isPushback ? " chat-bubble--pushback" : ""}`}
        onClick={handleCopy}
        title="Click to copy"
      >
        {isPushback && (
          <span
            className="pushback-chip"
            style={{
              display: "inline-block",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "2px 6px",
              marginBottom: 6,
              borderRadius: 4,
              background: "var(--accent, #f97316)",
              color: "white",
            }}
          >
            {t("chat.pushback_chip")}
          </span>
        )}
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
