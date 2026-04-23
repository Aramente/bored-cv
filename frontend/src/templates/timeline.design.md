---
template: timeline
version: 0.2
last_updated: 2026-04-23
---

# Timeline — DESIGN.md

## 1. Visual Theme

A vertical career rail. The single strongest design move: one thin line running down the page, with one dot per role. Everything else is stacked sections flanking that rail.

Mood: **chronological, coherent, disciplined**. The CV tells a story of progression. For candidates whose story is the arc, not the individual roles.

Best fit: 5–10 years of experience in a clearly progressing career.

## 2. Color Palette

| Role       | Hex       | Usage                               |
|------------|-----------|-------------------------------------|
| Text       | `#0f172a` | headers, names                      |
| Body       | `#334155` | bullets, summary                    |
| Accent     | `#0f172a` | dot, rail, section titles (override: brand.primary) |
| Rail       | `#cbd5e1` | the vertical line itself (always muted — never accent) |
| Dates      | `#94a3b8` | date stamps                         |
| Dividers   | `#e2e8f0` | section bottom borders              |

Single accent. The rail is deliberately mid-gray — the dots are the accent color, so they pop against the muted rail.

## 3. Typography

**Inter** (system fallback `-apple-system, BlinkMacSystemFont`). Single family, 4 weights (400/500/600/700).

| Element           | Size | Weight |
|-------------------|------|--------|
| Name              | 28px | 700    |
| Title             | 14px | 500    |
| Summary           | 14px | 400    |
| Section title     | 11px | 700 / uppercase / 1.5px tracking |
| Exp dates         | 11px | 500    |
| Exp title         | 15px | 700    |
| Exp company       | 12px | 500    |
| Bullet            | 12.5px | 400  |
| Edu degree        | 13px | 700    |
| Edu school        | 11px | 400    |
| Skills            | 12px | 400    |

No uppercase except section titles. Line-height 1.55 for bullets, 1.6 for summary.

## 4. Components

- **Header**: name + title + contact stacked, no divider, 24px bottom margin
- **Summary block**: 3px left border in accent, padding 8×14, italic optional
- **Rail section** (`.tl-rail`): `border-left: 1.5px solid #cbd5e1`, padding-left 28px, margin-left 8px
- **Experience block**: `position: relative`, 20px bottom margin, `wrap={false}`
- **Dot**: `position: absolute; left: -35px; top: 6px; width: 9px; height: 9px; border-radius: 50%; background: accent`
- **Exp header**: dates (muted small) → title (big bold) → company (medium regular)
- **Bullet**: `•` prefix via `::before`, 14px left padding
- **Split grid**: education + skills side-by-side below rail, 28px gap, 12px top margin

## 5. Layout

- `.cv-sheet { display: flex; }` is inherited — **MUST override to `display: block`**
- Single-column layout. Rail is inside the Experience section only.
- Order: header → summary → rail (experiences) → split (education | skills)
- Page padding: 40px horizontal, 36px vertical
- No sidebar. Rail is the single visual anchor.

## 6. Depth

Deliberately flat. The rail + dots are the only visual elements beyond text. No cards, no shadows, no fills. Dots are solid circles, not rings.

One optional depth move: a very subtle gradient on the rail (top darker to bottom lighter at 15% opacity) if the CV runs multi-page — signals "this continues". Stretch goal.

## 7. Motion

None (PDF). HTML preview inherits `Editable` focus ring. Hover on experience block reveals the `×` remove button (opacity 0 → 1).

## 8. Do's and Don'ts

**Do**
- Keep the rail mid-gray — never accent color
- Use solid dots, not rings
- Let dates sit ABOVE title (chronology-first reading order)
- Keep company on one line — use the `(context)` parenthetical convention
- Respect `wrap={false}` on exp blocks

**Don't**
- Use the rail accent color — dots and rail must contrast
- Add horizontal dividers between experiences — the rail IS the divider
- Add a sidebar (the whole point is single-column narrative)
- Use more than 1 accent color
- Put bullets on the rail side (they stay in the right column)

## 9. Example Snippets

**Experience block (HTML)**
```tsx
<div className="tl-exp">
  <span className="tl-dot" style={{ background: accent }} />
  <p className="tl-exp-dates">{exp.dates}</p>
  <h3 className="tl-exp-title">{exp.title}</h3>
  <p className="tl-exp-company">{exp.company}</p>
  <ul className="cv-bullets">...</ul>
</div>
```

**Experience block (PDF)**
```tsx
<View wrap={false} style={styles.exp}>
  <View style={[styles.dot, { backgroundColor: accent }]} />
  <Text style={styles.expDates}>{exp.dates}</Text>
  <Text style={styles.expTitle}>{exp.title}</Text>
  <Text style={styles.expCompany}>{exp.company}</Text>
  {exp.bullets.map((b, j) => <BoldMetrics key={j} text={`• ${b}`} style={styles.bullet} />)}
</View>
```

**Root CSS (critical)**
```css
.timeline-tpl {
  display: block;  /* override .cv-sheet's flex */
  padding: 36px 40px;
}
```
