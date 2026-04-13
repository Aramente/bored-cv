import re

import httpx
from bs4 import BeautifulSoup

from app.models import Offer, OfferRequirement


async def scrape_offer_url(url: str) -> Offer | None:
    # Try SPA-specific APIs first (Ashby, Lever, Greenhouse)
    spa_result = await _try_spa_apis(url)
    if spa_result:
        return spa_result

    # Fallback to standard HTML scraping
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


async def _try_spa_apis(url: str) -> Offer | None:
    """Try known job board APIs for SPA-rendered sites."""

    # Ashby: jobs.ashbyhq.com/<org>/<job-id>
    ashby = re.match(r"https?://jobs\.ashbyhq\.com/([^/]+)/([a-f0-9-]+)", url)
    if ashby:
        return await _scrape_ashby(ashby.group(1), ashby.group(2))

    # Lever: jobs.lever.co/<org>/<job-id>
    lever = re.match(r"https?://jobs\.lever\.co/([^/]+)/([a-f0-9-]+)", url)
    if lever:
        return await _scrape_lever(lever.group(1), lever.group(2))

    # Greenhouse: boards.greenhouse.io/<org>/jobs/<job-id>
    greenhouse = re.match(r"https?://boards\.greenhouse\.io/([^/]+)/jobs/(\d+)", url)
    if greenhouse:
        return await _scrape_greenhouse(greenhouse.group(1), greenhouse.group(2))

    return None


async def _scrape_ashby(org: str, job_id: str) -> Offer | None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting",
                json={
                    "operationName": "ApiJobPosting",
                    "variables": {
                        "organizationHostedJobsPageName": org,
                        "jobPostingId": job_id,
                    },
                    "query": (
                        "query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {"
                        " jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName,"
                        " jobPostingId: $jobPostingId) {"
                        " title descriptionHtml locationName departmentName } }"
                    ),
                },
            )
            data = resp.json().get("data", {}).get("jobPosting")
            if not data:
                return None

            soup = BeautifulSoup(data.get("descriptionHtml", ""), "html.parser")
            text = soup.get_text(separator="\n", strip=True)

            offer = parse_offer_text(text)
            offer.title = data.get("title", offer.title)
            offer.company = org.replace("-", " ").title()
            offer.location = data.get("locationName", "")
            return offer
    except Exception:
        return None


async def _scrape_lever(org: str, job_id: str) -> Offer | None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"https://api.lever.co/v0/postings/{org}/{job_id}")
            if resp.status_code != 200:
                return None
            data = resp.json()

            description = data.get("descriptionPlain", "")
            lists = data.get("lists", [])
            for lst in lists:
                description += f"\n\n{lst.get('text', '')}:\n"
                description += "\n".join(f"- {item}" for item in lst.get("content", "").split("\n") if item.strip())

            offer = parse_offer_text(description)
            offer.title = data.get("text", offer.title)
            offer.company = org.replace("-", " ").title()
            offer.location = data.get("categories", {}).get("location", "")
            return offer
    except Exception:
        return None


async def _scrape_greenhouse(org: str, job_id: str) -> Offer | None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"https://boards-api.greenhouse.io/v1/boards/{org}/jobs/{job_id}")
            if resp.status_code != 200:
                return None
            data = resp.json()

            soup = BeautifulSoup(data.get("content", ""), "html.parser")
            text = soup.get_text(separator="\n", strip=True)

            offer = parse_offer_text(text)
            offer.title = data.get("title", offer.title)
            offer.company = org.replace("-", " ").title()
            loc = data.get("location", {}).get("name", "")
            offer.location = loc
            return offer
    except Exception:
        return None


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
