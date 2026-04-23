---
template: clean
version: 0.1
last_updated: 2026-04-23
---

# Clean — DESIGN.md

## 1. Visual Theme

Recruiter-friendly default. Dark navy sidebar anchors identity + skills; white main panel carries the narrative. Borrowed from startup collateral — confident, structured, never flashy.

Mood: **pragmatic, current, trustworthy**. Not corporate, not playful.

## 2. Color Palette

| Role       | Hex       | Usage                               |
|------------|-----------|-------------------------------------|
| Sidebar bg | `#0c1f3d` | sidebar background (override: brand.secondary) |
| Gold rule  | `#F5C542` | top accent strip on sidebar          |
| Accent     | `#6366f1` | company name, bullet rail, highlights label (override: brand.primary) |
| Text       | `#1e293b` | main body text                       |
| Muted      | `#94a3b8` | sidebar section labels, dates        |
| Contact    | `#cbd5e1` | sidebar contact items                |
| Hilite bg  | `#f5f3ff` | key-highlights callout               |

Branded mode swaps sidebar + accent for `brandColors.secondary` + `primary`.

## 3. Typography

Single family — **Helvetica / Helvetica-Bold** (react-pdf bundled).

| Element          | Size | Weight    |
|------------------|------|-----------|
| Sidebar name     | 16   | Bold      |
| Section title    | 11   | Bold / uppercase / 0.5px tracking |
| Company name     | 9    | Bold      |
| Body bullet      | 9    | Regular   |
| Sidebar section  | 9    | Bold / uppercase / 1px tracking |
| Contact          | 8    | Regular   |

Uppercase + letterspacing is used sparingly — only for section labels.

## 4. Components

- **Sidebar block** — 30% width, `#0c1f3d`, 24pt padding, 2px gold top border
- **Skill tag** — translucent white pill (`rgba(255,255,255,0.1)`), 3×6 padding, 3pt radius, 8pt font
- **Key Highlights callout** — 3pt left border in accent, `#f5f3ff` fill, 8×10 padding, 2pt radius
- **Experience block** — 2pt left border in accent, 8pt left padding, 12pt bottom margin, `wrap={false}` so it never splits across pages
- **Bullet** — `•` prefix, 8pt left padding, 9pt body, `BoldMetrics` bolds numbers

## 5. Layout

- Page: A4, two-column `flexDirection: row`
- Left: 30% sidebar — name, contact, skills, education
- Right: 70% main — highlights, experience
- All sidebar content stacks vertically; skills wrap as tags
- Bottom-right `bcv` watermark (6pt, 0.4 opacity)

## 6. Depth

Flat. No shadows. Hierarchy comes from:
- Dark sidebar vs white main (background contrast)
- Left-border accents on experience + highlights (linear rhythm)
- Bold + uppercase section titles (typographic weight)

Only "elevation" is the gold 2pt top border of the sidebar — a single deliberate moment.

## 7. Motion

None. PDF-only. HTML preview (`CleanHtml`) inherits `contentEditable` focus outlines from the shared `Editable` component.

## 8. Do's and Don'ts

**Do**
- Keep bullet count to 3–5 per experience
- Let the sidebar hold factual data (skills, dates, education)
- Use `BoldMetrics` for numeric proof points
- Respect `wrap={false}` on `expBlock` — never remove

**Don't**
- Add a second accent color (palette is already 3-color)
- Break the 30/70 column split
- Use icons in the sidebar — this template is text-only by design
- Stretch the sidebar darker than `#0c1f3d` — it will eat ink on print

## 9. Example Snippets

**Experience block (canonical)**
```tsx
<View wrap={false} style={[styles.expBlock, { borderLeftColor: accentColor }]}>
  <Text style={styles.expTitle}>{exp.title}</Text>
  <Text style={[styles.expCompany, { color: accentColor }]}>{exp.company}</Text>
  <Text style={styles.expDates}>{exp.dates}</Text>
  {exp.bullets.map((b, j) => <BoldMetrics key={j} text={`• ${b}`} style={styles.bullet} />)}
</View>
```

**Highlights callout**
```tsx
<View style={[styles.highlights, { borderLeftColor: accentColor }]}>
  <Text style={[styles.highlightsLabel, { color: accentColor }]}>Key Highlights</Text>
  <Text style={styles.highlightsText}>{data.summary}</Text>
</View>
```
