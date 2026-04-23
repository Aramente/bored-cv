import { useEffect, useRef } from "react";
import type { CVData } from "../store";
import { useStore } from "../store";

interface Props {
  data: CVData;
  brandColors?: { primary: string; secondary: string } | null;
}

// Escape HTML special chars for safe innerHTML injection.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Render plain text with {GAP: ...} tokens as amber pills, and bold numbers
// to match the PDF BoldMetrics behavior — so the HTML view matches what the
// user will see when they export.
function renderRichText(text: string): string {
  const escaped = escapeHtml(text);
  // Split into GAP tokens vs plain runs, then bold numbers in plain runs.
  return escaped.replace(
    /(\{GAP:[^}]+\})/g,
    (match) => `<span class="gap-pill" title="Click to fill in">${match}</span>`,
  ).replace(
    /(?<!class=")(\b\d+[\d,.%kKmMbB+]*\b)/g,
    '<strong>$1</strong>',
  );
}

/**
 * Editable element backed by the zustand store. The source of truth stays in
 * the store — on blur we diff the DOM text against the store and persist if
 * changed. On re-render we only rewrite innerHTML when the element is NOT
 * focused (so the caret doesn't jump while typing). This is the simplest way
 * to get WYSIWYG editing without a dedicated editor library.
 */
