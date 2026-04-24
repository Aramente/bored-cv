// Shared typographic and spacing rhythm for every CV template — PDF and HTML.
// Keeping the numbers here (rather than repeating them in 20 StyleSheet blocks)
// is how we prevent drift between templates. If you find yourself wanting to
// override one of these in a single template, ask whether the whole system
// needs the new value instead.
//
// PDF units are points (1pt ≈ 1.33px). Values below are the unified rhythm
// after the 2026-04-24 design review. See reference/DESIGN.md Spec.md in the
// vault for the underlying reasoning.

export const T = {
  // Experience block — gap between roles. Was drifting 10/12/14 across
  // templates; unified to 12pt. Feature-page templates (Editorial) may bump
  // locally, but nothing should go below 10 or above 14.
  expBlockMarginBottom: 12,

  // Bullet rhythm. 2pt between items + 1.5 line-height so multi-line bullets
  // don't collapse into a block.
  bulletMarginBottom: 2,
  bulletLineHeight: 1.5,

  // Summary / lede. 1.55 is the readable middle between Compact's 1.45 (too
  // tight) and Consultant/Retro's 1.6 (too airy for a CV).
  summaryLineHeight: 1.55,

  // Section title rhythm. Size is template-specific (Compact stays 9pt to
  // fit two columns) but letter-spacing normalizes here: 1px for most, 2px
  // only if the template already uses all-caps editorial styling.
  sectionTitleLetterSpacing: 1,
  sectionTitleLetterSpacingEditorial: 2,

  // Contact line — 8pt everywhere except centered formal headers (Consultant,
  // Executive) where 9pt reads better at smaller type.
  contactFontSize: 8,
  contactFontSizeCentered: 9,
} as const;
