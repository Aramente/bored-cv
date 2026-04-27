import type { Profile, Offer, GapAnalysis, ChatMessage, ChatResponse, CVData, CoverLetterData } from "../store";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:7860";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("bored-cv-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post<T>(path: string, body: unknown, captchaToken?: string, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...getAuthHeaders() };
  if (captchaToken) headers["x-captcha-token"] = captchaToken;

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export interface AuthTokenResponse {
  token: string;
  email: string;
  provider: string;
}

export async function signupWithEmail(email: string, password: string, captchaToken: string): Promise<AuthTokenResponse> {
  return post<AuthTokenResponse>("/api/auth/signup", { email, password }, captchaToken);
}

export async function loginWithEmail(email: string, password: string): Promise<AuthTokenResponse> {
  return post<AuthTokenResponse>("/api/auth/login", { email, password });
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

export async function transcribeAudio(blob: Blob, lang: string, contextWords?: string[]): Promise<string> {
  const form = new FormData();
  form.append("file", blob, "recording.webm");
  if (contextWords?.length) {
    form.append("context_bias", JSON.stringify(contextWords));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 2min client timeout

  try {
    const res = await fetch(`${API_URL}/api/transcribe`, {
      method: "POST",
      headers: { "x-lang": lang, ...getAuthHeaders() },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Transcription failed" }));
      throw new Error(err.detail);
    }

    const data = await res.json();
    return data.text || "";
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Transcription timed out — try a shorter recording");
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export async function scrapeOffer(url: string, rawText: string, captchaToken: string): Promise<Offer> {
  return post("/api/scrape-offer", { url, raw_text: rawText }, captchaToken);
}

export async function analyzeProfile(profile: Profile, offer: Offer, captchaToken: string, lang?: string): Promise<GapAnalysis> {
  return post("/api/analyze", { profile, offer, ui_language: lang || "en" }, captchaToken);
}

export async function chatNext(profile: Profile, offer: Offer, gapAnalysis: GapAnalysis, messages: ChatMessage[], captchaToken: string, lang?: string, knownFacts?: string[], contradictions?: string[], cvDraft?: CVData | null, signal?: AbortSignal): Promise<ChatResponse> {
  return post("/api/chat", {
    profile, offer, gap_analysis: gapAnalysis, messages, ui_language: lang || "en",
    known_facts: knownFacts || [], contradictions: contradictions || [],
    cv_draft: cvDraft || null,
  }, captchaToken, signal);
}

export async function getKnowledge(): Promise<{ experiences: any[]; facts: any[]; contradictions: string[] }> {
  const res = await fetch(`${API_URL}/api/knowledge`, { headers: getAuthHeaders() });
  if (!res.ok) return { experiences: [], facts: [], contradictions: [] };
  return res.json();
}

export async function generateCV(profile: Profile, offer: Offer, gapAnalysis: GapAnalysis, messages: ChatMessage[], captchaToken: string, lang?: string, tone?: string, market?: string): Promise<CVData> {
  return post("/api/generate-cv", { profile, offer, gap_analysis: gapAnalysis, messages, ui_language: lang || "en", tone: tone || "startup", target_market: market || "france" }, captchaToken);
}

export async function draftCV(profile: Profile, offer: Offer, gapAnalysis: GapAnalysis, messages: ChatMessage[], captchaToken: string, lang?: string, market?: string, signal?: AbortSignal): Promise<CVData> {
  return post("/api/draft-cv", { profile, offer, gap_analysis: gapAnalysis, messages, ui_language: lang || "en", target_market: market || "france" }, captchaToken, signal);
}

export async function improveBullet(
  text: string,
  role: string,
  company: string,
  offerTitle: string,
  lang: string,
  tone: string,
  captchaToken: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await post<{ text: string }>(
    "/api/improve-bullet",
    { text, role, company, offer_title: offerTitle, ui_language: lang, tone },
    captchaToken,
    signal,
  );
  return res.text;
}

export interface ToneSamples {
  source: string;
  company: string;
  startup: string;
  creative: string;
  minimal: string;
}

export async function getToneSamples(profile: Profile, offer: Offer, lang?: string): Promise<ToneSamples> {
  return post("/api/tone-samples", { profile, offer, ui_language: lang || "en" }, "");
}

export async function translateCV(cvData: CVData, targetLanguage: string): Promise<CVData> {
  return post("/api/translate-cv", { cv_data: cvData, target_language: targetLanguage });
}

export interface AuditFinding { where: string; text: string; }
export interface AuditCvResult {
  grammar: AuditFinding[];
  missing_from_offer: AuditFinding[];
  advice: AuditFinding[];
}

export async function auditCV(cvData: CVData, offer: Offer, lang: string, captchaToken: string, signal?: AbortSignal): Promise<AuditCvResult> {
  return post<AuditCvResult>(
    "/api/audit-cv",
    { cv_data: cvData, offer, ui_language: lang || "en" },
    captchaToken,
    signal,
  );
}

export interface ApplyGrammarFixesResult {
  cv_data: CVData;
  applied: number;
  skipped: number;
  skipped_indices: number[];
}

export async function applyGrammarFixes(
  cvData: CVData,
  findings: AuditFinding[],
  lang: string,
  captchaToken: string,
  signal?: AbortSignal,
): Promise<ApplyGrammarFixesResult> {
  return post<ApplyGrammarFixesResult>(
    "/api/apply-grammar-fixes",
    { cv_data: cvData, findings, ui_language: lang || "en" },
    captchaToken,
    signal,
  );
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

// Shareable public snapshots — freeze-in-time CV copies under a random slug.
// See backend/app/routers/snapshots.py for the auth + privacy model.
export interface SnapshotPayload {
  cv_data: CVData;
  template: string;
  brand_colors: { primary: string; secondary: string } | null;
  use_brand_colors: boolean;
}

export class SnapshotError extends Error {
  // Status is exposed so the UI can distinguish "sign in" (401) from other
  // failures (network, 500). The generic post() helper flattens both into a
  // plain Error which is why we bypass it here.
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "SnapshotError";
  }
}

export async function createSnapshot(payload: SnapshotPayload): Promise<{ slug: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new SnapshotError(0, (e as Error).message || "Network error");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new SnapshotError(res.status, err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getSnapshot(slug: string): Promise<SnapshotPayload> {
  const res = await fetch(`${API_URL}/api/snapshots/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Snapshot not found" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}
