import io
import json
import os

import google.generativeai as genai
import pdfplumber

from app.models import Education, Experience, Profile


def extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract raw text from a PDF file."""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        pages = []
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
    return "\n\n".join(pages)


def parse_linkedin_pdf(pdf_bytes: bytes) -> Profile:
    """Parse a LinkedIn PDF export using LLM for robust extraction."""
    raw_text = extract_pdf_text(pdf_bytes)

    if len(raw_text.strip()) < 50:
        return Profile(name="", title="")

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return _fallback_parse(raw_text)

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash")

    prompt = f"""Extract structured profile data from this LinkedIn PDF export. The text is messy because LinkedIn PDFs use a two-column layout — sections are interleaved. Use your judgment to reconstruct the correct structure.

RAW TEXT:
{raw_text[:8000]}

Return valid JSON only:
{{
  "name": "full name (just the person's name, not 'Coordonnées' or other labels)",
  "title": "current or most recent job title",
  "location": "city, country",
  "email": "email if found, otherwise empty string",
  "phone": "phone number if found, otherwise empty string",
  "linkedin": "LinkedIn URL if found, otherwise empty string",
  "summary": "professional summary/about section if found, otherwise empty string",
  "experiences": [
    {{
      "title": "job title",
      "company": "company name",
      "dates": "date range as written",
      "description": "role description as a single paragraph",
      "bullets": ["key achievement or responsibility 1", "key achievement 2"]
    }}
  ],
  "education": [
    {{
      "degree": "degree name",
      "school": "school name",
      "year": "graduation year or date range"
    }}
  ],
  "skills": ["skill1", "skill2"],
  "languages": ["French (Native)", "English (Fluent)", "Spanish (Professional)"]
}}

IMPORTANT:
- Extract ALL experiences from all pages, not just the first few
- Keep the original language of descriptions (don't translate)
- For bullets, split multi-sentence descriptions into separate items
- If a field is not found, use empty string or empty array
- The name is usually on the first line, possibly after 'Coordonnées' or 'Contact'
- Languages section: extract with proficiency level (Native, Fluent, Professional, etc.)
- Phone number: often near the top, may start with + or country code"""

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=4000,
                temperature=0.1,
                response_mime_type="application/json",  # Forces valid JSON output
            ),
        )
        data = json.loads(response.text)

        def s(val: str | None) -> str:
            """Safe string — convert None/null to empty string."""
            return str(val) if val else ""

        def sl(val: list | None) -> list:
            """Safe list — convert None to empty list."""
            return val if isinstance(val, list) else []

        return Profile(
            name=s(data.get("name")),
            title=s(data.get("title")),
            location=s(data.get("location")),
            email=s(data.get("email")),
            phone=s(data.get("phone")),
            linkedin=s(data.get("linkedin")),
            summary=s(data.get("summary")),
            experiences=[
                Experience(
                    title=s(exp.get("title")),
                    company=s(exp.get("company")),
                    dates=s(exp.get("dates")),
                    description=s(exp.get("description")),
                    bullets=sl(exp.get("bullets")),
                )
                for exp in sl(data.get("experiences"))
            ],
            education=[
                Education(
                    degree=s(edu.get("degree")),
                    school=s(edu.get("school")),
                    year=s(edu.get("year")),
                )
                for edu in sl(data.get("education"))
            ],
            skills=sl(data.get("skills")),
            languages=sl(data.get("languages")),
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return _fallback_parse(raw_text)


def _fallback_parse(raw_text: str) -> Profile:
    """Basic fallback if LLM is unavailable."""
    lines = [line.strip() for line in raw_text.split("\n") if line.strip()]
    name = lines[0] if lines else ""
    for prefix in ["Coordonnées ", "Contact "]:
        if name.startswith(prefix):
            name = name[len(prefix):]
    return Profile(name=name, title=lines[1] if len(lines) > 1 else "")
