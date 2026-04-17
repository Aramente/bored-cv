import type { Profile, Offer, GapAnalysis, ChatMessage, ChatResponse, CVData, CoverLetterData } from "../store";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:7860";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("bored-cv-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post<T>(path: string, body: unknown, captchaToken?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...getAuthHeaders() };
  if (captchaToken) headers["x-captcha-token"] = captchaToken;

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function parseLinkedIn(file: File, captchaToken: string): Promise<Profile> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_URL}/api/parse-linkedin`, {
    method: "POST",
    headers: { "x-captcha-token": captchaToken, ...getAuthHeaders() },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail);
  }

  return res.json();
}

export async function scrapeOffer(url: string, rawText: string, captchaToken: string): Promise<Offer> {
  return post("/api/scrape-offer", { url, raw_text: rawText }, captchaToken);
}

export async function analyzeProfile(profile: Profile, offer: Offer, captchaToken: string, lang?: string): Promise<GapAnalysis> {
  return post("/api/analyze", { profile, offer, ui_language: lang || "en" }, captchaToken);
}

export async function chatNext(profile: Profile, offer: Offer, gapAnalysis: GapAnalysis, messages: ChatMessage[], captchaToken: string, lang?: string, knownFacts?: string[], contradictions?: string[], cvDraft?: CVData | null): Promise<ChatResponse> {
  return post("/api/chat", {
    profile, offer, gap_analysis: gapAnalysis, messages, ui_language: lang || "en",
    known_facts: knownFacts || [], contradictions: contradictions || [],
    cv_draft: cvDraft || null,
  }, captchaToken);
}

export async function getKnowledge(): Promise<{ experiences: any[]; facts: any[]; contradictions: string[] }> {
  const res = await fetch(`${API_URL}/api/knowledge`, { headers: getAuthHeaders() });
  if (!res.ok) return { experiences: [], facts: [], contradictions: [] };
  return res.json();
}

export async function generateCV(profile: Profile, offer: Offer, gapAnalysis: GapAnalysis, messages: ChatMessage[], captchaToken: string, lang?: string, tone?: string, market?: string): Promise<CVData> {
  return post("/api/generate-cv", { profile, offer, gap_analysis: gapAnalysis, messages, ui_language: lang || "en", tone: tone || "startup", target_market: market || "france" }, captchaToken);
}

export async function draftCV(profile: Profile, offer: Offer, gapAnalysis: GapAnalysis, messages: ChatMessage[], captchaToken: string, lang?: string, market?: string): Promise<CVData> {
  return post("/api/draft-cv", { profile, offer, gap_analysis: gapAnalysis, messages, ui_language: lang || "en", target_market: market || "france" }, captchaToken);
}

export async function translateCV(cvData: CVData, targetLanguage: string): Promise<CVData> {
  return post("/api/translate-cv", { cv_data: cvData, target_language: targetLanguage });
}

export async function getQuota(): Promise<{ authenticated: boolean; daily_limit: number }> {
  const res = await fetch(`${API_URL}/api/auth/quota`, { headers: getAuthHeaders() });
  return res.json();
}

export async function getConsent(): Promise<{ consented: boolean; asked: boolean }> {
  const res = await fetch(`${API_URL}/api/auth/consent`, { headers: getAuthHeaders() });
  if (!res.ok) return { consented: false, asked: false };
  return res.json();
}

export async function giveConsent(): Promise<void> {
  await post("/api/auth/consent", {});
}

export async function generateCoverLetter(profile: Profile, offer: Offer, cvData: CVData, messages: ChatMessage[], captchaToken: string, lang?: string, tone?: string, market?: string): Promise<CoverLetterData> {
  return post("/api/generate-cover-letter", {
    profile, offer, cv_data: cvData, messages,
    ui_language: lang || "en", tone: tone || "startup", target_market: market || "france",
  }, captchaToken);
}

export async function extractColors(url: string): Promise<{ primary: string; secondary: string; colors: string[] }> {
  return post("/api/extract-colors", { url });
}

export async function listProjects(): Promise<any[]> {
  const res = await fetch(`${API_URL}/api/projects`, { headers: getAuthHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function saveProject(data: Record<string, unknown>): Promise<{ id: number; status: string }> {
  return post("/api/projects/save", data);
}

export async function loadProject(id: number): Promise<any> {
  const res = await fetch(`${API_URL}/api/projects/${id}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to load project");
  return res.json();
}
