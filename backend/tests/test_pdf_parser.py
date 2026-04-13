import pytest
from app.services.pdf_parser import parse_linkedin_pdf


def test_parse_extracts_name_and_title(sample_linkedin_pdf):
    result = parse_linkedin_pdf(sample_linkedin_pdf)
    assert result.name != ""
    assert result.title != ""


def test_parse_extracts_experiences(sample_linkedin_pdf):
    result = parse_linkedin_pdf(sample_linkedin_pdf)
    assert len(result.experiences) > 0
    exp = result.experiences[0]
    assert exp.title != ""
    assert exp.company != ""


def test_parse_extracts_education(sample_linkedin_pdf):
    result = parse_linkedin_pdf(sample_linkedin_pdf)
    assert len(result.education) > 0


def test_parse_extracts_skills(sample_linkedin_pdf):
    result = parse_linkedin_pdf(sample_linkedin_pdf)
    assert len(result.skills) > 0


@pytest.fixture
def sample_linkedin_pdf(tmp_path) -> bytes:
    """Create a minimal PDF mimicking LinkedIn export structure."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    path = tmp_path / "linkedin.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4

    c.setFont("Helvetica-Bold", 24)
    c.drawString(50, h - 60, "Marie Dupont")
    c.setFont("Helvetica", 14)
    c.drawString(50, h - 85, "Product Manager at TechCorp")
    c.drawString(50, h - 105, "Paris, France")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, h - 145, "About")
    c.setFont("Helvetica", 10)
    c.drawString(50, h - 165, "Experienced product manager with 8 years in SaaS.")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, h - 205, "Experience")
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, h - 225, "Senior Product Manager")
    c.setFont("Helvetica", 10)
    c.drawString(50, h - 240, "TechCorp")
    c.drawString(50, h - 255, "Jan 2022 - Present")
    c.drawString(50, h - 270, "Led product strategy for B2B platform, growing ARR by 45%.")

    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, h - 295, "Product Manager")
    c.setFont("Helvetica", 10)
    c.drawString(50, h - 310, "StartupABC")
    c.drawString(50, h - 325, "Mar 2019 - Dec 2021")
    c.drawString(50, h - 340, "Shipped mobile app from 0 to 50k users in 12 months.")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, h - 380, "Education")
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, h - 400, "MSc Management")
    c.setFont("Helvetica", 10)
    c.drawString(50, h - 415, "HEC Paris")
    c.drawString(50, h - 430, "2018")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, h - 470, "Skills")
    c.setFont("Helvetica", 10)
    c.drawString(50, h - 490, "Product Strategy  .  SQL  .  Figma  .  Agile  .  User Research")

    c.save()
    return path.read_bytes()
