import type { CVData } from "../store";
import { useStore } from "../store";
import { BulletRow, BulletsTail, Editable, HeadcountChip, joinContact } from "./EditableCV";
import PhotoSlot from "./PhotoSlot";

interface Props {
  data: CVData;
  brandColors?: { primary: string; secondary: string } | null;
}

export default function MinimalHtml({ data, brandColors }: Props) {
  const accentColor = brandColors?.primary || "#555555";
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
    <div className="cv-sheet minimal-tpl" aria-label="Editable CV preview">
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 4 }}>
        <PhotoSlot size={68} tone="light" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Editable as="h1" value={data.name} onSave={(v) => save("name", v)} className="mn-name" placeholder={isFr ? "Votre nom" : "Your name"} rich={false} />
          <Editable as="p" value={data.title} onSave={(v) => save("title", v)} className="mn-title" placeholder={isFr ? "Votre titre" : "Your title"} rich={false} />
          <p className="mn-contact">{joinContact([data.location, data.email, data.phone, data.linkedin])}</p>
        </div>
      </div>
      <div className="mn-divider" />

      {data.summary !== undefined && (
        <>
          <section className="mn-section">
            <div className="mn-section-title" style={{ color: accentColor }}>{isFr ? "Points clés" : "Key Highlights"}</div>
            <Editable as="p" value={data.summary} onSave={(v) => save("summary", v)} className="mn-summary" placeholder={isFr ? "Résumé en 2 phrases" : "Summary in 2 sentences"} />
          </section>
          <div className="mn-divider" />
        </>
      )}

      <section className="mn-section">
        <div className="mn-section-title" style={{ color: accentColor }}>{isFr ? "Expérience" : "Experience"}</div>
        {data.experiences.map((exp, i) => (
          <div key={i} className="mn-exp-block" style={{ position: "relative" }}>
            <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvExperience(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
            <div className="mn-exp-row">
              <Editable as="span" value={exp.title} onSave={(v) => save(`experiences.${i}.title`, v)} className="mn-exp-title" placeholder={isFr ? "Intitulé" : "Job title"} rich={false} />
              <Editable as="span" value={exp.dates} onSave={(v) => save(`experiences.${i}.dates`, v)} className="mn-exp-dates" placeholder="2022 — 2024" rich={false} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              <Editable as="p" value={exp.company} onSave={(v) => save(`experiences.${i}.company`, v)} className="mn-exp-company" placeholder={isFr ? "Entreprise (contexte)" : "Company (context)"} rich={false} />
              <Editable as="span" value={exp.contractType || ""} onSave={(v) => save(`experiences.${i}.contractType`, v)} className="cv-meta-chip" placeholder={isFr ? "contrat" : "type"} rich={false} />
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
            <Editable as="p" value={exp.exitReason || ""} onSave={(v) => save(`experiences.${i}.exitReason`, v)} className="cv-meta-line" placeholder={isFr ? "raison du départ (optionnel)" : "reason for leaving (optional)"} rich={false} />
            <button type="button" className="cv-add-bullet" onClick={() => { pushCvHistory(); addCvBullet(i); }}>+ {isFr ? "Ajouter une puce" : "Add bullet"}</button>
          </div>
        ))}
        <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvExperience(); }}>+ {isFr ? "Ajouter une expérience" : "Add experience"}</button>
      </section>

      <div className="mn-divider" />

      <section className="mn-section">
        <div className="mn-section-title" style={{ color: accentColor }}>{isFr ? "Formation" : "Education"}</div>
        {data.education.map((e, i) => (
          <div key={i} className="mn-edu-row" style={{ position: "relative" }}>
            <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvEducation(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
            <Editable
              as="span"
              value={`${e.degree}${e.school ? `  —  ${e.school}` : ""}`}
              onSave={(v) => {
                const parts = v.split(/\s+—\s+/);
                save(`education.${i}.degree`, (parts[0] || "").trim());
                if (parts[1]) save(`education.${i}.school`, parts[1].trim());
              }}
              className="mn-edu-line"
              placeholder={isFr ? "diplôme — école" : "degree — school"}
              rich={false}
            />
            <Editable as="span" value={e.year} onSave={(v) => save(`education.${i}.year`, v)} className="mn-edu-year" placeholder={isFr ? "année" : "year"} rich={false} />
          </div>
        ))}
        <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvEducation(); }}>+ {isFr ? "Ajouter formation" : "Add education"}</button>
      </section>

      <div className="mn-divider" />

      <section className="mn-section">
        <div className="mn-section-title" style={{ color: accentColor }}>{isFr ? "Compétences" : "Skills"}</div>
        <Editable
          as="div"
          value={data.skills.join(", ")}
          onSave={(v) => save("skills", v)}
          className="mn-skills"
          placeholder={isFr ? "compétence, compétence..." : "skill, skill..."}
          rich={false}
        />
      </section>
    </div>
  );
}
