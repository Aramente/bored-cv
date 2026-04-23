import type { CVData } from "../store";
import { useStore } from "../store";
import { Editable, joinContact } from "./EditableCV";

interface Props {
  data: CVData;
  brandColors?: { primary: string; secondary: string } | null;
}

export default function RetroHtml({ data, brandColors }: Props) {
  const accentColor = brandColors?.primary || "#2c2415";
  const accentLight = brandColors?.secondary || "#8a7050";
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
    <div className="cv-sheet retro-tpl" aria-label="Editable CV preview">
      <div className="rt-header" style={{ borderColor: accentColor }}>
        <Editable as="h1" value={data.name} onSave={(v) => save("name", v)} className="rt-name" placeholder={isFr ? "VOTRE NOM" : "YOUR NAME"} rich={false} />
        <Editable as="p" value={data.title} onSave={(v) => save("title", v)} className="rt-title-line" placeholder={isFr ? "titre" : "title"} rich={false} />
        <p className="rt-contact">{joinContact([data.email, data.phone, data.linkedin, data.location], "  //  ")}</p>
      </div>

      {data.summary !== undefined && (
        <section className="rt-section">
          <div className="rt-section-title">{isFr ? "PROFIL" : "PROFILE"}</div>
          <div className="rt-divider" style={{ borderBottomColor: accentColor }} />
          <div className="rt-divider-thin" style={{ borderBottomColor: accentLight }} />
          <Editable as="p" value={data.summary} onSave={(v) => save("summary", v)} className="rt-summary" style={{ borderLeftColor: accentLight }} placeholder={isFr ? "Résumé en 2 phrases" : "Summary in 2 sentences"} />
        </section>
      )}

      <section className="rt-section">
        <div className="rt-section-title">{isFr ? "EXPÉRIENCE" : "EXPERIENCE"}</div>
        <div className="rt-divider" style={{ borderBottomColor: accentColor }} />
        <div className="rt-divider-thin" style={{ borderBottomColor: accentLight }} />
        {data.experiences.map((exp, i) => (
          <div key={i} className="rt-exp-block" style={{ position: "relative" }}>
            <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvExperience(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
            <div className="rt-exp-header">
              <Editable as="span" value={exp.company} onSave={(v) => save(`experiences.${i}.company`, v)} className="rt-exp-company" placeholder={isFr ? "Entreprise" : "Company"} rich={false} />
              <Editable as="span" value={exp.dates} onSave={(v) => save(`experiences.${i}.dates`, v)} className="rt-exp-dates" placeholder="2022 — 2024" rich={false} />
            </div>
            <Editable as="p" value={exp.title} onSave={(v) => save(`experiences.${i}.title`, v)} className="rt-exp-title" placeholder={isFr ? "intitulé" : "job title"} rich={false} />
            <ul className="rt-bullets">
              {exp.bullets.map((b, j) => (
                <li key={j} className="cv-bullet-row">
                  <Editable as="div" value={b} onSave={(v) => save(`experiences.${i}.bullets.${j}`, v)} className="rt-bullet" placeholder={isFr ? "Réalisation avec chiffres" : "Achievement with numbers"} />
                  <button type="button" className="cv-bullet-remove" onClick={() => { pushCvHistory(); removeCvBullet(i, j); }} title={isFr ? "Retirer" : "Remove"}>×</button>
                </li>
              ))}
            </ul>
            <button type="button" className="cv-add-bullet" onClick={() => { pushCvHistory(); addCvBullet(i); }}>+ {isFr ? "Ajouter une puce" : "Add bullet"}</button>
          </div>
        ))}
        <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvExperience(); }}>+ {isFr ? "Ajouter une expérience" : "Add experience"}</button>
      </section>

      <section className="rt-section">
        <div className="rt-section-title">{isFr ? "FORMATION" : "EDUCATION"}</div>
        <div className="rt-divider" style={{ borderBottomColor: accentColor }} />
        <div className="rt-divider-thin" style={{ borderBottomColor: accentLight }} />
        {data.education.map((e, i) => (
          <div key={i} className="rt-edu-row" style={{ position: "relative" }}>
            <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvEducation(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
            <Editable as="span" value={e.degree} onSave={(v) => save(`education.${i}.degree`, v)} className="rt-edu-degree" placeholder={isFr ? "diplôme" : "degree"} rich={false} />
            <Editable
              as="span"
              value={`${e.school}${e.year ? `  [${e.year}]` : ""}`}
              onSave={(v) => {
                const m = v.match(/^(.*?)(?:\s*\[([^\]]+)\])?$/);
                save(`education.${i}.school`, (m?.[1] || v).trim());
                if (m?.[2]) save(`education.${i}.year`, m[2].trim());
              }}
              className="rt-edu-meta"
              placeholder={isFr ? "école [année]" : "school [year]"}
              rich={false}
            />
          </div>
        ))}
        <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvEducation(); }}>+ {isFr ? "Ajouter formation" : "Add education"}</button>
      </section>

      <section className="rt-section">
        <div className="rt-section-title">{isFr ? "COMPÉTENCES" : "SKILLS"}</div>
        <div className="rt-divider" style={{ borderBottomColor: accentColor }} />
        <div className="rt-divider-thin" style={{ borderBottomColor: accentLight }} />
        <Editable
          as="p"
          value={data.skills.join(", ")}
          onSave={(v) => save("skills", v)}
          className="rt-skills"
          placeholder={isFr ? "compétence, compétence..." : "skill, skill..."}
          rich={false}
        />
      </section>
    </div>
  );
}
