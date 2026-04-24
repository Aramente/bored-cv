import type { CVData } from "../store";
import { useStore } from "../store";
import { Editable, joinContact } from "./EditableCV";
import PhotoSlot from "./PhotoSlot";

interface Props {
  data: CVData;
  brandColors?: { primary: string; secondary: string } | null;
}

// Executive template — large name, wide margins, navy/gold palette.
// Reads as senior whether the target is startup CEO or corporate VP.
export default function ExecutiveHtml({ data, brandColors }: Props) {
  const accentColor = brandColors?.primary || "#1e293b";
  const goldAccent = brandColors?.secondary || "#b8860b";
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
    <div className="cv-sheet executive-tpl" aria-label="Editable CV preview">
      <header className="ex-header" style={{ borderBottomColor: goldAccent, display: "flex", alignItems: "center", gap: 22 }}>
        <PhotoSlot size={88} tone="light" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Editable as="h1" value={data.name} onSave={(v) => save("name", v)} className="ex-name" style={{ color: accentColor }} placeholder={isFr ? "Votre nom" : "Your name"} rich={false} />
          <Editable as="p" value={data.title} onSave={(v) => save("title", v)} className="ex-title" placeholder={isFr ? "Votre titre" : "Your title"} rich={false} />
          <p className="ex-contact">{joinContact([data.location, data.email, data.phone, data.linkedin])}</p>
        </div>
      </header>

      {data.summary !== undefined && (
        <section className="ex-section">
          <Editable as="p" value={data.summary} onSave={(v) => save("summary", v)} className="ex-summary" placeholder={isFr ? "Résumé exécutif" : "Executive summary"} />
        </section>
      )}

      <section className="ex-section">
        <h2 className="ex-section-title" style={{ color: accentColor }}>
          <span className="ex-ornament" style={{ background: goldAccent }} />
          {isFr ? "Expérience professionnelle" : "Professional Experience"}
        </h2>
        {data.experiences.map((exp, i) => (
          <div key={i} className="ex-exp">
            <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvExperience(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
            <div className="ex-exp-head">
              <div>
                <Editable as="h3" value={exp.title} onSave={(v) => save(`experiences.${i}.title`, v)} className="ex-exp-title" style={{ color: accentColor }} placeholder={isFr ? "Intitulé" : "Job title"} rich={false} />
                <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                  <Editable as="p" value={exp.company} onSave={(v) => save(`experiences.${i}.company`, v)} className="ex-exp-company" placeholder={isFr ? "Entreprise (contexte)" : "Company (context)"} rich={false} />
                  <Editable as="span" value={exp.contractType || ""} onSave={(v) => save(`experiences.${i}.contractType`, v)} className="cv-meta-chip" placeholder={isFr ? "contrat" : "type"} rich={false} />
                </div>
              </div>
              <Editable as="span" value={exp.dates} onSave={(v) => save(`experiences.${i}.dates`, v)} className="ex-exp-dates" placeholder="2022 — 2024" rich={false} />
            </div>
            <ul className="cv-bullets ex-bullets">
              {exp.bullets.map((b, j) => (
                <li key={j} className="cv-bullet-row">
                  <Editable as="div" value={b} onSave={(v) => save(`experiences.${i}.bullets.${j}`, v)} className="cv-bullet ex-bullet" placeholder={isFr ? "Réalisation avec chiffres" : "Achievement with numbers"} />
                  <button type="button" className="cv-bullet-remove" onClick={() => { pushCvHistory(); removeCvBullet(i, j); }} title={isFr ? "Retirer" : "Remove"}>×</button>
                </li>
              ))}
            </ul>
            <Editable as="p" value={exp.exitReason || ""} onSave={(v) => save(`experiences.${i}.exitReason`, v)} className="cv-meta-line" placeholder={isFr ? "raison du départ (optionnel)" : "reason for leaving (optional)"} rich={false} />
            <button type="button" className="cv-add-bullet" onClick={() => { pushCvHistory(); addCvBullet(i); }}>+ {isFr ? "Ajouter une puce" : "Add bullet"}</button>
          </div>
        ))}
        <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvExperience(); }}>+ {isFr ? "Ajouter une expérience" : "Add experience"}</button>
      </section>

      <div className="ex-split">
        <section className="ex-section">
          <h2 className="ex-section-title" style={{ color: accentColor }}>
            <span className="ex-ornament" style={{ background: goldAccent }} />
            {isFr ? "Formation" : "Education"}
          </h2>
          {data.education.map((e, i) => (
            <div key={i} className="ex-edu">
              <button type="button" className="cv-exp-remove" onClick={() => { pushCvHistory(); removeCvEducation(i); }} title={isFr ? "Retirer" : "Remove"}>×</button>
              <Editable as="p" value={e.degree} onSave={(v) => save(`education.${i}.degree`, v)} className="ex-edu-degree" placeholder={isFr ? "diplôme" : "degree"} rich={false} />
              <Editable as="p" value={`${e.school}${e.year ? `, ${e.year}` : ""}`}
                onSave={(v) => {
                  const m = v.match(/^(.*?)(?:,\s*([^,]+))?$/);
                  save(`education.${i}.school`, (m?.[1] || v).trim());
                  if (m?.[2]) save(`education.${i}.year`, m[2].trim());
                }}
                className="ex-edu-school" placeholder={isFr ? "école, année" : "school, year"} rich={false} />
            </div>
          ))}
          <button type="button" className="cv-add-exp" onClick={() => { pushCvHistory(); addCvEducation(); }}>+ {isFr ? "Ajouter formation" : "Add education"}</button>
        </section>

        <section className="ex-section">
          <h2 className="ex-section-title" style={{ color: accentColor }}>
            <span className="ex-ornament" style={{ background: goldAccent }} />
            {isFr ? "Expertise" : "Expertise"}
          </h2>
          <Editable as="div" value={data.skills.join(" · ")} onSave={(v) => save("skills", v.replace(/·/g, ",").split(",").map(s => s.trim()).filter(Boolean).join(", "))} className="ex-skills" placeholder={isFr ? "domaine · domaine..." : "area · area..."} rich={false} />
        </section>
      </div>
    </div>
  );
}
