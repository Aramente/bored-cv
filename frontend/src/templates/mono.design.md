---
template: mono
version: 0.1
last_updated: 2026-04-23
---

# Mono — DESIGN.md

## 1. Visual Theme

Engineering aesthetic. The CV reads like a well-commented source file: `# title` prompts, `// section` comments, `▸` carets for bullets, monospace for structural elements. Designed for engineers, DevEx people, and infra/platform folks who want a layout that signals fluency in a terminal.

Mood: **precise, technical, opinionated**. Not ironic — the code metaphor is load-bearing.

## 2. Color Palette

| Role        | Hex       | Usage                           |
|-------------|-----------|---------------------------------|
| Text        | `#1e293b` | body                            |
| Name        | `#0f172a` | candidate name                  |
| Accent      | `#10b981` | `#` prompt, `//` sections, `@` separator (override: brand.primary) |
| Muted       | `#94a3b8` | contact line, dates             |
| Body bullet | `#475569` | bullet text                     |

Single accent. The accent is the entire personality of this template — the green `#` + `//` reads as a terminal prompt. Override via `brandColors.primary` for brand-matching.

## 3. Typography

Two families, deliberately mixed:

| Element          | Family            | Size | Weight |
|------------------|-------------------|------|--------|
| Name             | Helvetica-Bold    | 18   | Bold   |
| `# {title}` line | Courier-Bold      | 10   | Bold   |
| Section `// x`   | Courier-Bold      | 10   | Bold   |
| Body summary     | Helvetica         | 10   | Regular|
| Exp title        | Helvetica-Bold    | 10   | Bold   |
| `@` separator    | Courier-Bold      | —    | Bold   |
| Skills block     | Courier           | 9    | Regular|
| Bullet           | Helvetica         | 9    | Regular|

Helvetica is the default body font; Courier is reserved for structural / "code" markers. Never use Courier for prose.

## 4. Components

- **Name line** — plain Helvetica-Bold, no decoration (the chrome comes from the prompt below)
- **Prompt line** — `# {title}` in Courier-Bold, accent color. The `#` MUST be a literal hash (not `＃`)
- **Section header** — `// {name}` in Courier-Bold, accent color. Name is lowercase (`// experience`, `// stack`)
- **Experience head** — single line: `Title @ Company  dates`, `@` in accent Courier-Bold, dates muted
- **Bullet** — `▸ ` caret prefix (U+25B8), 10pt left padding
- **Skills** — rendered as `skill · skill · skill` in Courier
- **Education line** — `Degree @ School  (year)` single line

## 5. Layout

- Page: A4, 28pt padding all sides (tight — this template is dense)
- Single column, no sidebar
- Order: name → prompt → contact → `// summary` → `// experience` → `// stack` → `// education`
- No section dividers — the `//` header itself is the break
- Bottom-right `bcv` watermark (inherited from other templates)

## 6. Depth

Zero depth. Flat by manifesto. The whole value proposition of this template is *"no ornamentation, just structure"* — shadows, gradients, borders, fills would undermine the metaphor.

## 7. Motion

None (PDF). HTML preview uses the shared `Editable` focus ring.

## 8. Do's and Don'ts

**Do**
- Keep lowercase in section headers (`// experience`, not `// EXPERIENCE`)
- Use the `▸` caret as the sole bullet marker
- Put dates inline with title+company (one-line experience head)
- Treat Courier as structural punctuation, not prose

**Don't**
- Add borders, shadows, or background fills to any block
- Use emoji or icons — this template is ASCII-only by intent
- Swap Helvetica for another body font; the Helvetica/Courier contrast IS the design
- Expand the accent palette — single green is load-bearing
- Add a photo, sidebar, or column split — the density is the feature

## 9. Example Snippets

**Experience head (one-line canonical)**
```tsx
<Text style={styles.expTitle}>
  {exp.title}
  <Text style={[styles.at, { color: accent }]}>{" @ "}</Text>
  {exp.company}
  <Text style={styles.expDates}>{"  " + exp.dates}</Text>
</Text>
```

**Section header**
```tsx
<Text style={[styles.sectionTitle, { color: accent }]}>// experience</Text>
```

**Bullet**
```tsx
<BoldMetrics text={`▸ ${b}`} style={styles.bullet} />
```
