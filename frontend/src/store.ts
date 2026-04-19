import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  phone: string;
  linkedin: string;
  summary: string;
  experiences: Experience[];
  education: Education[];
  skills: string[];
  languages: string[];
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

export interface CvAction {
  action: string;
  target: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: string | Record<string, any>;
  index: number;
}

export interface ChatResponse {
  message: string;
  is_complete: boolean;
  cv_actions: CvAction[];
  progress: number;  // 0-100
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
  phone: string;
  linkedin: string;
  location: string;
  summary: string;
  experiences: RewrittenExperience[];
  education: Education[];
  skills: string[];
  languages: string[];
  language: string;
  match_score: number;
  strengths: string[];
  improvements: string[];
}

export interface CoverLetterData {
  greeting: string;
  opening: string;
  body: string;
  closing: string;
  signature: string;
  language: string;
}

export type TemplateId = "clean" | "contrast" | "minimal" | "retro" | "consultant";

interface AppState {
  profile: Profile | null;
  offer: Offer | null;
  gapAnalysis: GapAnalysis | null;
  messages: ChatMessage[];
  cvData: CVData | null;
  cvOriginal: CVData | null;  // V0 — raw LinkedIn data
  cvDataAlt: CVData | null;
  cvLang: "fr" | "en";
  selectedTemplate: TemplateId;
  tone: string;
  projectId: number | null;
  user: { email: string; provider: string } | null;
  cvHistory: CVData[];
  coverLetterData: CoverLetterData | null;
  brandColors: { primary: string; secondary: string } | null;
  useBrandColors: boolean;
  targetMarket: "france" | "europe" | "us" | "global";
  setCoverLetterData: (cl: CoverLetterData) => void;
  setBrandColors: (colors: { primary: string; secondary: string } | null) => void;
  setUseBrandColors: (use: boolean) => void;
  setTargetMarket: (market: "france" | "europe" | "us" | "global") => void;
  setProfile: (profile: Profile) => void;
  setOffer: (offer: Offer) => void;
  setGapAnalysis: (gap: GapAnalysis) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setProjectId: (id: number | null) => void;
  setCvData: (cv: CVData) => void;
  setCvOriginal: (cv: CVData) => void;
  setCvDataAlt: (cv: CVData) => void;
  setCvLang: (lang: "fr" | "en") => void;
  setSelectedTemplate: (t: TemplateId) => void;
  setTone: (tone: string) => void;
  updateCvField: (path: string, value: string) => void;
  addCvExperience: () => void;
  removeCvExperience: (index: number) => void;
  addCvBullet: (expIndex: number) => void;
  removeCvBullet: (expIndex: number, bulletIndex: number) => void;
  addCvEducation: () => void;
  removeCvEducation: (index: number) => void;
  addCvLanguage: (lang: string) => void;
  removeCvLanguage: (index: number) => void;
  pushCvHistory: () => void;
  undo: () => void;
  lastSaved: string | null;
  setLastSaved: (ts: string) => void;
  setUser: (user: { email: string; provider: string } | null) => void;
  reset: () => void;
}

const initialState = {
  profile: null,
  offer: null,
  gapAnalysis: null,
  messages: [],
  cvData: null,
  cvOriginal: null,
  cvDataAlt: null,
  cvLang: "fr" as "fr" | "en",
  selectedTemplate: "clean" as TemplateId,
  tone: "startup",
  projectId: null,
  user: null,
  cvHistory: [] as CVData[],
  coverLetterData: null,
  targetMarket: "france" as "france" | "europe" | "us" | "global",
  lastSaved: null,
  brandColors: null,
  useBrandColors: true,
};

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v) return [v];
  return [];
}

function sanitizeCv(cv: CVData): CVData {
  return {
    ...cv,
    skills: asArray(cv.skills),
    languages: asArray(cv.languages),
    strengths: asArray(cv.strengths),
    improvements: asArray(cv.improvements),
    experiences: (Array.isArray(cv.experiences) ? cv.experiences : []).map((e) => ({
      ...e,
      bullets: asArray(e.bullets),
    })),
    education: Array.isArray(cv.education) ? cv.education : [],
  };
}

