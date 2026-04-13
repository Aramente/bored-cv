import type { Profile, Offer, GapAnalysis, ChatMessage, ChatResponse, CVData } from "../store";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:7860";

async function post<T>(path: string, body: unknown, captchaToken?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (captchaToken) headers["x-captcha-token"] = captchaToken;

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
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
    headers: { "x-captcha-token": captchaToken },
    credentials: "include",
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

export async function chatNext(profile: Profile, offer: Offer, gapAnalysis: GapAnalysis, messages: ChatMessage[], captchaToken: string, lang?: string): Promise<ChatResponse> {
  return post("/api/chat", { profile, offer, gap_analysis: gapAnalysis, messages, ui_language: lang || "en" }, captchaToken);
}

export async function generateCV(profile: Profile, offer: Offer, gapAnalysis: GapAnalysis, messages: ChatMessage[], captchaToken: string, lang?: string): Promise<CVData> {
  return post("/api/generate-cv", { profile, offer, gap_analysis: gapAnalysis, messages, ui_language: lang || "en" }, captchaToken);
}

export async function getQuota(): Promise<{ authenticated: boolean; daily_limit: number }> {
  const res = await fetch(`${API_URL}/api/auth/quota`, { credentials: "include" });
  return res.json();
}
