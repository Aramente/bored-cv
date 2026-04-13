import io
import re

import pdfplumber

from app.models import Education, Experience, Profile

SECTION_HEADERS = {"about", "experience", "education", "skills", "languages", "certifications", "honors"}


def parse_linkedin_pdf(pdf_bytes: bytes) -> Profile:
    """Parse a LinkedIn PDF export into a structured Profile."""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        lines: list[str] = []
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                lines.extend(text.split("\n"))

    lines = [line.strip() for line in lines if line.strip()]
    if len(lines) < 3:
        return Profile(name="", title="")

    name = lines[0]
    title = lines[1] if len(lines) > 1 else ""
    location = ""
    start_idx = 2

    if len(lines) > 2 and not _is_section_header(lines[2]):
        if "," in lines[2] or any(w in lines[2].lower() for w in ["france", "paris", "london", "remote"]):
            location = lines[2]
            start_idx = 3

    sections = _split_sections(lines[start_idx:])

    summary = " ".join(sections.get("about", []))
    experiences = _parse_experiences(sections.get("experience", []))
    education = _parse_education(sections.get("education", []))
    skills = _parse_skills(sections.get("skills", []))

    return Profile(
        name=name,
        title=title,
        location=location,
        summary=summary,
        experiences=experiences,
        education=education,
        skills=skills,
    )


def _is_section_header(line: str) -> bool:
    return line.lower().strip() in SECTION_HEADERS


def _split_sections(lines: list[str]) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current_section = ""
    for line in lines:
        if _is_section_header(line):
            current_section = line.lower().strip()
            sections[current_section] = []
        elif current_section:
            sections[current_section].append(line)
    return sections


def _parse_experiences(lines: list[str]) -> list[Experience]:
    experiences: list[Experience] = []
    i = 0
    while i < len(lines):
        title = lines[i]
        company = lines[i + 1] if i + 1 < len(lines) else ""
        dates = ""
        description_lines: list[str] = []

        i += 2
        if i < len(lines) and _looks_like_date(lines[i]):
            dates = lines[i]
            i += 1

        while i < len(lines) and not _looks_like_title(lines, i):
            description_lines.append(lines[i])
            i += 1

        description = " ".join(description_lines)
        bullets = [b.strip().lstrip("•-").strip() for b in description_lines if b.strip()]

        experiences.append(
            Experience(title=title, company=company, dates=dates, description=description, bullets=bullets)
        )
    return experiences


def _looks_like_date(line: str) -> bool:
    date_patterns = [
        r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4}",
        r"\b\d{4}\s*[-–]\s*(present|\d{4})",
    ]
    return any(re.search(p, line, re.IGNORECASE) for p in date_patterns)


def _looks_like_title(lines: list[str], idx: int) -> bool:
    if idx + 1 >= len(lines):
        return False
    if idx + 2 < len(lines) and _looks_like_date(lines[idx + 2]):
        return True
    return False


def _parse_education(lines: list[str]) -> list[Education]:
    education: list[Education] = []
    i = 0
    while i < len(lines):
        degree = lines[i]
        school = lines[i + 1] if i + 1 < len(lines) else ""
        year = ""
        i += 2
        if i < len(lines) and re.search(r"\b\d{4}\b", lines[i]):
            year = lines[i]
            i += 1
        education.append(Education(degree=degree, school=school, year=year))
    return education


def _parse_skills(lines: list[str]) -> list[str]:
    skills: list[str] = []
    for line in lines:
        parts = re.split(r"[·•,]", line)
        skills.extend(p.strip() for p in parts if p.strip())
    return skills
