import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

const sizeStyle: Record<Size, React.CSSProperties> = {
  sm: { padding: "6px 14px", fontSize: 12 },
  md: {},
  lg: { padding: "14px 28px", fontSize: 16 },
};

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  loading,
  disabled,
  style,
  children,
  className,
  ...rest
}: Props) {
  const base = variant === "ghost" ? "" : `btn-${variant}`;
  const cls = [base, className].filter(Boolean).join(" ");
  const finalStyle: React.CSSProperties = {
    ...sizeStyle[size],
    ...(fullWidth ? { width: "100%" } : {}),
    ...style,
  };
  return (
    <button className={cls} disabled={disabled || loading} style={finalStyle} {...rest}>
      {loading ? <span className="spinner" /> : children}
    </button>
  );
}
