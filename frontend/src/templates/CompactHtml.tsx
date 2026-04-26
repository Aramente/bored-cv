import type { CVData } from "../store";
import { useStore } from "../store";
import { BulletRow, BulletsTail, ContractTypeSelect, Editable, HeadcountChip, joinContact } from "./EditableCV";
import PhotoSlot from "./PhotoSlot";

interface Props {
  data: CVData;
  brandColors?: { primary: string; secondary: string } | null;
}

// Compact template — dense 2-col grid, max content per page.
// For mid-senior folks with a lot to fit. Tight type, sharp rules.
export default function CompactHtml({ data, brandColors }: Props) {
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
    <div className="cv-sheet compact-tpl" aria-label="Editable CV preview">
      <header className="co-header" style={{ borderBottomColor: accentColor, display: "flex", alignItems: "center", gap: 14 }}>
        <PhotoSlot size={60} tone="light" />
        <div className="co-header-left" style={{ flex: 1, minWidth: 0 }}>
          <Editable as="h1" value={data.name} onSave={(v) => save("name", v)} className="co-name" placeholder={isFr ? "Votre nom" : "Your name"} rich={false} />
          <Editable as="p" value={data.title} onSave={(v) => save("title", v)} className="co-title" placeholder={isFr ? "Votre titre" : "Your title"} rich={false} />
        </div>
        <p className="co-contact">{joinContact([data.location, data.email, data.phone, data.linkedin])}</p>
      </header>

      {data.summary !== undefined && (
        <section className="co-summary">
          <Editable as="p" value={data.summary} onSave={(v) => save("summary", v)} className="co-summary-text" placeholder={isFr ? "Résumé en 2 phrases" : "Summary in 2 sentences"} />
        </section>
      )}

      <div className="co-grid">
        <div className="co-main">
          <section className="co-section">
            <h2 className="co-section-title" style={{ color: accentColor }}>{isFr ? "Expérience" : "Experience"}</h2>
            {data.experiences.map((exp, i) => (
              <div key={i} className="co-exp">
                <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvExperience(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
                <div className="co-exp-head">
                  <Editable as="span" value={exp.title} onSave={(v) => save(`experiences.${i}.title`, v)} className="co-exp-title" placeholder={isFr ? "Intitulé" : "Job title"} rich={false} />
                  <Editable as="span" value={exp.dates} onSave={(v) => save(`experiences.${i}.dates`, v)} className="co-exp-dates" placeholder="2022 — 2024" rich={false} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                  <Editable as="p" value={exp.company} onSave={(v) => save(`experiences.${i}.company`, v)} className="co-exp-company" style={{ color: accentColor }} placeholder={isFr ? "Entreprise (contexte)" : "Company (context)"} rich={false} />
                  <ContractTypeSelect value={exp.contractType || ""} onSave={(v) => save(`experiences.${i}.contractType`, v)} isFr={isFr} />
                  <HeadcountChip start={exp.headcountStart || ""} end={exp.headcountEnd || ""} onSaveStart={(v) => save(`experiences.${i}.headcountStart`, v)} onSaveEnd={(v) => save(`experiences.${i}.headcountEnd`, v)} isFr={isFr} />
                </div>
                <ul className="cv-bullets co-bullets has-drop-tail">
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
                      bulletClassName="cv-bullet co-bullet"
                    />
                  ))}
                  <BulletsTail expIndex={i} bulletsLength={exp.bullets.length} />
                </ul>
                <Editable as="p" value={exp.exitReason || ""} onSave={(v) => save(`experiences.${i}.exitReason`, v)} className="cv-meta-line" placeholder={isFr ? "Pourquoi j'ai quitté ce poste (optionnel — aide à expliquer une transition)" : "Why I left this role (optional — helps explain a transition)"} rich={false} />
                <button type="button" className="cv-add-bullet" onClick={() => { pushCvHistory(); addCvBullet(i); }}>+ {isFr ? "Ajouter une puce" : "Add bullet"}</button>
              </div>
            ))}
            <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvExperience(); }}>+ {isFr ? "Ajouter une expérience" : "Add experience"}</button>
          </section>
        </div>

        <aside className="co-aside">
          <section className="co-section">
            <h2 className="co-section-title" style={{ color: accentColor }}>{isFr ? "Compétences" : "Skills"}</h2>
            <Editable as="div" value={data.skills.join(", ")} onSave={(v) => save("skills", v)} className="co-skills" placeholder={isFr ? "compétence, compétence..." : "skill, skill..."} rich={false} />
          </section>

          <section className="co-section">
            <h2 className="co-section-title" style={{ color: accentColor }}>{isFr ? "Formation" : "Education"}</h2>
            {data.education.map((e, i) => (
              <div key={i} className="co-edu">
                <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvEducation(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
                <Editable as="p" value={e.degree} onSave={(v) => save(`education.${i}.degree`, v)} className="co-edu-degree" placeholder={isFr ? "diplôme" : "degree"} rich={false} />
                <Editable as="p" value={`${e.school}${e.year ? `, ${e.year}` : ""}`}
                  onSave={(v) => {
                    const m = v.match(/^(.*?)(?:,\s*([^,]+))?$/);
                    save(`education.${i}.school`, (m?.[1] || v).trim());
                    if (m?.[2]) save(`education.${i}.year`, m[2].trim());
                  }}
                  className="co-edu-school" placeholder={isFr ? "école, année" : "school, year"} rich={false} />
              </div>
            ))}
            <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvEducation(); }}>+ {isFr ? "Ajouter formation" : "Add education"}</button>
          </section>
        </aside>
      </div>
    </div>
  );
}
