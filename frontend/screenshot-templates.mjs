// One-off screenshot script — iterate all 10 templates with realistic
// sample data, capture each rendered HTML template.
// Usage: node screenshot-templates.mjs  (requires dev server on :5173)
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "./screenshots";
mkdirSync(OUT, { recursive: true });

const SAMPLE_CV = {
  name: "Kevin Duchier",
  title: "Founder & Full-stack Builder",
  email: "kevin@example.com",
  phone: "+33 6 12 34 56 78",
  linkedin: "linkedin.com/in/kduchier",
  location: "Paris, France",
  summary: "Founder who ships products end-to-end — from data pipelines to user-facing polish. Built Sloow (biofeedback wearable, 300+ users) and Bored CV (500 CVs generated in first month). Comfortable across infra, ML, and design.",
  experiences: [
    {
      title: "Founder",
      company: "Sloow (biofeedback wearable, seed-stage)",
      dates: "2025 — present",
      bullets: [
        "Shipped v1 of the Sloow app in 8 weeks — React Native + Python FastAPI backend on HF Spaces, 300+ beta users onboarded.",
        "Designed the VLF entrainment protocol with Dr. Stefanovska's published 0.021 Hz target — 19 sessions analyzed end-to-end.",
        "Cut analysis pipeline cost 85% by replacing Gemini 2.5 with Mistral Small for batch jobs — from 0.04€/session to 0.006€."
      ]
    },
    {
      title: "Head of Growth",
      company: "Mindflow (no-code automation, 8→32 FTE)",
      dates: "2022 — 2025",
      bullets: [
        "Grew signups 12× in 14 months (120 → 1,400/mo) via a rebuilt onboarding funnel — drop-off fell from 68% to 23%.",
        "Launched self-serve tier that now accounts for 40% of monthly ARR, £180k MRR at exit.",
        "Hired and managed a team of 3 growth engineers; set up the analytics stack (Segment + dbt + Metabase)."
      ]
    },
    {
      title: "Growth Marketer",
      company: "Germinal (B2B SaaS agency)",
      dates: "2020 — 2022",
      bullets: [
        "Led 14 client accounts across SaaS, edtech, fintech — average retainer uplift of 2.1× in first 6 months.",
        "Built the agency's in-house outbound playbook adopted on all accounts (still in use today)."
      ]
    }
  ],
  education: [
    { degree: "MSc Marketing & Strategy", school: "HEC Paris", year: "2020" },
    { degree: "BSc Economics", school: "Paris-Dauphine", year: "2018" }
  ],
  skills: ["TypeScript", "React", "Python", "FastAPI", "PostgreSQL", "Growth", "Product Strategy", "Data Pipelines", "Figma"],
  languages: ["French (Native)", "English (C2)", "Spanish (B1)"],
  language: "en",
  match_score: 87,
  strengths: ["Full-stack execution", "Growth track record", "Data literacy"],
  improvements: ["Add one B2B enterprise reference"],
};

const TEMPLATES = ["clean", "contrast", "minimal", "retro", "consultant", "timeline", "mono", "executive", "editorial", "compact"];

const BASE = process.env.BASE || "http://localhost:5173";
// Vite base path — app is served under /bored-cv/ in prod but / in dev
const APP_BASE = process.env.APP_BASE || "/";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 } });
const page = await ctx.newPage();

for (const tpl of TEMPLATES) {
  const sessionState = {
    state: {
      cvData: SAMPLE_CV,
      selectedTemplate: tpl,
      tone: "startup",
      toneChosen: true,
      profile: null,
      offer: null,
      gapAnalysis: null,
      messages: [],
    },
    version: 0,
  };

  // Seed localStorage before the app boots, then navigate to /editor
  await page.goto(`${BASE}${APP_BASE}`);
  await page.evaluate((s) => {
    localStorage.setItem("bored-cv-session", JSON.stringify(s));
  }, sessionState);

  await page.goto(`${BASE}${APP_BASE}editor`);
  // Wait for the CV sheet to render
  await page.waitForSelector(".cv-sheet", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);

  const sheet = await page.$(".cv-sheet");
  if (sheet) {
    await sheet.screenshot({ path: `${OUT}/${tpl}.png` });
    console.log(`✓ ${tpl}.png`);
  } else {
    await page.screenshot({ path: `${OUT}/${tpl}-FAIL.png`, fullPage: true });
    console.log(`✗ ${tpl}: no .cv-sheet found`);
  }
}

await browser.close();
