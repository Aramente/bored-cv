import pytest
from app.services.offer_scraper import parse_offer_text, scrape_offer_url


def test_parse_offer_text_extracts_structure():
    raw = """
    Senior Product Manager - TechCorp
    Paris, France

    About the role:
    We're looking for a Senior PM to lead our B2B platform.

    Requirements:
    - 5+ years product management experience
    - Experience with B2B SaaS
    - Strong SQL skills
    - Team leadership experience

    Nice to have:
    - Experience with AI/ML products
    - MBA or equivalent
    """
    result = parse_offer_text(raw)
    assert result.title != ""
    assert result.company != ""
    assert len(result.requirements) > 0
    assert result.description != ""


def test_parse_offer_text_handles_minimal_input():
    raw = "We need a developer with Python and React skills."
    result = parse_offer_text(raw)
    assert result.description != ""


@pytest.mark.asyncio
async def test_scrape_offer_url_returns_none_on_bad_url():
    result = await scrape_offer_url("https://this-does-not-exist-12345.com/job")
    assert result is None
