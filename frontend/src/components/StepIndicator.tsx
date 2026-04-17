import { useTranslation } from "react-i18next";

const steps = [
  { key: "upload", path: "/upload" },
  { key: "chat", path: "/chat" },
  { key: "templates", path: "/templates" },
  { key: "editor", path: "/editor" },
];

export default function StepIndicator({ current }: { current: string }) {
  const { t } = useTranslation();
  return (
    <div className="step-indicator">
      {steps.map((s, i) => (
        <div key={s.key} className={`step-dot ${s.key === current ? "active" : i < steps.findIndex(x => x.key === current) ? "done" : ""}`}>
          <span className="step-dot-num">{i + 1}</span>
          <span className="step-dot-label">{t(`steps.${s.key}`)}</span>
        </div>
      ))}
    </div>
  );
}
