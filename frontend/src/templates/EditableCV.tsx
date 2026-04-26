import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { improveBullet as improveBulletApi } from "../services/api";

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

/* ────────────────────────────────────────────────────────────────────────────
 * Bullet drag-and-drop — native HTML5 DnD shared across all 10 templates.
 *
 * We use a module-level "current drag" object instead of dataTransfer so we
 * can carry typed payload through React without the browser's string-only
 * transfer plumbing. dataTransfer is still touched on dragstart/dragover so
 * the cursor renders the correct drop-allowed icon.
 * ──────────────────────────────────────────────────────────────────────────── */

interface BulletDragState {
  fromExp: number;
  fromIdx: number;
}
let currentBulletDrag: BulletDragState | null = null;

/**
 * BulletRow — used by every HTML template to render one editable bullet with
 * its drag handle, "improve with AI" button, and remove button. Centralized so
 * the 10 templates only carry the per-template `<ul>` wrapping and bullet
 * styling, not the interaction logic.
 */
export function BulletRow({
  expIndex,
  bulletIndex,
  value,
  onSave,
  placeholder,
  isFr,
  contextRole,
  contextCompany,
  bulletClassName,
  prefix,
}: {
  expIndex: number;
  bulletIndex: number;
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  isFr: boolean;
  contextRole?: string;
  contextCompany?: string;
  /** Full className for the inner bullet element. Defaults to "cv-bullet". Pass
   *  template-specific classes (e.g. "cs-bullet" or "cv-bullet co-bullet") to
   *  preserve per-template typography — the base "cv-bullet" is NOT auto-added
   *  because some templates (consultant) use only their own bullet class. */
  bulletClassName?: string;
  /** Optional node rendered before the Editable — used by templates that have
   *  a custom bullet glyph (e.g. Mono's "▸" caret in the accent color). */
  prefix?: React.ReactNode;
}) {
  const moveCvBullet = useStore((s) => s.moveCvBullet);
  const removeCvBullet = useStore((s) => s.removeCvBullet);
  const replaceCvBullet = useStore((s) => s.replaceCvBullet);
  const pushCvHistory = useStore((s) => s.pushCvHistory);
  const offer = useStore((s) => s.offer);
  const cvLang = useStore((s) => s.cvLang);
  const tone = useStore((s) => s.tone);

  const [improving, setImproving] = useState(false);
  // dragOver: "before" places the dragged bullet above this row, "after" below.
  // Using a single state covers both cases without two refs.
  const [dragOver, setDragOver] = useState<"before" | "after" | null>(null);
  // We toggle the row's draggable attr on so contentEditable typing isn't
  // hijacked. Only the drag handle's onMouseDown enables it.
  const [isDraggable, setIsDraggable] = useState(false);
  const [isBeingDragged, setIsBeingDragged] = useState(false);

  const handleImprove = async () => {
    const text = (value || "").trim();
    if (!text || improving) return;
    setImproving(true);
    try {
      const next = await improveBulletApi(
        text,
        contextRole || "",
        contextCompany || "",
        offer?.title || "",
        cvLang || "en",
        tone || "startup",
        "",
      );
      const cleaned = (next || "").trim();
      if (cleaned && cleaned !== text) {
        pushCvHistory();
        replaceCvBullet(expIndex, bulletIndex, cleaned);
      }
    } catch (e) {
      console.error("improve bullet failed", e);
    } finally {
      setImproving(false);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    currentBulletDrag = { fromExp: expIndex, fromIdx: bulletIndex };
    e.dataTransfer.effectAllowed = "move";
    // dataTransfer needs *some* string payload for Firefox to actually start the drag.
    try { e.dataTransfer.setData("text/plain", `bullet:${expIndex}:${bulletIndex}`); } catch { /* noop */ }
    setIsBeingDragged(true);
  };

  const handleDragEnd = () => {
    currentBulletDrag = null;
    setIsBeingDragged(false);
    setIsDraggable(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!currentBulletDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Decide before/after based on cursor position within the row.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    setDragOver(e.clientY < midpoint ? "before" : "after");
  };

  const handleDragLeave = () => setDragOver(null);

  const handleDrop = (e: React.DragEvent) => {
    if (!currentBulletDrag) return;
    e.preventDefault();
    e.stopPropagation();
    const { fromExp, fromIdx } = currentBulletDrag;
    const where = dragOver;
    const toIdx = where === "after" ? bulletIndex + 1 : bulletIndex;
    setDragOver(null);
    if (fromExp === expIndex && (fromIdx === bulletIndex || fromIdx === toIdx - 1)) {
      // Dropped exactly where it was — no-op, but still clean up the drag state.
      return;
    }
    pushCvHistory();
    moveCvBullet(fromExp, fromIdx, expIndex, toIdx);
    currentBulletDrag = null;
  };

  const dragClass = [
    "cv-bullet-row",
    isBeingDragged ? "is-dragging" : "",
    dragOver === "before" ? "drop-before" : "",
    dragOver === "after" ? "drop-after" : "",
  ].filter(Boolean).join(" ");

  return (
    <li
      className={dragClass}
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        type="button"
        className="cv-bullet-drag"
        title={isFr ? "Réorganiser" : "Reorder"}
        aria-label={isFr ? "Réorganiser cette puce" : "Reorder this bullet"}
        onMouseDown={() => setIsDraggable(true)}
        onMouseUp={() => setIsDraggable(false)}
        // Touch + mouseleave fallbacks so the row never gets stuck draggable.
        onTouchStart={() => setIsDraggable(true)}
        onTouchEnd={() => setIsDraggable(false)}
        onMouseLeave={() => { if (!isBeingDragged) setIsDraggable(false); }}
      >
        ⋮⋮
      </button>
      {prefix}
      <Editable
        as="div"
        value={value}
        onSave={onSave}
        className={bulletClassName || "cv-bullet"}
        placeholder={placeholder}
      />
      <button
        type="button"
        className={`cv-bullet-improve${improving ? " is-loading" : ""}`}
        title={improving ? (isFr ? "Réécriture…" : "Rewriting…") : (isFr ? "Améliorer avec l'IA" : "Improve with AI")}
        aria-label={isFr ? "Améliorer cette puce avec l'IA" : "Improve this bullet with AI"}
        onClick={handleImprove}
        disabled={improving}
      >
        ✨
      </button>
      <button
        type="button"
        className="cv-bullet-remove"
        title={isFr ? "Retirer" : "Remove"}
        onClick={() => { pushCvHistory(); removeCvBullet(expIndex, bulletIndex); }}
      >
        ×
      </button>
    </li>
  );
}

/**
 * BulletsTail — invisible drop target rendered at the end of every bullet list
 * so users can drop a bullet *after* the last item. Without this you can drop
 * "before" the first item but never "after" the last when reordering across
 * lists.
 */
export function BulletsTail({ expIndex, bulletsLength }: { expIndex: number; bulletsLength: number }) {
  const moveCvBullet = useStore((s) => s.moveCvBullet);
  const pushCvHistory = useStore((s) => s.pushCvHistory);
  const [over, setOver] = useState(false);

  const onDragOver = (e: React.DragEvent) => {
    if (!currentBulletDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOver(true);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!currentBulletDrag) return;
    e.preventDefault();
    e.stopPropagation();
    const { fromExp, fromIdx } = currentBulletDrag;
    setOver(false);
    if (fromExp === expIndex && fromIdx === bulletsLength - 1) {
      currentBulletDrag = null;
      return;
    }
    pushCvHistory();
    moveCvBullet(fromExp, fromIdx, expIndex, bulletsLength);
    currentBulletDrag = null;
  };

  return (
    <li
      className={`cv-bullets-tail${over ? " drop-target" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      aria-hidden
    />
  );
}

/**
 * Headcount chip — "120 people → 450 people". Each endpoint is independently
 * editable; the chip itself hides only when both endpoints are empty so the
 * user can still click in to fill either side. Shared across all 10 HTML
 * templates. Tooltip + clearer placeholder so it's self-explanatory without
 * having to remember what "size → size" meant.
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
  const tooltip = isFr
    ? "Effectif de l'entreprise quand tu es arrivé → quand tu es parti (ou aujourd'hui). Ex. 12 → 45."
    : "Company size when you joined → when you left (or now). E.g. 12 → 45.";
  return (
    <span className="cv-headcount-chip" title={tooltip} style={!hasAny ? { opacity: 0.55 } : undefined}>
      <span className="cv-headcount-label" aria-hidden>{isFr ? "effectif " : "size "}</span>
      <Editable
        as="span"
        value={start || ""}
        onSave={onSaveStart}
        placeholder={isFr ? "à l'arrivée" : "when joined"}
        rich={false}
      />
      <span className="cv-headcount-arrow" aria-hidden>→</span>
      <Editable
        as="span"
        value={end || ""}
        onSave={onSaveEnd}
        placeholder={isFr ? "au départ" : "when left"}
        rich={false}
      />
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Contract type — dropdown (was a free-text chip). Bilingual options. Renders
 * as a styled <select> matching the existing meta-chip aesthetic so it slots
 * into every template without per-template CSS work.
 *
 * Accepts an existing free-text value from legacy CVs: it's shown as the
 * current selection even if it doesn't match an option exactly.
 * ──────────────────────────────────────────────────────────────────────────── */

const CONTRACT_OPTIONS_EN = [
  { value: "", label: "Contract type" }, // placeholder option
  { value: "Permanent", label: "Permanent" },
  { value: "Founder", label: "Founder" },
  { value: "Freelance", label: "Freelance" },
  { value: "Contract", label: "Contract" },
  { value: "Internship", label: "Internship" },
  { value: "Apprenticeship", label: "Apprenticeship" },
  { value: "Part-time", label: "Part-time" },
];

const CONTRACT_OPTIONS_FR = [
  { value: "", label: "Type de contrat" },
  { value: "CDI", label: "CDI" },
  { value: "Fondateur", label: "Fondateur" },
  { value: "Freelance", label: "Freelance" },
  { value: "CDD", label: "CDD" },
  { value: "Stage", label: "Stage" },
  { value: "Alternance", label: "Alternance" },
  { value: "Temps partiel", label: "Temps partiel" },
];

export function ContractTypeSelect({
  value,
  onSave,
  isFr,
}: {
  value: string;
  onSave: (v: string) => void;
  isFr: boolean;
}) {
  const options = isFr ? CONTRACT_OPTIONS_FR : CONTRACT_OPTIONS_EN;
  const known = options.some((o) => o.value === value);
  const tooltip = isFr
    ? "Type de contrat — utilisé par l'audit final et masqué sur le CV exporté si vide."
    : "Contract type — used by the final audit, hidden on the exported CV when empty.";
  return (
    <select
      className={`cv-meta-chip cv-contract-select${value ? "" : " is-empty"}`}
      value={known ? value : ""}
      onChange={(e) => onSave(e.target.value)}
      title={tooltip}
      aria-label={isFr ? "Type de contrat" : "Contract type"}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {/* If the legacy value isn't in the dropdown, still surface it so we
          don't silently drop user data. */}
      {!known && value ? <option value={value}>{value}</option> : null}
    </select>
  );
}
