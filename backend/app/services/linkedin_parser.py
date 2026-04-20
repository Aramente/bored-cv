"""Heuristic parser for LinkedIn PDF exports. Zero LLM calls, instant results.

LinkedIn PDFs use a two-column layout where the right column (skills, languages)
is interleaved line-by-line with the left column (experience). We handle this
by dumping everything between Experience and Education into one stream, then
filtering out right-column noise using known patterns.
"""

import re
from app.models import Education, Experience, Profile


# --- Patterns ---

DATE_LINE = re.compile(
    r"^((?:jan|fév|fé|mar|avr|mai|jun|jui|aoû|ao|sep|oct|nov|déc|"
    r"january|february|march|april|may|june|july|august|september|october|november|december|"
    r"janvier|février|mars|avril|juin|juillet|août|septembre|octobre|novembre|décembre)"
    r"\w*\.?\s+\d{4})"
    r"\s*[-–—]\s*"
    r"((?:jan|fév|fé|mar|avr|mai|jun|jui|aoû|ao|sep|oct|nov|déc|"
    r"january|february|march|april|may|june|july|august|september|october|november|december|"
    r"janvier|février|mars|avril|juin|juillet|août|septembre|octobre|novembre|décembre)"
    r"\w*\.?\s+\d{4}|present|présent|aujourd'hui|current|now)"
    r"\s*(\(.*\))?",
    re.IGNORECASE,
)

# Right-column noise patterns
LANGUAGE_LINE = re.compile(
    r"^(French|English|Spanish|German|Italian|Portuguese|Chinese|Japanese|Korean|Arabic|Russian|Dutch|Hindi|Mandarin|Cantonese|"
    r"Français|Anglais|Espagnol|Allemand|Italien|Portugais|Chinois|Japonais|Coréen|Arabe|Russe|Néerlandais)"
    r"\s*\(", re.IGNORECASE
)
PAGE_MARKER = re.compile(r"^Page \d+ of \d+$")
PHONE_RE = re.compile(r"(\+?\d[\d\s\-\.]{7,15}\d)")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
LINKEDIN_RE = re.compile(r"((?:https?://)?(?:www\.)?linkedin\.com/in/[\w-]+)")
LOCATION_LINE = re.compile(
    r"^(Paris|Lyon|Marseille|Toulouse|Nantes|Bordeaux|Lille|Strasbourg|London|Berlin|"
    r"New York|San Francisco|Remote|France|Région de Paris|Paris Area|Île-de-France)",
    re.IGNORECASE
)

SECTION_HEADERS = {
    "experience": re.compile(r"^(Experience|Expérience)$", re.IGNORECASE),
    "education": re.compile(r"^(Education|Formation)$", re.IGNORECASE),
    "skills": re.compile(r"^(Skills|Compétences|Top Skills|Principales compétences)$", re.IGNORECASE),
    "languages": re.compile(r"^(Languages|Langues)$", re.IGNORECASE),
    "summary": re.compile(r"^(Summary|Résumé|About|À propos)$", re.IGNORECASE),
    "certifications": re.compile(r"^(Certifications|Licences|Licenses)$", re.IGNORECASE),
    "honors": re.compile(r"^(Honors|Distinctions|Honors & Awards)$", re.IGNORECASE),
    "volunteer": re.compile(r"^(Volunteer Experience|Bénévolat)$", re.IGNORECASE),
}

# Sections that end the experience block
END_EXPERIENCE_SECTIONS = {"education", "certifications", "honors", "volunteer"}


def _section_type(line: str) -> str | None:
    for name, pat in SECTION_HEADERS.items():
        if pat.match(line.strip()):
            return name
    return None


def _is_right_column_noise(line: str) -> bool:
    """Check if a line is right-column noise (language proficiency, etc.)."""
    stripped = line.strip()
    if LANGUAGE_LINE.match(stripped):
        return True
    if stripped in ("(LinkedIn)", "(Mobile)"):
        return True
    if PAGE_MARKER.match(stripped):
        return True
    # Duration-only line like "4 ans 3 mois" (multi-role company header)
    if re.match(r"^\d+\s+(an|mois|year|month)", stripped, re.IGNORECASE):
        return False  # Not noise — it's a company group marker
    return False


