import type { CVData } from "../store";
import { useStore } from "../store";
import { BulletRow, BulletsTail, Editable, HeadcountChip, joinContact } from "./EditableCV";
import PhotoSlot from "./PhotoSlot";

interface Props {
  data: CVData;
  brandColors?: { primary: string; secondary: string } | null;
}

// Mono template — engineering aesthetic. JetBrains Mono for titles, sans for
// body. Code-flavoured headers. Works for eng-heavy startups + corporate tech.
export default function MonoHtml({ data, brandColors }: Props) {
  const accentColor = brandColors?.primary || "#10b981";
  const updateCvField = useStore((s) => s.updateCvField);
  const pushCvHistory = useStore((s) => s.pushCvHistory);
  const addCvBullet = useStore((s) => s.addCvBullet);
  const addCvExperience = useStore((s) => s.addCvExperience);
  const removeCvExperience = useStore((s) => s.removeCvExperience);
  const addCvEducation = useStore((s) => s.addCvEducation);
  const removeCvEducation = useStore((s) => s.removeCvEducation);

  const save = (path: string, v: string) => {
    pushCvHistory();
    updateCvField(path, v);
  };
  const isFr = data.language === "fr";

  return (
    <div className="cv-sheet mono-tpl" aria-label="Editable CV preview">
      <header className="mo-header" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <PhotoSlot size={68} tone="light" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Editable as="h1" value={data.name} onSave={(v) => save("name", v)} className="mo-name" placeholder={isFr ? "Votre nom" : "Your name"} rich={false} />
          <p className="mo-prompt" style={{ color: accentColor }}>
            <span>{"# "}</span>
            <Editable as="span" value={data.title} onSave={(v) => save("title", v)} className="mo-title" placeholder={isFr ? "rôle" : "role"} rich={false} />
          </p>
          <p className="mo-contact">{joinContact([data.location, data.email, data.phone, data.linkedin])}</p>
        </div>
      </header>

      {data.summary !== undefined && (
        <section className="mo-section">
          <div className="mo-section-title" style={{ color: accentColor }}>// {isFr ? "résumé" : "summary"}</div>
          <Editable as="p" value={data.summary} onSave={(v) => save("summary", v)} className="mo-summary" placeholder={isFr ? "Résumé en 2 phrases" : "Summary in 2 sentences"} />
        </section>
      )}

      <section className="mo-section">
        <div className="mo-section-title" style={{ color: accentColor }}>// {isFr ? "expérience" : "experience"}</div>
        {data.experiences.map((exp, i) => (
          <div key={i} className="mo-exp">
            <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvExperience(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
            <div className="mo-exp-head">
              <Editable as="span" value={exp.title} onSave={(v) => save(`experiences.${i}.title`, v)} className="mo-exp-title" placeholder={isFr ? "Intitulé" : "Job title"} rich={false} />
              <span className="mo-at" style={{ color: accentColor }}> @ </span>
              <Editable as="span" value={exp.company} onSave={(v) => save(`experiences.${i}.company`, v)} className="mo-exp-company" placeholder={isFr ? "Entreprise" : "Company"} rich={false} />
              <Editable as="span" value={exp.dates} onSave={(v) => save(`experiences.${i}.dates`, v)} className="mo-exp-dates" placeholder="2022 — 2024" rich={false} />
              <Editable as="span" value={exp.contractType || ""} onSave={(v) => save(`experiences.${i}.contractType`, v)} className="cv-meta-chip" placeholder={isFr ? "contrat" : "type"} rich={false} />
              <HeadcountChip start={exp.headcountStart || ""} end={exp.headcountEnd || ""} onSaveStart={(v) => save(`experiences.${i}.headcountStart`, v)} onSaveEnd={(v) => save(`experiences.${i}.headcountEnd`, v)} isFr={isFr} />
            </div>
            <ul className="cv-bullets mo-bullets has-drop-tail">
              {exp.bullets.map((b, j) => (
                <BulletRow
                  key={j}
                  expIndex={i}
                  bulletIndex={j}
                  value={b}
                  onSave={(v) => save(`experiences.${i}.bullets.${j}`, v)}
                  placeholder={isFr ? "Réalisation avec chiffres" : "Achievement with numbers"}
                  isFr={isFr}
                  contextRole={exp.title}
                  contextCompany={exp.company}
                  bulletClassName="cv-bullet mo-bullet"
                  prefix={<span className="mo-caret" style={{ color: accentColor }}>▸</span>}
                />
              ))}
              <BulletsTail expIndex={i} bulletsLength={exp.bullets.length} />
            </ul>
            <Editable as="p" value={exp.exitReason || ""} onSave={(v) => save(`experiences.${i}.exitReason`, v)} className="cv-meta-line" placeholder={isFr ? "// raison du départ (optionnel)" : "// reason for leaving (optional)"} rich={false} />
            <button type="button" className="cv-add-bullet" onClick={() => { pushCvHistory(); addCvBullet(i); }}>+ {isFr ? "Ajouter une puce" : "Add bullet"}</button>
          </div>
        ))}
        <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvExperience(); }}>+ {isFr ? "Ajouter une expérience" : "Add experience"}</button>
      </section>

      <section className="mo-section">
        <div className="mo-section-title" style={{ color: accentColor }}>// {isFr ? "stack" : "stack"}</div>
        <Editable as="div" value={data.skills.join(" · ")} onSave={(v) => save("skills", v.split("·").map(s => s.trim()).filter(Boolean).join(", "))} className="mo-skills" placeholder={isFr ? "go, python, rust..." : "go, python, rust..."} rich={false} />
      </section>

      <section className="mo-section">
        <div className="mo-section-title" style={{ color: accentColor }}>// {isFr ? "formation" : "education"}</div>
        {data.education.map((e, i) => (
          <div key={i} className="mo-edu">
            <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvEducation(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
            <Editable as="span" value={e.degree} onSave={(v) => save(`education.${i}.degree`, v)} className="mo-edu-degree" placeholder={isFr ? "diplôme" : "degree"} rich={false} />
            <span className="mo-at" style={{ color: accentColor }}> @ </span>
            <Editable as="span" value={e.school} onSave={(v) => save(`education.${i}.school`, v)} className="mo-edu-school" placeholder={isFr ? "école" : "school"} rich={false} />
            <Editable as="span" value={e.year} onSave={(v) => save(`education.${i}.year`, v)} className="mo-edu-year" placeholder={isFr ? "année" : "year"} rich={false} />
          </div>
        ))}
        <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvEducation(); }}>+ {isFr ? "Ajouter formation" : "Add education"}</button>
      </section>
    </div>
  );
}
