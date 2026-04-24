import { useEffect, useRef } from "react";

// Escape HTML special chars for safe innerHTML injection.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render plain text with {GAP: ...} tokens as amber pills, and bold numbers
 * to match the PDF BoldMetrics behavior — so the HTML view matches what the
 * user will see when they export.
 */
export function renderRichText(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(
      /(\{GAP:[^}]+\})/g,
      (match) => `<span class="gap-pill" title="Click to fill in">${match}</span>`,
    )
    .replace(/(?<!class=")(\b\d+[\d,.%kKmMbB+]*\b)/g, "<strong>$1</strong>");
}

type Tag = "span" | "div" | "p" | "h1" | "h2" | "h3" | "li";

/**
 * Editable element backed by the zustand store. The source of truth stays in
 * the store — on blur we diff the DOM text against the store and persist if
 * changed. On re-render we only rewrite innerHTML when the element is NOT
 * focused (so the caret doesn't jump while typing). This is the simplest way
 * to get WYSIWYG editing without a dedicated editor library.
 */
export function Editable({
  value,
  onSave,
  as: TagName = "span",
  className,
  style,
  placeholder,
  rich = true,
}: {
  value: string;
  onSave: (v: string) => void;
  as?: Tag;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  rich?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return; // don't clobber mid-edit
    const rendered = rich ? renderRichText(value || "") : escapeHtml(value || "");
    if (el.innerHTML !== rendered) el.innerHTML = rendered;
  }, [value, rich]);

  const handleBlur = () => {
    const el = ref.current;
    if (!el) return;
    const next = el.textContent || "";
    if (next !== value) onSave(next);
    el.innerHTML = rich ? renderRichText(next) : escapeHtml(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (TagName === "span" && e.key === "Enter") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    }
  };

  const isEmpty = !value || value.trim() === "";
  const Tag = TagName as unknown as React.ElementType;

  return (
    <Tag
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      data-placeholder={placeholder}
      className={`editable ${isEmpty ? "editable-empty" : ""} ${className || ""}`}
      style={style}
    />
  );
}

/**
 * Shared structural helpers — reused across all 5 HTML templates.
 */
export function joinContact(parts: (string | undefined)[], separator = "  ·  "): string {
  return parts.filter(Boolean).join(separator);
}

/**
 * Headcount chip — "120 → 450". Each endpoint is independently editable; the
 * chip itself hides only when both endpoints are empty so the user can still
 * click in to fill either side. Shared across all 10 HTML templates.
 */
export function HeadcountChip({
  start,
  end,
  onSaveStart,
  onSaveEnd,
  isFr,
}: {
  start: string;
  end: string;
  onSaveStart: (v: string) => void;
  onSaveEnd: (v: string) => void;
  isFr: boolean;
}) {
  const hasAny = !!(start || end);
  return (
    <span className="cv-headcount-chip" style={!hasAny ? { opacity: 0.55 } : undefined}>
      <Editable
        as="span"
        value={start || ""}
        onSave={onSaveStart}
        placeholder={isFr ? "effectif" : "size"}
        rich={false}
      />
      <span className="cv-headcount-arrow" aria-hidden>→</span>
      <Editable
        as="span"
        value={end || ""}
        onSave={onSaveEnd}
        placeholder={isFr ? "effectif" : "size"}
        rich={false}
      />
    </span>
  );
}
