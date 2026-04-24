"""Public shareable CV snapshots.

A snapshot is a frozen copy of a CV at share time — the user clicks "Share
public link", we store the rendered CV + template + brand colors under a random
slug, and the user gets back a URL that anyone with the link can open. The
snapshot never auto-updates: editing the source CV after share does NOT change
what a visitor sees. This is by design — a shared link should be stable.

Privacy: every response from GET /api/snapshots/{slug} sets X-Robots-Tag:
noindex, nofollow so search engines don't index shared CVs. The frontend view
(`/v/:slug`) also emits a <meta name="robots" content="noindex, nofollow">
tag. robots.txt blocks /v/ as well — belt-and-suspenders for privacy.

The slug is a random 16-char url-safe token (~96 bits of entropy) — unguessable
without being passed around. That's the whole auth model: if you have the slug,
you can see it; if you don't, you can't. No user accounts are required to view.
"""
import json
import secrets

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from app.db import get_db
from app.routers.auth import get_user_from_request

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])

SLUG_ALPHABET_BYTES = 12  # token_urlsafe(12) → ~16 chars


def _ensure_schema() -> None:
    """Create the snapshots table on first use. Idempotent."""
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS snapshots (
                slug TEXT PRIMARY KEY,
                user_id TEXT,
                cv_data TEXT NOT NULL,
                template TEXT DEFAULT 'clean',
                brand_colors TEXT DEFAULT '',
                use_brand_colors INTEGER DEFAULT 1,
                views INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_snapshots_user ON snapshots(user_id)
            """
        )


_ensure_schema()


class CreateSnapshotRequest(BaseModel):
    cv_data: dict
    template: str = "clean"
    brand_colors: dict | None = None
    use_brand_colors: bool = True


class CreateSnapshotResponse(BaseModel):
    slug: str


class SnapshotResponse(BaseModel):
    cv_data: dict
    template: str
    brand_colors: dict | None
    use_brand_colors: bool


@router.post("", response_model=CreateSnapshotResponse)
async def create_snapshot(request: Request, payload: CreateSnapshotRequest):
    """Create a public snapshot. Requires auth so we can attribute + revoke.

    Anonymous sharing is intentionally not supported — if spam/abuse becomes a
    concern we can revoke by user_id.
    """
    auth_header = request.headers.get("authorization", "")
    user = get_user_from_request(authorization=auth_header)
    user_id = user.get("email", "") if user else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to share a CV publicly")

    slug = secrets.token_urlsafe(SLUG_ALPHABET_BYTES)
    cv_json = json.dumps(payload.cv_data)
    colors_json = json.dumps(payload.brand_colors) if payload.brand_colors else ""

    with get_db() as conn:
        conn.execute(
            "INSERT INTO snapshots (slug, user_id, cv_data, template, brand_colors, use_brand_colors) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (slug, user_id, cv_json, payload.template, colors_json, 1 if payload.use_brand_colors else 0),
        )

    return CreateSnapshotResponse(slug=slug)


@router.get("/{slug}", response_model=SnapshotResponse)
async def get_snapshot(slug: str, response: Response):
    """Public read. Adds noindex headers so crawlers don't cache the content."""
    # Defence in depth — robots meta + header + robots.txt. Any one of them
    # failing (e.g. cached robots.txt) still leaves two barriers up.
    response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
    # Also discourage intermediaries from caching shared CVs. Public but not
    # cacheable — each view hits us, so we can revoke by deleting the row.
    response.headers["Cache-Control"] = "private, no-store"

    with get_db() as conn:
        row = conn.execute(
            "SELECT cv_data, template, brand_colors, use_brand_colors FROM snapshots WHERE slug = ?",
            (slug,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        # Best-effort view increment. Ignore failures — the snapshot itself is
        # more important than the counter.
        try:
            conn.execute("UPDATE snapshots SET views = views + 1 WHERE slug = ?", (slug,))
        except Exception:
            pass

    cv_data = json.loads(row["cv_data"])
    colors_str = row["brand_colors"] or ""
    brand_colors = json.loads(colors_str) if colors_str else None

    return SnapshotResponse(
        cv_data=cv_data,
        template=row["template"] or "clean",
        brand_colors=brand_colors,
        use_brand_colors=bool(row["use_brand_colors"]),
    )


@router.delete("/{slug}")
async def delete_snapshot(slug: str, request: Request):
    """Revoke a shared link. Only the creator can delete."""
    auth_header = request.headers.get("authorization", "")
    user = get_user_from_request(authorization=auth_header)
    user_id = user.get("email", "") if user else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in required")

    with get_db() as conn:
        row = conn.execute("SELECT user_id FROM snapshots WHERE slug = ?", (slug,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        if row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not your snapshot")
        conn.execute("DELETE FROM snapshots WHERE slug = ?", (slug,))
    return {"ok": True}
