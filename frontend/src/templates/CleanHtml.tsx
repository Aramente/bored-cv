import type { CVData } from "../store";
import { useStore } from "../store";
import { Editable, HeadcountChip } from "./EditableCV";
import PhotoSlot from "./PhotoSlot";

interface Props {
  data: CVData;
  brandColors?: { primary: string; secondary: string } | null;
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
    <div className="cv-sheet clean-tpl" aria-label="Editable CV preview">
      <div className="cv-sidebar" style={{ background: sidebarBg }}>
        <div className="cv-sidebar-top-accent" />
        <div style={{ marginBottom: 12 }}>
          <PhotoSlot size={72} tone="dark" />
        </div>
        <Editable as="h1" value={data.name} onSave={(v) => save("name", v)} className="cv-sidebar-name" placeholder={isFr ? "Votre nom" : "Your name"} rich={false} />
        <Editable as="p" value={data.title} onSave={(v) => save("title", v)} className="cv-sidebar-title" placeholder={isFr ? "Votre titre" : "Your title"} rich={false} />

        <div className="cv-sidebar-section">
          <div className="cv-sidebar-section-title">Contact</div>
          <Editable as="p" value={data.email} onSave={(v) => save("email", v)} className="cv-contact" placeholder="email" rich={false} />
          <Editable as="p" value={data.phone} onSave={(v) => save("phone", v)} className="cv-contact" placeholder="phone" rich={false} />
          <Editable as="p" value={data.linkedin} onSave={(v) => save("linkedin", v)} className="cv-contact" placeholder="linkedin" rich={false} />
          <Editable as="p" value={data.location} onSave={(v) => save("location", v)} className="cv-contact" placeholder={isFr ? "ville" : "location"} rich={false} />
        </div>

        <div className="cv-sidebar-section">
          <div className="cv-sidebar-section-title">{isFr ? "Compétences" : "Skills"}</div>
          {/* Single chip-pill display — removed the duplicate comma-text Editable per Kevin's feedback.
              To edit skills from this template, use the chat or settings; inline-chip editing is a
              separate UX task if we want it back. */}
          <div className="cv-skills-preview">
            {data.skills.map((s, i) => <span key={i} className="cv-skill-tag">{s}</span>)}
          </div>
        </div>

        <div className="cv-sidebar-section">
          <div className="cv-sidebar-section-title">{isFr ? "Formation" : "Education"}</div>
          {data.education.map((e, i) => (
            <div key={i} className="cv-edu">
              <Editable as="p" value={e.degree} onSave={(v) => save(`education.${i}.degree`, v)} className="cv-edu-degree" placeholder={isFr ? "diplôme" : "degree"} rich={false} />
              <Editable
                as="p"
                value={`${e.school}${e.year ? `, ${e.year}` : ""}`}
                onSave={(v) => {
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
            <div className="cv-highlights-label" style={{ color: accentColor }}>{isFr ? "Points clés" : "Key Highlights"}</div>
            <Editable as="p" value={data.summary} onSave={(v) => save("summary", v)} className="cv-highlights-text" placeholder={isFr ? "Résumé en 2 phrases" : "Summary in 2 sentences"} />
          </div>
        )}

        <div className="cv-section">
          <div className="cv-section-title">{isFr ? "Expérience" : "Experience"}</div>
          {data.experiences.map((exp, i) => (
            <div key={i} className="cv-exp-block" style={{ borderLeftColor: accentColor }}>
              <button type="button" className="cv-exp-remove" title={isFr ? "Retirer" : "Remove"} onClick={() => { pushCvHistory(); removeCvExperience(i); }}>×</button>
              <Editable as="h3" value={exp.title} onSave={(v) => save(`experiences.${i}.title`, v)} className="cv-exp-title" placeholder={isFr ? "Intitulé" : "Job title"} rich={false} />
              <Editable as="p" value={exp.company} onSave={(v) => save(`experiences.${i}.company`, v)} className="cv-exp-company" style={{ color: accentColor }} placeholder={isFr ? "Entreprise (contexte)" : "Company (context)"} rich={false} />
              <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                <Editable as="p" value={exp.dates} onSave={(v) => save(`experiences.${i}.dates`, v)} className="cv-exp-dates" placeholder="2022 — 2024" rich={false} />
                <Editable as="span" value={exp.contractType || ""} onSave={(v) => save(`experiences.${i}.contractType`, v)} className="cv-meta-chip" placeholder={isFr ? "contrat" : "type"} rich={false} />
                <HeadcountChip start={exp.headcountStart || ""} end={exp.headcountEnd || ""} onSaveStart={(v) => save(`experiences.${i}.headcountStart`, v)} onSaveEnd={(v) => save(`experiences.${i}.headcountEnd`, v)} isFr={isFr} />
              </div>
              <ul className="cv-bullets">
                {exp.bullets.map((b, j) => (
                  <li key={j} className="cv-bullet-row">
                    <Editable as="div" value={b} onSave={(v) => save(`experiences.${i}.bullets.${j}`, v)} className="cv-bullet" placeholder={isFr ? "Réalisation avec chiffres" : "Achievement with numbers"} />
                    <button type="button" className="cv-bullet-remove" onClick={() => { pushCvHistory(); removeCvBullet(i, j); }} title={isFr ? "Retirer" : "Remove"}>×</button>
                  </li>
                ))}
              </ul>
              <Editable as="p" value={exp.exitReason || ""} onSave={(v) => save(`experiences.${i}.exitReason`, v)} className="cv-meta-line" placeholder={isFr ? "raison du départ (optionnel)" : "reason for leaving (optional)"} rich={false} />
              <button type="button" className="cv-add-bullet" onClick={() => { pushCvHistory(); addCvBullet(i); }}>+ {isFr ? "Ajouter une puce" : "Add bullet"}</button>
            </div>
          ))}
          <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvExperience(); }}>+ {isFr ? "Ajouter une expérience" : "Add experience"}</button>
        </div>
      </div>
    </div>
  );
}
