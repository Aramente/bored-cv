import type { CVData } from "../store";
import { useStore } from "../store";
import { BulletRow, BulletsTail, ContractTypeSelect, Editable, HeadcountChip, joinContact } from "./EditableCV";
import PhotoSlot from "./PhotoSlot";

interface Props {
  data: CVData;
  brandColors?: { primary: string; secondary: string } | null;
}

// Timeline template — left vertical rail with dots, narrative career flow.
// Works for both startup (with warm accent) and corporate (with navy accent).
export default function TimelineHtml({ data, brandColors }: Props) {
  const accentColor = brandColors?.primary || "#0f172a";
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
    <div className="cv-sheet timeline-tpl" aria-label="Editable CV preview">
      <header className="tl-header" style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <PhotoSlot size={76} tone="light" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Editable as="h1" value={data.name} onSave={(v) => save("name", v)} className="tl-name" placeholder={isFr ? "Votre nom" : "Your name"} rich={false} />
          <Editable as="p" value={data.title} onSave={(v) => save("title", v)} className="tl-title" placeholder={isFr ? "Votre titre" : "Your title"} rich={false} />
          <p className="tl-contact">{joinContact([data.location, data.email, data.phone, data.linkedin])}</p>
        </div>
      </header>

      {data.summary !== undefined && (
        <section className="tl-summary" style={{ borderLeftColor: accentColor }}>
          <Editable as="p" value={data.summary} onSave={(v) => save("summary", v)} className="tl-summary-text" placeholder={isFr ? "Résumé en 2 phrases" : "Summary in 2 sentences"} />
        </section>
      )}

      <section className="tl-section">
        <div className="tl-section-title" style={{ color: accentColor }}>{isFr ? "Parcours" : "Career"}</div>
        <div className="tl-rail" style={{ borderLeftColor: accentColor }}>
          {data.experiences.map((exp, i) => (
            <div key={i} className="tl-exp">
              <span className="tl-dot" style={{ background: accentColor }} />
              <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvExperience(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
              <Editable as="p" value={exp.dates} onSave={(v) => save(`experiences.${i}.dates`, v)} className="tl-exp-dates" placeholder="2022 — 2024" rich={false} />
              <Editable as="h3" value={exp.title} onSave={(v) => save(`experiences.${i}.title`, v)} className="tl-exp-title" placeholder={isFr ? "Intitulé" : "Job title"} rich={false} />
              <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                <Editable as="p" value={exp.company} onSave={(v) => save(`experiences.${i}.company`, v)} className="tl-exp-company" style={{ color: accentColor }} placeholder={isFr ? "Entreprise (contexte)" : "Company (context)"} rich={false} />
                <ContractTypeSelect value={exp.contractType || ""} onSave={(v) => save(`experiences.${i}.contractType`, v)} isFr={isFr} />
                <HeadcountChip start={exp.headcountStart || ""} end={exp.headcountEnd || ""} onSaveStart={(v) => save(`experiences.${i}.headcountStart`, v)} onSaveEnd={(v) => save(`experiences.${i}.headcountEnd`, v)} isFr={isFr} />
              </div>
              <ul className="cv-bullets has-drop-tail">
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
                  />
                ))}
                <BulletsTail expIndex={i} bulletsLength={exp.bullets.length} />
              </ul>
              <Editable as="p" value={exp.exitReason || ""} onSave={(v) => save(`experiences.${i}.exitReason`, v)} className="cv-meta-line" placeholder={isFr ? "Pourquoi j'ai quitté ce poste (optionnel — aide à expliquer une transition)" : "Why I left this role (optional — helps explain a transition)"} rich={false} />
              <button type="button" className="cv-add-bullet" onClick={() => { pushCvHistory(); addCvBullet(i); }}>+ {isFr ? "Ajouter une puce" : "Add bullet"}</button>
            </div>
          ))}
          <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvExperience(); }}>+ {isFr ? "Ajouter une expérience" : "Add experience"}</button>
        </div>
      </section>

      <div className="tl-split">
        <section className="tl-section">
          <div className="tl-section-title" style={{ color: accentColor }}>{isFr ? "Formation" : "Education"}</div>
          {data.education.map((e, i) => (
            <div key={i} className="tl-edu">
              <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvEducation(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
              <Editable as="p" value={e.degree} onSave={(v) => save(`education.${i}.degree`, v)} className="tl-edu-degree" placeholder={isFr ? "diplôme" : "degree"} rich={false} />
              <Editable as="p" value={`${e.school}${e.year ? `, ${e.year}` : ""}`}
                onSave={(v) => {
                  const m = v.match(/^(.*?)(?:,\s*([^,]+))?$/);
                  save(`education.${i}.school`, (m?.[1] || v).trim());
                  if (m?.[2]) save(`education.${i}.year`, m[2].trim());
                }}
                className="tl-edu-school" placeholder={isFr ? "école, année" : "school, year"} rich={false} />
            </div>
          ))}
          <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvEducation(); }}>+ {isFr ? "Ajouter formation" : "Add education"}</button>
        </section>

        <section className="tl-section">
          <div className="tl-section-title" style={{ color: accentColor }}>{isFr ? "Compétences" : "Skills"}</div>
          <Editable as="div" value={data.skills.join(", ")} onSave={(v) => save("skills", v)} className="tl-skills" placeholder={isFr ? "compétence, compétence..." : "skill, skill..."} rich={false} />
        </section>
      </div>
    </div>
  );
}
