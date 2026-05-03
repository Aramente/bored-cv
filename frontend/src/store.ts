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
  // Optional: assistant-only marker that this turn is a pushback (verdict-
  // routed challenge to a generic/underselling/evasive answer). Frontend
  // renders a small "challenged" chip when true. Backend uses it for
  // deterministic slot tracking (no substring heuristic).
  is_pushback?: boolean;
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
  is_pushback?: boolean;
}

// Agent Brief — drives the recruiter+agent chat. Generated once after
// /api/analyze, persisted on the session, included in every /api/chat call.
// Replaces theme-ranking as the chat's organizing principle.
export interface StrongestExistingMatch {
  experienceIndex: number;
  why: string;
  currentlyUndersoldAs: string;
  shouldBePitchedAs: string;
}

export interface UndersellingItem {
  location: string;
  currentText: string;
  whyUndersold: string;
  agentRewriteSeed: string;
}

export interface WeakestClaim {
  location: string;
  text: string;
  whyWeak: string;
  needs: string;
}

export interface UnspokenEvidence {
  experienceIndex: number;
  hypothesis: string;
  questionSeed: string;
}

export interface BriefQuestion {
  angle: string;
  question: string;
}

export interface AgentBrief {
  thePitch: string;
  theBet: string;
  marketRead: string;
  hiringManagerFear: string;
  strongestExistingMatch: StrongestExistingMatch;
  underselling: UndersellingItem[];
  weakestClaim: WeakestClaim;
  unspokenEvidenceToProbe: UnspokenEvidence[];
  irrelevantExperiences: number[];
  clichesToKillInAnswers: string[];
  the3Questions: BriefQuestion[];
}

export interface CompanyContext {
  sector: string;
  stage: string;
  headcount_start: string;
  headcount_end: string;
  team_size: string;
}

// Common contract types — used as placeholder hints, not a hard enum. The
// field stores free text so users can type whatever fits (e.g. "Apprentice",
// "CDI", "Stage alterné") without fighting a dropdown.
export const CONTRACT_TYPE_HINTS = [
  "Permanent",
  "Freelance",
  "Founder",
  "Contract",
  "Internship",
  "Part-time",
] as const;

export interface RewrittenExperience {
  title: string;
  company: string;
  dates: string;
  bullets: string[];
  context?: CompanyContext;
  // Optional metadata surfaced on the CV. `contractType` renders as a small
  // badge next to the dates; `exitReason` renders as a muted italic subline.
  // `headcountStart` / `headcountEnd` render as a growth chip "120 → 450"
  // next to the contract type. All four are hidden when empty — they don't
  // exist on legacy rewrites.
  contractType?: string;
  exitReason?: string;
  headcountStart?: string;
  headcountEnd?: string;
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
  // Optional profile photo as a base64 data URL. Stored client-side in
  // localStorage — we resize to 400px max / JPEG q=0.85 on upload so it
  // stays ~50-80KB and doesn't blow the persist quota.
  photo?: string;
}

export interface CoverLetterData {
  greeting: string;
  opening: string;
  body: string;
  closing: string;
  signature: string;
  language: string;
}

export type TemplateId =
  | "clean" | "contrast" | "minimal" | "retro" | "consultant"
  | "timeline" | "mono" | "executive" | "editorial" | "compact";

interface AppState {
  profile: Profile | null;
  offer: Offer | null;
  gapAnalysis: GapAnalysis | null;
  agentBrief: AgentBrief | null;
  messages: ChatMessage[];
  cvData: CVData | null;
  cvOriginal: CVData | null;  // V0 — raw LinkedIn data
  cvDataAlt: CVData | null;
  cvLang: "fr" | "en";
  selectedTemplate: TemplateId;
  tone: string;
  toneChosen: boolean;  // true once the user has picked a voice in the in-chat picker
  projectId: number | null;
  user: { email: string; provider: string } | null;
  cvHistory: CVData[];
  // Last finalized CV, preserved across `reset()` so a user creating a second
  // project can start from their previous content instead of re-uploading
  // LinkedIn. Populated when a user downloads a PDF (that's our "I'm done"
  // signal) and offered as a reuse option on the Upload page.
  savedCvLibrary: CVData | null;
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
  setAgentBrief: (brief: AgentBrief | null) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setProjectId: (id: number | null) => void;
  setCvData: (cv: CVData) => void;
  setCvOriginal: (cv: CVData) => void;
  setCvDataAlt: (cv: CVData) => void;
  setCvLang: (lang: "fr" | "en") => void;
  setSelectedTemplate: (t: TemplateId) => void;
  setTone: (tone: string) => void;
  setToneChosen: (chosen: boolean) => void;
  updateCvField: (path: string, value: string) => void;
  addCvExperience: () => void;
  removeCvExperience: (index: number) => void;
  addCvBullet: (expIndex: number) => void;
  removeCvBullet: (expIndex: number, bulletIndex: number) => void;
  // Drag-to-reorder (within an experience or across two experiences). The
  // editor uses native HTML5 DnD so the indices are resolved at drop-time.
  moveCvBullet: (fromExp: number, fromIdx: number, toExp: number, toIdx: number) => void;
  // Replace a single bullet wholesale — used by the "improve with AI" button so
  // we don't fight the contentEditable diff path of `updateCvField`.
  replaceCvBullet: (expIndex: number, bulletIndex: number, value: string) => void;
  addCvEducation: () => void;
  removeCvEducation: (index: number) => void;
  addCvLanguage: (lang: string) => void;
  removeCvLanguage: (index: number) => void;
  pushCvHistory: () => void;
  undo: () => void;
  setUser: (user: { email: string; provider: string } | null) => void;
  saveCvToLibrary: (cv: CVData) => void;
  clearCvLibrary: () => void;
  reset: () => void;
}