export const useStore = create<AppState>()(persist((set) => ({
  ...initialState,
  setProfile: (profile) => set({ profile }),
  setOffer: (offer) => set({ offer }),
  setGapAnalysis: (gapAnalysis) => set({ gapAnalysis }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (messages) => set({ messages }),
  setProjectId: (projectId) => set({ projectId }),
  setCvData: (cvData) => set({ cvData: sanitizeCv(cvData) }),
  setCvOriginal: (cvOriginal) => set({ cvOriginal: sanitizeCv(cvOriginal) }),
  setCvDataAlt: (cvDataAlt) => set({ cvDataAlt: sanitizeCv(cvDataAlt) }),
  setCvLang: (cvLang) => set({ cvLang }),
  setSelectedTemplate: (selectedTemplate) => set({ selectedTemplate }),
  setTone: (tone) => set({ tone }),
  setLastSaved: (lastSaved) => set({ lastSaved }),
  setCoverLetterData: (coverLetterData) => set({ coverLetterData }),
  setBrandColors: (brandColors) => set({ brandColors }),
  setUseBrandColors: (useBrandColors) => set({ useBrandColors }),
  setTargetMarket: (targetMarket) => set({ targetMarket }),
  setUser: (user) => set({ user }),
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
  addCvExperience: () => set((s) => {
    if (!s.cvData) return s;
    const cv = structuredClone(s.cvData);
    cv.experiences.push({ title: "", company: "", dates: "", bullets: [""] });
    return { cvData: cv };
  }),
  removeCvExperience: (index) => set((s) => {
    if (!s.cvData) return s;
    const cv = structuredClone(s.cvData);
    cv.experiences.splice(index, 1);
    return { cvData: cv };
  }),
  addCvBullet: (expIndex) => set((s) => {
    if (!s.cvData) return s;
    const cv = structuredClone(s.cvData);
    cv.experiences[expIndex]?.bullets.push("");
    return { cvData: cv };
  }),
  removeCvBullet: (expIndex, bulletIndex) => set((s) => {
    if (!s.cvData) return s;
    const cv = structuredClone(s.cvData);
    cv.experiences[expIndex]?.bullets.splice(bulletIndex, 1);
    return { cvData: cv };
  }),
  addCvEducation: () => set((s) => {
    if (!s.cvData) return s;
    const cv = structuredClone(s.cvData);
    cv.education.push({ degree: "", school: "", year: "" });
    return { cvData: cv };
  }),
  removeCvEducation: (index) => set((s) => {
    if (!s.cvData) return s;
    const cv = structuredClone(s.cvData);
    cv.education.splice(index, 1);
    return { cvData: cv };
  }),
  addCvLanguage: (lang) => set((s) => {
    if (!s.cvData) return s;
    const cv = structuredClone(s.cvData);
    cv.languages.push(lang);
    return { cvData: cv };
  }),
  removeCvLanguage: (index) => set((s) => {
    if (!s.cvData) return s;
    const cv = structuredClone(s.cvData);
    cv.languages.splice(index, 1);
    return { cvData: cv };
  }),
  pushCvHistory: () => set((s) => {
    if (!s.cvData) return s;
    const history = [...s.cvHistory, structuredClone(s.cvData)].slice(-20);
    return { cvHistory: history };
  }),
  undo: () => set((s) => {
    if (s.cvHistory.length === 0) return s;
    const prev = s.cvHistory[s.cvHistory.length - 1];
    return {
      cvData: sanitizeCv(structuredClone(prev)),
      cvHistory: s.cvHistory.slice(0, -1),
    };
  }),
  reset: () => set(initialState),
}), {
  name: "bored-cv-session",
  partialize: (state) => ({
    profile: state.profile,
    offer: state.offer,
    gapAnalysis: state.gapAnalysis,
    messages: state.messages,
    cvData: state.cvData,
    selectedTemplate: state.selectedTemplate,
    tone: state.tone,
    // user is intentionally excluded — session is server-side
    // cvHistory is intentionally excluded — too large for localStorage
  }),
  merge: (persisted, current) => {
    const p = persisted as Partial<AppState> | undefined;
    const merged = { ...current, ...p };
    if (merged.cvData) merged.cvData = sanitizeCv(merged.cvData);
    return merged;
  },
}));
