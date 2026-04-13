import { create } from "zustand";

export interface Experience {
  title: string;
  company: string;
  dates: string;
  description: string;
  bullets: string[];
}

export interface Education {
  degree: string;
  school: string;
  year: string;
}

export interface Profile {
  name: string;
  title: string;
  location: string;
  email: string;
  summary: string;
  experiences: Experience[];
  education: Education[];
  skills: string[];
}

export interface OfferRequirement {
  text: string;
  category: string;
}

export interface Offer {
  title: string;
  company: string;
  location: string;
  description: string;
  requirements: OfferRequirement[];
  nice_to_have: OfferRequirement[];
}

export interface GapAnalysis {
  matched_skills: string[];
  gaps: string[];
  questions: string[];
}

export interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

export interface ChatResponse {
  message: string;
  is_complete: boolean;
}

export interface RewrittenExperience {
  title: string;
  company: string;
  dates: string;
  bullets: string[];
}

export interface CVData {
  name: string;
  title: string;
  email: string;
  location: string;
  summary: string;
  experiences: RewrittenExperience[];
  education: Education[];
  skills: string[];
  language: string;
}

export type TemplateId = "clean" | "contrast" | "minimal";
export type Step = "landing" | "upload" | "chat" | "templates" | "editor";

interface AppState {
  step: Step;
  profile: Profile | null;
  offer: Offer | null;
  gapAnalysis: GapAnalysis | null;
  messages: ChatMessage[];
  cvData: CVData | null;
  selectedTemplate: TemplateId;
  setStep: (step: Step) => void;
  setProfile: (profile: Profile) => void;
  setOffer: (offer: Offer) => void;
  setGapAnalysis: (gap: GapAnalysis) => void;
  addMessage: (msg: ChatMessage) => void;
  setCvData: (cv: CVData) => void;
  setSelectedTemplate: (t: TemplateId) => void;
  updateCvField: (path: string, value: string) => void;
  reset: () => void;
}

const initialState = {
  step: "landing" as Step,
  profile: null,
  offer: null,
  gapAnalysis: null,
  messages: [],
  cvData: null,
  selectedTemplate: "clean" as TemplateId,
};

export const useStore = create<AppState>((set) => ({
  ...initialState,
  setStep: (step) => set({ step }),
  setProfile: (profile) => set({ profile }),
  setOffer: (offer) => set({ offer }),
  setGapAnalysis: (gapAnalysis) => set({ gapAnalysis }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setCvData: (cvData) => set({ cvData }),
  setSelectedTemplate: (selectedTemplate) => set({ selectedTemplate }),
  updateCvField: (path, value) =>
    set((s) => {
      if (!s.cvData) return s;
      const cv = structuredClone(s.cvData);
      if (path === "skills") {
        cv.skills = value.split(",").map((s: string) => s.trim()).filter(Boolean);
        return { cvData: cv };
      }
      const keys = path.split(".");
      let obj: Record<string, unknown> = cv as unknown as Record<string, unknown>;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        const next = obj[key];
        if (Array.isArray(next) && /^\d+$/.test(keys[i + 1])) {
          obj = next[parseInt(keys[i + 1])] as Record<string, unknown>;
          i++;
        } else {
          obj = next as Record<string, unknown>;
        }
      }
      obj[keys[keys.length - 1]] = value;
      return { cvData: cv };
    }),
  reset: () => set(initialState),
}));
