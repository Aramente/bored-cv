import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import AuthButton from "./AuthButton";
import LanguageToggle from "./LanguageToggle";

interface Props {
  /** Optional middle slot — typically StepIndicator or a read-only badge. */
  center?: ReactNode;
  /** Extra controls before AuthButton/LanguageToggle (e.g. a Back button). */
  extra?: ReactNode;
  /** Hide the default Auth + Language controls (e.g. for SharedView). */
  minimal?: boolean;
  /** Disable the logo-click-to-home (landing page). */
  staticLogo?: boolean;
}

export default function TopNav({ center, extra, minimal, staticLogo }: Props) {
  const navigate = useNavigate();
  return (
    <nav className="nav">
      <span
        className="logo"
        onClick={staticLogo ? undefined : () => navigate("/")}
        style={{ cursor: staticLogo ? "default" : "pointer" }}
      >
        bored cv
      </span>
      {center}
      {!minimal && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {extra}
          <AuthButton />
          <LanguageToggle />
        </div>
      )}
      {minimal && extra && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{extra}</div>
      )}
    </nav>
  );
}
