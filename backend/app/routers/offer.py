from fastapi import APIRouter, HTTPException

from app.models import Offer, OfferScrapeRequest
from app.services.offer_scraper import parse_offer_text, scrape_offer_url

router = APIRouter(prefix="/api", tags=["offer"])


@router.post("/scrape-offer", response_model=Offer)
async def scrape_offer(req: OfferScrapeRequest):
    if not req.url and not req.raw_text:
        raise HTTPException(status_code=400, detail="Provide either url or raw_text")

    if req.raw_text:
        if len(req.raw_text) > 10_000:
            raise HTTPException(status_code=400, detail="Text too long (max 10,000 chars)")
        return parse_offer_text(req.raw_text)

    offer = await scrape_offer_url(req.url)
    if offer is None:
        raise HTTPException(
            status_code=422,
            detail="Could not scrape this URL. Please paste the job description text instead.",
        )
    return offer