def _is_location_line(line: str) -> bool:
    return bool(LOCATION_LINE.match(line.strip()))


def parse_linkedin_heuristic(raw_text: str) -> Profile | None:
    """Parse LinkedIn PDF text into a Profile using heuristics.
    Returns None if it doesn't look like a LinkedIn PDF.
    """
    lines = [l.strip() for l in raw_text.split("\n") if l.strip()]
    if len(lines) < 5:
        return None

    # --- Phase 1: Find section boundaries ---
    exp_start = None
    exp_end = None
    edu_start = None
    skills_start = None
    summary_start = None

    for i, line in enumerate(lines):
        sec = _section_type(line)
        if sec == "experience" and exp_start is None:
            exp_start = i + 1
        elif sec in END_EXPERIENCE_SECTIONS and exp_start is not None and exp_end is None:
            exp_end = i
            if sec == "education":
                edu_start = i + 1
        elif sec == "skills" and exp_start is None:
            skills_start = i + 1
        elif sec == "summary" and exp_start is None:
            summary_start = i + 1

    if exp_start is None:
        return None

    if exp_end is None:
        exp_end = len(lines)

    # --- Phase 2: Parse header (everything before experience) ---
    header_lines = lines[:exp_start - 1]
    name, email, phone, linkedin, location, summary = _parse_header(
        header_lines, lines[summary_start:exp_start - 1] if summary_start else []
    )

    # --- Phase 3: Parse skills (before experience) ---
    skills: list[str] = []
    if skills_start:
        for line in lines[skills_start:exp_start - 1]:
            sec = _section_type(line)
            if sec:
                break
            stripped = line.strip()
            if stripped and not _is_right_column_noise(stripped):
                skills.append(stripped)

    # --- Phase 4: Parse experience block ---
    # Filter right-column noise, then extract experiences
    exp_raw = lines[exp_start:exp_end]

    # Collect languages from interleaved right-column
    languages: list[str] = []
    exp_clean: list[str] = []

    for line in exp_raw:
        stripped = line.strip()
        sec = _section_type(stripped)
        if sec in ("skills", "languages"):
            continue  # Skip right-column section headers
        if PAGE_MARKER.match(stripped):
            continue
        if _is_right_column_noise(stripped):
            languages.append(stripped)
            continue
        exp_clean.append(stripped)

    experiences = _parse_experiences(exp_clean)

    # --- Phase 5: Parse education ---
    education: list[Education] = []
    if edu_start:
        edu_lines = lines[edu_start:]
        # Stop at next section or end
        edu_clean = []
        for line in edu_lines:
            sec = _section_type(line)
            if sec and sec != "education":
                break
            if not PAGE_MARKER.match(line.strip()):
                edu_clean.append(line.strip())
        education = _parse_education(edu_clean)

    # Title = first experience title if available
    title = experiences[0].title if experiences else ""

    profile = Profile(
        name=name,
        title=title,
        location=location,
        email=email,
        phone=phone,
        linkedin=linkedin,
        summary=summary,
        experiences=experiences,
        education=education,
        skills=skills,
        languages=languages,
    )

    if profile.name and len(profile.experiences) > 0 and _is_coherent(profile, raw_text):
        return profile
    return None


