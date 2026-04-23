import type { CVData } from "../store";
import { useStore } from "../store";
import { Editable, joinContact } from "./EditableCV";

interface Props {
  data: CVData;
  brandColors?: { primary: string; secondary: string } | null;
}

export default function ContrastHtml({ data, brandColors }: Props) {
  const accentColor = brandColors?.primary || "#6366f1";
  const headerBg = brandColors?.secondary || "#0f172a";
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
    <div className="cv-sheet contrast-tpl" aria-label="Editable CV preview">
      <div className="ct-header" style={{ background: headerBg }}>
        <Editable as="h1" value={data.name} onSave={(v) => save("name", v)} className="ct-name" placeholder={isFr ? "Votre nom" : "Your name"} rich={false} />
        <Editable as="p" value={data.title} onSave={(v) => save("title", v)} className="ct-title" style={{ color: accentColor }} placeholder={isFr ? "Votre titre" : "Your title"} rich={false} />
        <p className="ct-contact">{joinContact([data.location, data.email, data.phone, data.linkedin])}</p>
      </div>

      <div className="ct-skills-bar">
        {data.skills.map((s, i) => (
          <span key={i} className="ct-skill-pill" style={{ background: accentColor }}>{s}</span>
        ))}
        <Editable
          as="div"
          value={data.skills.join(", ")}
          onSave={(v) => save("skills", v)}
          className="ct-skills-editor"
          placeholder={isFr ? "compétence, compétence..." : "skill, skill..."}
          rich={false}
        />
      </div>

      {data.summary !== undefined && (
        <div className="ct-highlights" style={{ borderLeftColor: accentColor }}>
          <div className="ct-highlights-label" style={{ color: accentColor }}>{isFr ? "Points clés" : "Key Highlights"}</div>
          <Editable as="p" value={data.summary} onSave={(v) => save("summary", v)} className="ct-highlights-text" placeholder={isFr ? "Résumé en 2 phrases" : "Summary in 2 sentences"} />
        </div>
      )}

      <div className="ct-body">
        <section className="ct-section">
          <h2 className="ct-section-title" style={{ borderBottomColor: accentColor }}>{isFr ? "Expérience" : "Experience"}</h2>
          {data.experiences.map((exp, i) => (
            <div key={i} className="ct-exp-block">
              <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvExperience(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
              <Editable as="h3" value={exp.title} onSave={(v) => save(`experiences.${i}.title`, v)} className="ct-exp-title" placeholder={isFr ? "Intitulé" : "Job title"} rich={false} />
              <div className="ct-exp-meta">
                <Editable as="span" value={exp.company} onSave={(v) => save(`experiences.${i}.company`, v)} className="ct-exp-company" style={{ color: accentColor }} placeholder={isFr ? "Entreprise (contexte)" : "Company (context)"} rich={false} />
                <Editable as="span" value={exp.dates} onSave={(v) => save(`experiences.${i}.dates`, v)} className="ct-exp-dates" placeholder="2022 — 2024" rich={false} />
              </div>
              <ul className="cv-bullets">
                {exp.bullets.map((b, j) => (
                  <li key={j} className="cv-bullet-row">
                    <Editable as="div" value={b} onSave={(v) => save(`experiences.${i}.bullets.${j}`, v)} className="cv-bullet" placeholder={isFr ? "Réalisation avec chiffres" : "Achievement with numbers"} />
                    <button type="button" className="cv-bullet-remove" onClick={() => { pushCvHistory(); removeCvBullet(i, j); }} title={isFr ? "Retirer" : "Remove"}>×</button>
                  </li>
                ))}
              </ul>
              <button type="button" className="cv-add-bullet" onClick={() => { pushCvHistory(); addCvBullet(i); }}>+ {isFr ? "Ajouter une puce" : "Add bullet"}</button>
            </div>
          ))}
          <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvExperience(); }}>+ {isFr ? "Ajouter une expérience" : "Add experience"}</button>
        </section>

        <section className="ct-section">
          <h2 className="ct-section-title" style={{ borderBottomColor: accentColor }}>{isFr ? "Formation" : "Education"}</h2>
          {data.education.map((e, i) => (
            <div key={i} className="ct-edu" style={{ position: "relative" }}>
              <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvEducation(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
              <Editable as="div" value={e.degree} onSave={(v) => save(`education.${i}.degree`, v)} className="ct-edu-degree" placeholder={isFr ? "diplôme" : "degree"} rich={false} />
              <Editable
                as="div"
                value={`${e.school}${e.year ? `, ${e.year}` : ""}`}
                onSave={(v) => {
                  const m = v.match(/^(.*?)(?:,\s*([^,]+))?$/);
                  save(`education.${i}.school`, (m?.[1] || v).trim());
                  if (m?.[2]) save(`education.${i}.year`, m[2].trim());
                }}
                className="ct-edu-school"
                placeholder={isFr ? "école, année" : "school, year"}
                rich={false}
              />
            </div>
          ))}
          <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvEducation(); }}>+ {isFr ? "Ajouter formation" : "Add education"}</button>
        </section>
      </div>
    </div>
  );
}
