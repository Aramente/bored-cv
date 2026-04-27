// Product Hunt launch screenshot script — capture 4 product screens at 1280x800.
// Usage: node screenshot-launch.mjs
//   BASE=https://aramente.github.io APP_BASE=/bored-cv/ node screenshot-launch.mjs   (prod, default)
//   BASE=http://localhost:5173 APP_BASE=/ node screenshot-launch.mjs                  (dev)

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const OUT = join(homedir(), "Downloads", "bored-cv-launch");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE || "https://aramente.github.io";
const APP_BASE = process.env.APP_BASE || "/bored-cv/";

// Sample state — same shape as screenshot-templates.mjs
const SAMPLE_CV = {
  name: "Kevin Duchier",
  title: "Founder & Full-stack Builder",
  email: "kevin@example.com",
  phone: "+33 6 12 34 56 78",
  linkedin: "linkedin.com/in/kduchier",
  location: "Paris, France",
  summary: "Founder who ships products end-to-end — from data pipelines to user-facing polish. Built Sloow (biofeedback wearable, 300+ users) and Bored CV (500 CVs generated in first month).",
  experiences: [
    {
      title: "Founder",
      company: "Sloow (biofeedback wearable)",
      dates: "2025 — present",
      bullets: [
        "Shipped v1 in 8 weeks — 300+ beta users onboarded.",
        "Cut analysis pipeline cost 85% via Mistral Small batch jobs.",
      ],
    },
    {
      title: "Head of Growth",
      company: "Mindflow (no-code automation, 8→32 FTE)",
      dates: "2022 — 2025",
      bullets: [
        "Grew signups 12× in 14 months (120 → 1,400/mo).",
        "Launched self-serve tier — 40% of MRR at exit.",
      ],
    },
  ],
  education: [
    { degree: "MSc Marketing & Strategy", school: "HEC Paris", year: "2020" },
  ],
  skills: ["TypeScript", "React", "Python", "FastAPI", "Growth", "Product Strategy"],
  languages: ["French (Native)", "English (C2)"],
  language: "en",
  match_score: 87,
  strengths: ["Full-stack execution", "Growth track record", "Data literacy"],
  improvements: ["Add one B2B enterprise reference"],
};

const SAMPLE_PROFILE = {
  name: SAMPLE_CV.name,
  title: SAMPLE_CV.title,
  summary: SAMPLE_CV.summary,
  skills: SAMPLE_CV.skills,
  experiences: SAMPLE_CV.experiences,
  education: SAMPLE_CV.education,
};

const SAMPLE_OFFER = {
  title: "Senior Growth Engineer",
  company: "Linear",
  description: "We're looking for a growth engineer to own the activation funnel. You'll build experiments end-to-end — from analytics instrumentation to UI changes — and partner with PMs to ship measurable improvements. Strong React + analytics background required.",
};

const SAMPLE_GAP = {
  match_score: 87,
  strengths: [
    "Full-stack execution — built Bored CV and Sloow end-to-end",
    "Growth track record — 12× signup growth at Mindflow",
    "Analytics literacy — Segment + dbt + Metabase stack",
  ],
  gaps: [
    "Activation funnel A/B testing — emphasize the Mindflow funnel rebuild",
    "Cross-functional PM partnership — quantify how many PMs you partnered with",
  ],
  questions: [
    "Sur le funnel Mindflow — t'as fait combien d'A/B tests, et lesquels ont moved the needle ?",
    "Combien de PMs t'as eu en partenariat direct sur les expériences growth ?",
  ],
};

const SAMPLE_MESSAGES = [
  { role: "assistant", content: "Salut Kevin ! J'ai analysé ton profil contre l'offre Senior Growth Engineer chez Linear. Match score : 87%. Avant de générer ton CV, j'ai 2 questions pour le rendre vraiment précis." },
  { role: "assistant", content: "Sur le funnel Mindflow — t'as fait combien d'A/B tests, et lesquels ont moved the needle ?" },
  { role: "user", content: "On a tourné ~40 tests sur 14 mois. Le plus gros impact : passer le signup de 4 étapes à 1 — drop-off de 68% à 23%, ce qui a quasiment 3× le taux d'activation." },
  { role: "assistant", content: "Solide. Et combien de PMs t'as eu en partenariat direct sur les expériences growth ?" },
  { role: "user", content: "3 PMs sur les 14 mois — chacun sur un segment (self-serve, mid-market, enterprise). On avait un standup growth-PM hebdo." },
  { role: "assistant", content: "Parfait, j'ai tout ce qu'il me faut. Je génère ton CV sur-mesure pour Linear maintenant." },
];

const SESSION_STATE = {
  state: {
    cvData: SAMPLE_CV,
    selectedTemplate: "editorial",
    tone: "startup",
    toneChosen: true,
    profile: SAMPLE_PROFILE,
    offer: SAMPLE_OFFER,
    gapAnalysis: SAMPLE_GAP,
    messages: SAMPLE_MESSAGES,
  },
  version: 0,
};

const VIEWPORT = { width: 1280, height: 800 };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
const page = await ctx.newPage();

async function seed() {
  await page.goto(`${BASE}${APP_BASE}`);
  await page.evaluate((s) => {
    localStorage.setItem("bored-cv-session", JSON.stringify(s));
  }, SESSION_STATE);
}

async function shoot(route, filename, waitFor) {
  await page.goto(`${BASE}${APP_BASE}${route.replace(/^\//, "")}`);
  if (waitFor) {
    await page.waitForSelector(waitFor, { timeout: 8000 }).catch(() => {});
  }
  await page.waitForTimeout(800);
  const path = join(OUT, filename);
  await page.screenshot({ path, fullPage: false });
  console.log(`✓ ${filename}`);
}

// 1 — Landing (used as social preview)
await shoot("", "1-landing.png", "main, h1");

// 2 — Upload / input stage (paste LinkedIn + job offer)
await shoot("upload", "2-upload.png", "textarea, input[type='url'], main");

// Seed state for the post-flow screens
await seed();

// 3 — Chat / analysis
await shoot("chat", "3-chat.png", ".chat, [class*='chat']");

// 4 — Editor (final CV)
await shoot("editor", "4-editor.png", ".cv-sheet");

await browser.close();
console.log(`\nAll screenshots in ${OUT}`);
