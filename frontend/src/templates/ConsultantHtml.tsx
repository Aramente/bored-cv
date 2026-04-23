import type { CVData } from "../store";
import { useStore } from "../store";
import { Editable, joinContact } from "./EditableCV";

interface Props {
  data: CVData;
  brandColors?: { primary: string; secondary: string } | null;
}

export default function ConsultantHtml({ data, brandColors }: Props) {
  const accentColor = brandColors?.primary || "#111111";
  const updateCvField = useStore((s) => s.updateCvField);
  const pushCvHistory = useStore((s) => s.pushCvHistory);
  const addCvBullet = useStore((s) => s.addCvBullet);
  const removeCvBullet = useStore((s) => s.removeCvBullet);
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
    <div className="cv-sheet consultant-tpl" aria-label="Editable CV preview">
      <div className="cs-top-rule" style={{ borderTopColor: accentColor }} />
      <div className="cs-top-rule-thin" />

      <div className="cs-name-block">
        <Editable as="h1" value={data.name} onSave={(v) => save("name", v)} className="cs-name" placeholder={isFr ? "VOTRE NOM" : "YOUR NAME"} rich={false} />
        <Editable as="p" value={data.title} onSave={(v) => save("title", v)} className="cs-title-line" placeholder={isFr ? "TITRE" : "TITLE"} rich={false} />
        <p className="cs-contact">{joinContact([data.email, data.phone, data.linkedin, data.location])}</p>
      </div>

      <section className="cs-section">
        <div className="cs-section-title">{isFr ? "Formation" : "Education"}</div>
        <div className="cs-rule" style={{ borderBottomColor: accentColor }} />
        {data.education.map((e, i) => (
          <div key={i} className="cs-edu-row" style={{ position: "relative" }}>
            <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvEducation(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
            <div>
              <Editable as="div" value={e.degree} onSave={(v) => save(`education.${i}.degree`, v)} className="cs-edu-degree" placeholder={isFr ? "diplôme" : "degree"} rich={false} />
              <Editable as="div" value={e.school} onSave={(v) => save(`education.${i}.school`, v)} className="cs-edu-school" placeholder={isFr ? "école" : "school"} rich={false} />
            </div>
            <Editable as="span" value={e.year} onSave={(v) => save(`education.${i}.year`, v)} className="cs-edu-meta" placeholder={isFr ? "année" : "year"} rich={false} />
          </div>
        ))}
        <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvEducation(); }}>+ {isFr ? "Ajouter formation" : "Add education"}</button>
      </section>

      <section className="cs-section">
        <div className="cs-section-title">{isFr ? "Compétences" : "Core Competencies"}</div>
        <div className="cs-rule" style={{ borderBottomColor: accentColor }} />
        <Editable
          as="p"
          value={data.skills.join("  ·  ")}
          onSave={(v) => save("skills", v.replace(/\s*·\s*/g, ", "))}
          className="cs-skills"
          placeholder={isFr ? "compétence · compétence..." : "skill · skill..."}
          rich={false}
        />
      </section>

      {data.summary !== undefined && (
        <section className="cs-section">
          <div className="cs-section-title">{isFr ? "Profil" : "Executive Summary"}</div>
          <div className="cs-rule" style={{ borderBottomColor: accentColor }} />
          <Editable as="p" value={data.summary} onSave={(v) => save("summary", v)} className="cs-summary" placeholder={isFr ? "Résumé en 2 phrases" : "Summary in 2 sentences"} />
        </section>
      )}

      <section className="cs-section">
        <div className="cs-section-title">{isFr ? "Expérience Professionnelle" : "Professional Experience"}</div>
        <div className="cs-rule" style={{ borderBottomColor: accentColor }} />
        {data.experiences.map((exp, i) => (
          <div key={i} className="cs-exp-block" style={{ position: "relative" }}>
            <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvExperience(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
            <div className="cs-exp-header">
              <Editable as="span" value={exp.company} onSave={(v) => save(`experiences.${i}.company`, v)} className="cs-exp-company" placeholder={isFr ? "Entreprise" : "Company"} rich={false} />
              <Editable as="span" value={exp.dates} onSave={(v) => save(`experiences.${i}.dates`, v)} className="cs-exp-dates" placeholder="2022 — 2024" rich={false} />
            </div>
            <Editable as="p" value={exp.title} onSave={(v) => save(`experiences.${i}.title`, v)} className="cs-exp-title" placeholder={isFr ? "intitulé" : "job title"} rich={false} />
            <ul className="cv-bullets">
              {exp.bullets.map((b, j) => (
                <li key={j} className="cv-bullet-row">
                  <Editable as="div" value={b} onSave={(v) => save(`experiences.${i}.bullets.${j}`, v)} className="cs-bullet" placeholder={isFr ? "Réalisation avec chiffres" : "Achievement with numbers"} />
                  <button type="button" className="cv-bullet-remove" onClick={() => { pushCvHistory(); removeCvBullet(i, j); }} title={isFr ? "Retirer" : "Remove"}>×</button>
                </li>
              ))}
            </ul>
            <button type="button" className="cv-add-bullet" onClick={() => { pushCvHistory(); addCvBullet(i); }}>+ {isFr ? "Ajouter une puce" : "Add bullet"}</button>
          </div>
        ))}
        <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvExperience(); }}>+ {isFr ? "Ajouter une expérience" : "Add experience"}</button>
      </section>

      <div className="cs-bottom-rule-thin" />
      <div className="cs-bottom-rule" style={{ borderTopColor: accentColor }} />
    </div>
  );
}
