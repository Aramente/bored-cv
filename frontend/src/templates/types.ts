import type { CVData } from "../store";

export interface TemplateProps {
  data: CVData;
  brandColors?: { primary: string; secondary: string } | null;
}