def _is_coherent(profile: Profile, raw_text: str) -> bool:
    """Quick sanity check — if the parse looks off, return False to trigger LLM fallback."""
    # Name should be 2+ words (not a section header or label)
    if len(profile.name.split()) < 2:
        return False

    # At least 30% of experiences should have a company name
    if profile.experiences:
        with_company = sum(1 for e in profile.experiences if e.company)
        if with_company / len(profile.experiences) < 0.3:
            return False

    # Experiences count should be plausible relative to PDF size
    # A typical LinkedIn PDF has ~500 chars per experience
    expected_min = max(1, len(raw_text) // 2000)
    if len(profile.experiences) < expected_min // 2:
        return False

    # Name should appear somewhere in the raw text
    if profile.name.lower() not in raw_text.lower():
        return False

    return True


def _parse_header(header_lines: list[str], summary_lines: list[str]) -> tuple:
    """Extract contact info from header."""
    name = ""
    email = ""
    phone = ""
    linkedin = ""
    location = ""
    summary = ""

    all_text = "\n".join(header_lines)

    m = EMAIL_RE.search(all_text)
    if m:
        email = m.group()

    m = PHONE_RE.search(all_text)
    if m:
        phone = m.group().strip()

    m = LINKEDIN_RE.search(all_text)
    if m:
        linkedin = m.group()

    for line in header_lines:
        stripped = line.strip()
        if stripped in ("(LinkedIn)", "(Mobile)") or PAGE_MARKER.match(stripped):
            continue
        if EMAIL_RE.search(stripped) or LINKEDIN_RE.search(stripped):
            continue

        # Clean "Coordonnées" prefix
        cleaned = stripped
        for prefix in ("Coordonnées ", "Contact "):
            if cleaned.startswith(prefix):
                cleaned = cleaned[len(prefix):]

        # Phone-only line
        if PHONE_RE.match(cleaned) and cleaned.replace(" ", "").replace("+", "").replace("-", "").replace(".", "").isdigit():
            continue

        if not name and cleaned and len(cleaned) < 60:
            name = cleaned
        elif not location and _is_location_line(cleaned):
            location = cleaned

    if summary_lines:
        summary = " ".join(l.strip() for l in summary_lines if l.strip() and not _section_type(l))

    return name, email, phone, linkedin, location, summary


DUR_PATTERN = re.compile(r"^\d+\s+(an|mois|year|month)", re.IGNORECASE)


def _find_title_company_before_date(lines: list[str], date_idx: int) -> tuple[str, str, bool]:
    """Look backwards from a date line to find the title, company, and whether this is a multi-role group.

    Returns (company, title, is_multi_role).
    """
    # Collect non-location, non-bullet lines going backwards from the date
    candidates = []
    for i in range(date_idx - 1, max(date_idx - 5, -1), -1):
        line = lines[i].strip()
        if not line:
            continue
        if DATE_LINE.match(line):
            break  # Hit previous date — stop
        if _is_location_line(line):
            continue
        if line.startswith(("- ", "* ", "• ", "· ")):
            continue  # Skip bullets — they belong to the previous experience
        candidates.insert(0, line)

    # Check for duration line (multi-role indicator)
    dur_idx = None
    for ci, c in enumerate(candidates):
        if DUR_PATTERN.match(c):
            dur_idx = ci
            break

    if dur_idx is not None and dur_idx > 0:
        # Multi-role: Company / Duration / Title / Date
        company = candidates[dur_idx - 1]
        title_candidates = candidates[dur_idx + 1:]
        title = title_candidates[0] if title_candidates else ""
        return company, title, True

    if len(candidates) >= 2:
        return candidates[-2], candidates[-1], False
    if len(candidates) == 1:
        return candidates[0], "", False
    return "", "", False


def _parse_experiences(lines: list[str]) -> list[Experience]:
    """Two-pass parser: find dates first, then look backwards for metadata and forwards for bullets."""
    # Pass 1: Find all date lines and extract company/title by looking backwards
    entries: list[dict] = []
    for i, line in enumerate(lines):
        if DATE_LINE.match(line.strip()):
            company, title, is_multi = _find_title_company_before_date(lines, i)
            entries.append({
                "idx": i,
                "company": company,
                "title": title,
                "is_multi": is_multi,
                "dates": re.sub(r"\s*\(.*?\)\s*$", "", line.strip()),
            })

    # Propagate group_company for multi-role entries
    # When LinkedIn shows multiple roles at one company, only the first has
    # Company + Duration. Subsequent roles only show Title + Date.
    # The lookback will mistake the title for a company (single candidate).
    group_company = None
    for e in entries:
        if e["is_multi"]:
            group_company = e["company"]
        elif group_company:
            # The detected "company" is likely a job title (only 1 candidate in lookback)
            # Swap: what we thought was company is actually the title
            if e["company"] and not e["title"]:
                e["title"] = e["company"]
            e["company"] = group_company
        else:
            group_company = None

    # Pass 2: Collect bullets between consecutive dates
    # Build a set of "metadata lines" (company/title) to exclude from bullets
    meta_lines = set()
    for e in entries:
        if e["company"]:
            meta_lines.add(e["company"])
        if e["title"]:
            meta_lines.add(e["title"])

    experiences: list[Experience] = []
    for di, e in enumerate(entries):
        start = e["idx"] + 1
        end = entries[di + 1]["idx"] if di + 1 < len(entries) else len(lines)

        bullets = []
        for i in range(start, end):
            line = lines[i].strip()
            if not line or _is_location_line(line) or DUR_PATTERN.match(line):
                continue
            if line in meta_lines:
                continue
            if line.startswith(("- ", "* ", "• ", "· ")):
                bullets.append(line.lstrip("-*•· ").strip())
            elif len(line) > 10:
                bullets.append(line)

        experiences.append(Experience(
            title=e["title"],
            company=e["company"],
            dates=e["dates"],
            description=" ".join(bullets[:3]),
            bullets=bullets,
        ))

    return _merge_same_company(experiences)


def _merge_same_company(experiences: list[Experience]) -> list[Experience]:
    """Merge consecutive experiences at the same company into a single entry with combined bullets."""
    if not experiences:
        return experiences

    merged: list[Experience] = []
    for exp in experiences:
        if (merged
            and exp.company
            and merged[-1].company
            and exp.company.lower() == merged[-1].company.lower()):
            # Same company — merge into previous
            prev = merged[-1]
            # Combine titles
            if exp.title and exp.title.lower() != prev.title.lower():
                combined_title = f"{prev.title} → {exp.title}"
            else:
                combined_title = prev.title
            # Combine dates (earliest start - latest end)
            combined_dates = f"{exp.dates} / {prev.dates}" if exp.dates != prev.dates else prev.dates
            # Combine bullets, prefixed with role title
            combined_bullets = []
            if prev.bullets:
                combined_bullets.append(f"[{prev.title}]")
                combined_bullets.extend(prev.bullets)
            if exp.bullets:
                combined_bullets.append(f"[{exp.title}]")
                combined_bullets.extend(exp.bullets)

            merged[-1] = Experience(
                title=combined_title,
                company=prev.company,
                dates=combined_dates,
                description=prev.description,
                bullets=combined_bullets if combined_bullets else prev.bullets + exp.bullets,
            )
        else:
            merged.append(exp)

    return merged


def _build_exp(data: dict) -> Experience:
    bullets = data.get("bullets", [])
    desc = " ".join(bullets[:3]) if bullets else ""
    return Experience(
        title=data.get("title", ""),
        company=data.get("company", ""),
        dates=data.get("dates", ""),
        description=desc,
        bullets=bullets,
    )


def _parse_education(lines: list[str]) -> list[Education]:
    """Parse education lines. Format: School / Degree, Field · (2011 - 2015)"""
    entries: list[Education] = []
    i = 0
    while i < len(lines):
        school = lines[i].strip()
        degree = ""
        year = ""

        if i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            year_match = re.search(r"\((\d{4}\s*[-–]\s*\d{4}|\d{4})\)", next_line)
            if year_match:
                year = year_match.group(1)
                degree = next_line[:year_match.start()].rstrip(" ·,")
                i += 2
            else:
                degree = next_line
                i += 2
        else:
            i += 1

        if school:
            entries.append(Education(school=school, degree=degree, year=year))

    return entries
