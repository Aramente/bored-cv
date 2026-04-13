import re

import httpx
from bs4 import BeautifulSoup

from app.models import Offer, OfferRequirement


async def scrape_offer_url(url: str) -> Offer | None:
    try:
        async with httpx.AsyncClient(
            timeout=10.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; BoredCV/1.0)"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except (httpx.HTTPError, httpx.InvalidURL):
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    main = soup.find("main") or soup.find("article") or soup.find("div", class_=re.compile("job|posting|description"))
    text = (main or soup.body or soup).get_text(separator="\n", strip=True)
    text = text[:10_000]

    if len(text) < 50:
        return None

    return parse_offer_text(text)


def parse_offer_text(raw: str) -> Offer:
    lines = [line.strip() for line in raw.strip().split("\n") if line.strip()]
    if not lines:
        return Offer(title="", company="", description=raw)

    title = lines[0] if len(lines[0]) < 120 else ""
    company = ""

    if " - " in title:
        parts = title.split(" - ", 1)
        title = parts[0].strip()
        company = parts[1].strip()
    elif " at " in title.lower():
        parts = re.split(r"\s+at\s+", title, flags=re.IGNORECASE)
        if len(parts) == 2:
            title = parts[0].strip()
            company = parts[1].strip()

    requirements: list[OfferRequirement] = []
    nice_to_have: list[OfferRequirement] = []
    current_list = None

    for line in lines:
        lower = line.lower()
        if any(kw in lower for kw in ["requirement", "qualif", "must have", "you have", "what we need", "profil recherché", "compétences requises"]):
            current_list = requirements
            continue
        elif any(kw in lower for kw in ["nice to have", "bonus", "plus", "atout", "idéalement"]):
            current_list = nice_to_have
            continue

        if current_list is not None and (line.startswith("-") or line.startswith("•") or line.startswith("*")):
            text = line.lstrip("-•* ").strip()
            if text:
                category = "nice_to_have" if current_list is nice_to_have else "required"
                current_list.append(OfferRequirement(text=text, category=category))

    description = "\n".join(lines)

    return Offer(
        title=title, company=company, description=description,
        requirements=requirements, nice_to_have=nice_to_have,
    )
