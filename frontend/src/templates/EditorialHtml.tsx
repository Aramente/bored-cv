import type { CVData } from "../store";
import { useStore } from "../store";
import { BulletRow, BulletsTail, ContractTypeSelect, Editable, HeadcountChip, joinContact } from "./EditableCV";
import PhotoSlot from "./PhotoSlot";

interface Props {
  data: CVData;
  brandColors?: { primary: string; secondary: string } | null;
}

// Editorial template — magazine-style serif headers with a pull quote.
// Summary reads as a feature lede. Works for product/design/marketing roles.
export default function EditorialHtml({ data, brandColors }: Props) {
  const accentColor = brandColors?.primary || "#7c3aed";
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
    <div className="cv-sheet editorial-tpl" aria-label="Editable CV preview">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-eyebrow" style={{ color: accentColor }}>{isFr ? "Portfolio" : "Curriculum"}</div>
          <Editable as="h1" value={data.name} onSave={(v) => save("name", v)} className="ed-name" placeholder={isFr ? "Votre nom" : "Your name"} rich={false} />
          <Editable as="p" value={data.title} onSave={(v) => save("title", v)} className="ed-title" placeholder={isFr ? "Votre titre" : "Your title"} rich={false} />
        </div>
        <PhotoSlot size={80} tone="light" style={{ marginTop: 8 }} />
      </div>

      {data.summary !== undefined && (
        <section className="ed-lede">
          <Editable as="p" value={data.summary} onSave={(v) => save("summary", v)} className="ed-lede-text" placeholder={isFr ? "L'accroche — en 2 phrases" : "The hook — in 2 sentences"} />
        </section>
      )}

      <p className="ed-contact">{joinContact([data.location, data.email, data.phone, data.linkedin])}</p>

      <section className="ed-section">
        <h2 className="ed-section-title">{isFr ? "Expériences" : "Experiences"}</h2>
        {data.experiences.map((exp, i) => (
          <article key={i} className="ed-exp">
            <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvExperience(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
            <Editable as="h3" value={exp.title} onSave={(v) => save(`experiences.${i}.title`, v)} className="ed-exp-title" placeholder={isFr ? "Intitulé" : "Job title"} rich={false} />
            <div className="ed-exp-meta">
              <Editable as="span" value={exp.dates} onSave={(v) => save(`experiences.${i}.dates`, v)} className="ed-exp-dates" style={{ color: accentColor }} placeholder="2022 — 2024" rich={false} />
              <Editable as="span" value={exp.company} onSave={(v) => save(`experiences.${i}.company`, v)} className="ed-exp-company" placeholder={isFr ? "Entreprise (contexte)" : "Company (context)"} rich={false} />
              <ContractTypeSelect value={exp.contractType || ""} onSave={(v) => save(`experiences.${i}.contractType`, v)} isFr={isFr} />
              <HeadcountChip start={exp.headcountStart || ""} end={exp.headcountEnd || ""} onSaveStart={(v) => save(`experiences.${i}.headcountStart`, v)} onSaveEnd={(v) => save(`experiences.${i}.headcountEnd`, v)} isFr={isFr} />
            </div>
            <ul className="cv-bullets ed-bullets has-drop-tail">
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
                  bulletClassName="cv-bullet ed-bullet"
                />
              ))}
              <BulletsTail expIndex={i} bulletsLength={exp.bullets.length} />
            </ul>
            <Editable as="p" value={exp.exitReason || ""} onSave={(v) => save(`experiences.${i}.exitReason`, v)} className="cv-meta-line" placeholder={isFr ? "Pourquoi j'ai quitté ce poste (optionnel — aide à expliquer une transition)" : "Why I left this role (optional — helps explain a transition)"} rich={false} />
            <button type="button" className="cv-add-bullet" onClick={() => { pushCvHistory(); addCvBullet(i); }}>+ {isFr ? "Ajouter une puce" : "Add bullet"}</button>
          </article>
        ))}
        <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvExperience(); }}>+ {isFr ? "Ajouter une expérience" : "Add experience"}</button>
      </section>

      <div className="ed-split">
        <section className="ed-section">
          <h2 className="ed-section-title">{isFr ? "Formation" : "Education"}</h2>
          {data.education.map((e, i) => (
            <div key={i} className="ed-edu">
              <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvEducation(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
              <Editable as="p" value={e.degree} onSave={(v) => save(`education.${i}.degree`, v)} className="ed-edu-degree" placeholder={isFr ? "diplôme" : "degree"} rich={false} />
              <Editable as="p" value={`${e.school}${e.year ? `, ${e.year}` : ""}`}
                onSave={(v) => {
                  const m = v.match(/^(.*?)(?:,\s*([^,]+))?$/);
                  save(`education.${i}.school`, (m?.[1] || v).trim());
                  if (m?.[2]) save(`education.${i}.year`, m[2].trim());
                }}
                className="ed-edu-school" placeholder={isFr ? "école, année" : "school, year"} rich={false} />
            </div>
          ))}
          <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvEducation(); }}>+ {isFr ? "Ajouter formation" : "Add education"}</button>
        </section>

        <section className="ed-section">
          <h2 className="ed-section-title">{isFr ? "Outils & savoirs" : "Toolkit"}</h2>
          <Editable as="div" value={data.skills.join(", ")} onSave={(v) => save("skills", v)} className="ed-skills" placeholder={isFr ? "compétence, compétence..." : "skill, skill..."} rich={false} />
        </section>
      </div>
    </div>
  );
}
