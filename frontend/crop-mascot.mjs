// Crop the mascot portion of logo.png (no wordmark) to 240x240 cream-padded.
import { chromium } from "playwright";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const LOGO = "/Users/kevinduchier/bored-cv/frontend/public/logo.png";
const OUT = join(homedir(), "Downloads", "bored-cv-launch", "thumbnail-240.png");

const b64 = readFileSync(LOGO).toString("base64");
const dataUrl = `data:image/png;base64,${b64}`;

// Mascot bbox in source (1408x768): roughly cols 464-944, rows 5-485 → 480x480 centered on the mascot.
// Render the source image at full size inside a 240x240 viewport, scaled and translated so the
// mascot region fills the frame.
const SRC_W = 1408, SRC_H = 768;
const CROP_LEFT = 464, CROP_TOP = 5, CROP_SIZE = 480;
const SCALE = 240 / CROP_SIZE; // 0.5
const SHIFT_X = -CROP_LEFT * SCALE;
const SHIFT_Y = -CROP_TOP * SCALE;

const html = `<!doctype html><html><body style="margin:0;background:#fff7d6;">
<div style="width:240px;height:240px;overflow:hidden;background:#fff7d6;">
  <img src="${dataUrl}" style="width:${SRC_W * SCALE}px;height:${SRC_H * SCALE}px;transform:translate(${SHIFT_X}px,${SHIFT_Y}px);display:block;" />
</div>
</body></html>`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 240, height: 240 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.setContent(html);
await page.waitForLoadState("networkidle");
const div = await page.$("div");
await div.screenshot({ path: OUT });
await browser.close();
console.log(`✓ ${OUT}`);
