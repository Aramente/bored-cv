import type { CVData } from "../store";
import { useStore } from "../store";
import { BulletRow, BulletsTail, Editable, HeadcountChip, joinContact } from "./EditableCV";
import PhotoSlot from "./PhotoSlot";

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
      <div className="rt-header" style={{ borderColor: accentColor, display: "flex", alignItems: "center", gap: 18 }}>
        <PhotoSlot size={76} tone="light" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Editable as="h1" value={data.name} onSave={(v) => save("name", v)} className="rt-name" placeholder={isFr ? "VOTRE NOM" : "YOUR NAME"} rich={false} />
          <Editable as="p" value={data.title} onSave={(v) => save("title", v)} className="rt-title-line" placeholder={isFr ? "titre" : "title"} rich={false} />
          <p className="rt-contact">{joinContact([data.email, data.phone, data.linkedin, data.location], "  //  ")}</p>
        </div>
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
            <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              <Editable as="p" value={exp.title} onSave={(v) => save(`experiences.${i}.title`, v)} className="rt-exp-title" placeholder={isFr ? "intitulé" : "job title"} rich={false} />
              <Editable as="span" value={exp.contractType || ""} onSave={(v) => save(`experiences.${i}.contractType`, v)} className="cv-meta-chip" placeholder={isFr ? "contrat" : "type"} rich={false} />
              <HeadcountChip start={exp.headcountStart || ""} end={exp.headcountEnd || ""} onSaveStart={(v) => save(`experiences.${i}.headcountStart`, v)} onSaveEnd={(v) => save(`experiences.${i}.headcountEnd`, v)} isFr={isFr} />
            </div>
            <ul className="rt-bullets has-drop-tail">
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
                  bulletClassName="rt-bullet"
                />
              ))}
              <BulletsTail expIndex={i} bulletsLength={exp.bullets.length} />
            </ul>
            <Editable as="p" value={exp.exitReason || ""} onSave={(v) => save(`experiences.${i}.exitReason`, v)} className="cv-meta-line" placeholder={isFr ? "raison du départ (optionnel)" : "reason for leaving (optional)"} rich={false} />
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
