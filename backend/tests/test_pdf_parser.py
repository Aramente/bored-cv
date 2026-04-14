import pytest
from app.services.pdf_parser import extract_pdf_text, _fallback_parse


def test_extract_pdf_text(sample_linkedin_pdf):
    text = extract_pdf_text(sample_linkedin_pdf)
    assert "Marie Dupont" in text
    assert "Product Manager" in text
    assert "TechCorp" in text


def test_fallback_parse_extracts_name():
    result = _fallback_parse("Marie Dupont\nProduct Manager\nParis")
    assert result.name == "Marie Dupont"
    assert result.title == "Product Manager"


def test_fallback_parse_strips_coordonnees():
    result = _fallback_parse("Coordonnées Kevin Duchier\n0033786626512")
    assert result.name == "Kevin Duchier"


@pytest.fixture
def sample_linkedin_pdf(tmp_path) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    path = tmp_path / "linkedin.pdf"
    c = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4

    c.setFont("Helvetica-Bold", 24)
    c.drawString(50, h - 60, "Marie Dupont")
    c.setFont("Helvetica", 14)
    c.drawString(50, h - 85, "Product Manager at TechCorp")

    c.save()
    return path.read_bytes()