function Editable({
  value,
  onSave,
  as: Tag = "span",
  className,
  style,
  placeholder,
  rich = true,
}: {
  value: string;
  onSave: (v: string) => void;
  as?: "span" | "div" | "p" | "h1" | "h2" | "h3";
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
    // Re-render with rich formatting after edit committed
    el.innerHTML = rich ? renderRichText(next) : escapeHtml(next);
  };

  // Keep Enter from creating <div>/<br> chaos. For single-line spans, prevent
  // line breaks entirely; for multi-line (summary, bullets) allow them.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (Tag === "span" && e.key === "Enter") {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    }
  };

  const isEmpty = !value || value.trim() === "";

  return (
    <Tag
      // @ts-expect-error — dynamic tag, ref shape aligns
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

export default function CleanHtml({ data, brandColors }: Props) {
  const accentColor = brandColors?.primary || "#6366f1";
  const sidebarBg = brandColors?.secondary || "#0c1f3d";
  const updateCvField = useStore((s) => s.updateCvField);
  const pushCvHistory = useStore((s) => s.pushCvHistory);
  const addCvBullet = useStore((s) => s.addCvBullet);
  const removeCvBullet = useStore((s) => s.removeCvBullet);
  const addCvExperience = useStore((s) => s.addCvExperience);
  const removeCvExperience = useStore((s) => s.removeCvExperience);

  const save = (path: string, v: string) => {
    pushCvHistory();
    updateCvField(path, v);
  };

  const isFr = data.language === "fr";

  return (
    <div className="cv-sheet" aria-label="Editable CV preview">
      <div className="cv-sidebar" style={{ background: sidebarBg }}>
        <div className="cv-sidebar-top-accent" />
        <Editable
          as="h1"
          value={data.name}
          onSave={(v) => save("name", v)}
          className="cv-sidebar-name"
          placeholder={isFr ? "Votre nom" : "Your name"}
          rich={false}
        />
        <Editable
          as="p"
          value={data.title}
          onSave={(v) => save("title", v)}
          className="cv-sidebar-title"
          placeholder={isFr ? "Votre titre" : "Your title"}
          rich={false}
        />

        <div className="cv-sidebar-section">
          <div className="cv-sidebar-section-title">Contact</div>
          <Editable
            as="p"
            value={data.email}
            onSave={(v) => save("email", v)}
            className="cv-contact"
            placeholder="email"
            rich={false}
          />
          <Editable
            as="p"
            value={data.phone}
            onSave={(v) => save("phone", v)}
            className="cv-contact"
            placeholder="phone"
            rich={false}
          />
          <Editable
            as="p"
            value={data.linkedin}
            onSave={(v) => save("linkedin", v)}
            className="cv-contact"
            placeholder="linkedin"
            rich={false}
          />
          <Editable
            as="p"
            value={data.location}
            onSave={(v) => save("location", v)}
            className="cv-contact"
            placeholder={isFr ? "ville" : "location"}
            rich={false}
          />
        </div>

        <div className="cv-sidebar-section">
          <div className="cv-sidebar-section-title">{isFr ? "Compétences" : "Skills"}</div>
          <Editable
            as="div"
            value={data.skills.join(", ")}
            onSave={(v) => save("skills", v)}
            className="cv-skills"
            placeholder={isFr ? "compétence, compétence..." : "skill, skill..."}
            rich={false}
          />
          <div className="cv-skills-preview">
            {data.skills.map((s, i) => (
              <span key={i} className="cv-skill-tag">{s}</span>
            ))}
          </div>
        </div>

        <div className="cv-sidebar-section">
          <div className="cv-sidebar-section-title">{isFr ? "Formation" : "Education"}</div>
          {data.education.map((e, i) => (
            <div key={i} className="cv-edu">
              <Editable
                as="p"
                value={e.degree}
                onSave={(v) => save(`education.${i}.degree`, v)}
                className="cv-edu-degree"
                placeholder={isFr ? "diplôme" : "degree"}
                rich={false}
              />
              <Editable
                as="p"
                value={`${e.school}${e.year ? `, ${e.year}` : ""}`}
                onSave={(v) => {
                  // split on last comma for year
                  const m = v.match(/^(.*?)(?:,\s*([^,]+))?$/);
                  save(`education.${i}.school`, (m?.[1] || v).trim());
                  if (m?.[2]) save(`education.${i}.year`, m[2].trim());
                }}
                className="cv-edu-school"
                placeholder={isFr ? "école, année" : "school, year"}
                rich={false}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="cv-main">
        {data.summary !== undefined && (
          <div className="cv-highlights" style={{ borderLeftColor: accentColor }}>
            <div className="cv-highlights-label" style={{ color: accentColor }}>
              {isFr ? "Points clés" : "Key Highlights"}
            </div>
            <Editable
              as="p"
              value={data.summary}
              onSave={(v) => save("summary", v)}
              className="cv-highlights-text"
              placeholder={isFr ? "Résumé en 2 phrases" : "Summary in 2 sentences"}
            />
          </div>
        )}

        <div className="cv-section">
          <div className="cv-section-title">{isFr ? "Expérience" : "Experience"}</div>
          {data.experiences.map((exp, i) => (
            <div key={i} className="cv-exp-block" style={{ borderLeftColor: accentColor }}>
              <button
                type="button"
                className="cv-exp-remove"
                title={isFr ? "Retirer cette expérience" : "Remove this experience"}
                onClick={() => { pushCvHistory(); removeCvExperience(i); }}
              >×</button>
              <Editable
                as="h3"
                value={exp.title}
                onSave={(v) => save(`experiences.${i}.title`, v)}
                className="cv-exp-title"
                placeholder={isFr ? "Intitulé" : "Job title"}
                rich={false}
              />
              <Editable
                as="p"
                value={exp.company}
                onSave={(v) => save(`experiences.${i}.company`, v)}
                className="cv-exp-company"
                style={{ color: accentColor }}
                placeholder={isFr ? "Entreprise (secteur, stade, taille)" : "Company (sector, stage, headcount)"}
                rich={false}
              />
              <Editable
                as="p"
                value={exp.dates}
                onSave={(v) => save(`experiences.${i}.dates`, v)}
                className="cv-exp-dates"
                placeholder="2022 — 2024"
                rich={false}
              />
              <ul className="cv-bullets">
                {exp.bullets.map((b, j) => (
                  <li key={j} className="cv-bullet-row">
                    <Editable
                      as="div"
                      value={b}
                      onSave={(v) => save(`experiences.${i}.bullets.${j}`, v)}
                      className="cv-bullet"
                      placeholder={isFr ? "Réalisation avec chiffres" : "Achievement with numbers"}
                    />
                    <button
                      type="button"
                      className="cv-bullet-remove"
                      onClick={() => { pushCvHistory(); removeCvBullet(i, j); }}
                      title={isFr ? "Retirer" : "Remove"}
                    >×</button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="cv-add-bullet"
                onClick={() => { pushCvHistory(); addCvBullet(i); }}
              >
                + {isFr ? "Ajouter une puce" : "Add bullet"}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="cv-add-exp"
            onClick={() => { pushCvHistory(); addCvExperience(); }}
          >
            + {isFr ? "Ajouter une expérience" : "Add experience"}
          </button>
        </div>
      </div>
    </div>
  );
}