const initialState = {
  profile: null,
  offer: null,
  gapAnalysis: null,
  agentBrief: null as AgentBrief | null,
  messages: [],
  cvData: null,
  cvOriginal: null,
  cvDataAlt: null,
  // Default to English; App.tsx syncs this to i18n.language on mount.
  cvLang: "en" as "fr" | "en",
  selectedTemplate: "clean" as TemplateId,
  tone: "startup",
  toneChosen: false,
  projectId: null,
  user: null,
  cvHistory: [] as CVData[],
  savedCvLibrary: null as CVData | null,
  coverLetterData: null,
  targetMarket: "france" as "france" | "europe" | "us" | "global",
  brandColors: null,
  useBrandColors: true,
};

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v) return [v];
  return [];
}

// Hard cap: resumes read better with 4-6 focused competencies than a 12-skill
// wall. Applied everywhere we accept CV data (user edits, upload, backend).
const MAX_SKILLS = 6;

function sanitizeCv(cv: CVData): CVData {
  return {
    ...cv,
    skills: asArray(cv.skills).slice(0, MAX_SKILLS),
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
  setAgentBrief: (agentBrief) => set({ agentBrief }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (messages) => set({ messages }),
  setProjectId: (projectId) => set({ projectId }),
  setCvData: (cvData) => set({ cvData: sanitizeCv(cvData) }),
  setCvOriginal: (cvOriginal) => set({ cvOriginal: sanitizeCv(cvOriginal) }),
  setCvDataAlt: (cvDataAlt) => set({ cvDataAlt: sanitizeCv(cvDataAlt) }),
  setCvLang: (cvLang) => set({ cvLang }),
  setSelectedTemplate: (selectedTemplate) => set({ selectedTemplate }),
  setTone: (tone) => set({ tone }),
  setToneChosen: (toneChosen) => set({ toneChosen }),
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
        cv.skills = value.split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, MAX_SKILLS);
        return { cvData: cv };
      }
      const keys = path.split(".");
      // Walk to the parent of the final key. JS indexing works the same for
      // arr["0"] and arr[0], so no special-case for array indices is needed —
      // the old logic descended one step too deep on paths like
      // "experiences.0.bullets.3" and tried to assign "3" on a string, throwing
      // "Cannot create property '3' on string ''" which silently killed every
      // add_bullet cv_action from the chat.
      let obj: Record<string, unknown> = cv as unknown as Record<string, unknown>;
      for (let i = 0; i < keys.length - 1; i++) {
        const next = obj[keys[i]];
        if (next == null || typeof next !== "object") return { cvData: cv };
        obj = next as Record<string, unknown>;
      }
      obj[keys[keys.length - 1]] = value;
      return { cvData: cv };
    }),
  addCvExperience: () => set((s) => {
    if (!s.cvData) return s;
    const cv = sanitizeCv(structuredClone(s.cvData));
    cv.experiences.push({ title: "", company: "", dates: "", bullets: [""] });
    return { cvData: cv };
  }),
  removeCvExperience: (index) => set((s) => {
    if (!s.cvData) return s;
    const cv = sanitizeCv(structuredClone(s.cvData));
    cv.experiences.splice(index, 1);
    return { cvData: cv };
  }),
  addCvBullet: (expIndex) => set((s) => {
    if (!s.cvData) return s;
    const cv = sanitizeCv(structuredClone(s.cvData));
    cv.experiences[expIndex]?.bullets.push("");
    return { cvData: cv };
  }),
  removeCvBullet: (expIndex, bulletIndex) => set((s) => {
    if (!s.cvData) return s;
    const cv = sanitizeCv(structuredClone(s.cvData));
    cv.experiences[expIndex]?.bullets.splice(bulletIndex, 1);
    return { cvData: cv };
  }),
  moveCvBullet: (fromExp, fromIdx, toExp, toIdx) => set((s) => {
    if (!s.cvData) return s;
    if (fromExp === toExp && fromIdx === toIdx) return s;
    const cv = sanitizeCv(structuredClone(s.cvData));
    const src = cv.experiences[fromExp];
    const dst = cv.experiences[toExp];
    if (!src || !dst) return s;
    if (fromIdx < 0 || fromIdx >= src.bullets.length) return s;
    const [moved] = src.bullets.splice(fromIdx, 1);
    // When moving inside the same list and the target sits after the source,
    // the splice above shifts everything down by one — compensate so the bullet
    // lands where the user actually dropped it.
    let insertAt = toIdx;
    if (fromExp === toExp && toIdx > fromIdx) insertAt = toIdx - 1;
    insertAt = Math.max(0, Math.min(insertAt, dst.bullets.length));
    dst.bullets.splice(insertAt, 0, moved);
    return { cvData: cv };
  }),
  replaceCvBullet: (expIndex, bulletIndex, value) => set((s) => {
    if (!s.cvData) return s;
    const cv = sanitizeCv(structuredClone(s.cvData));
    const exp = cv.experiences[expIndex];
    if (!exp || bulletIndex < 0 || bulletIndex >= exp.bullets.length) return s;
    exp.bullets[bulletIndex] = value;
    return { cvData: cv };
  }),
  addCvEducation: () => set((s) => {
    if (!s.cvData) return s;
    const cv = sanitizeCv(structuredClone(s.cvData));
    cv.education.push({ degree: "", school: "", year: "" });
    return { cvData: cv };
  }),
  removeCvEducation: (index) => set((s) => {
    if (!s.cvData) return s;
    const cv = sanitizeCv(structuredClone(s.cvData));
    cv.education.splice(index, 1);
    return { cvData: cv };
  }),
  addCvLanguage: (lang) => set((s) => {
    if (!s.cvData) return s;
    const cv = sanitizeCv(structuredClone(s.cvData));
    cv.languages.push(lang);
    return { cvData: cv };
  }),
  removeCvLanguage: (index) => set((s) => {
    if (!s.cvData) return s;
    const cv = sanitizeCv(structuredClone(s.cvData));
    cv.languages.splice(index, 1);
    return { cvData: cv };
  }),
  pushCvHistory: () => set((s) => {
    if (!s.cvData) return s;
    const history = [...s.cvHistory, sanitizeCv(structuredClone(s.cvData))].slice(-20);
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
  saveCvToLibrary: (cv) => set({ savedCvLibrary: sanitizeCv(cv) }),
  clearCvLibrary: () => set({ savedCvLibrary: null }),
  // Preserve savedCvLibrary across resets — it's cross-project state by design.
  reset: () => set((s) => ({ ...initialState, savedCvLibrary: s.savedCvLibrary })),
}), {
  name: "bored-cv-session",
  partialize: (state) => ({
    profile: state.profile,
    offer: state.offer,
    gapAnalysis: state.gapAnalysis,
    messages: state.messages.slice(-20),
    cvData: state.cvData,
    // Persist the translated-alt CV so returning users can see the opposite
    // language without re-hitting the translate endpoint. Without this, a user
    // who generates EN, translates to FR, and reloads the page loses the FR
    // version and sees only EN in the Editor — the "legacy project" bug.
    cvDataAlt: state.cvDataAlt,
    cvLang: state.cvLang,
    selectedTemplate: state.selectedTemplate,
    tone: state.tone,
    toneChosen: state.toneChosen,
    savedCvLibrary: state.savedCvLibrary,
    // user is intentionally excluded — session is server-side
    // cvHistory is intentionally excluded — too large for localStorage
  }),
  merge: (persisted, current) => {
    const p = persisted as Partial<AppState> | undefined;
    const merged = { ...current, ...p };
    if (merged.cvData) merged.cvData = sanitizeCv(merged.cvData);
    if (merged.savedCvLibrary) merged.savedCvLibrary = sanitizeCv(merged.savedCvLibrary);
    return merged;
  },
}));
