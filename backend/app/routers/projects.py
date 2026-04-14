import json
from fastapi import APIRouter, HTTPException, Request

from app.db import get_db
from app.models import ProjectSummary, ProjectDetail, KnowledgeBase, KnowledgeEntry

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _get_user_id(request: Request) -> str:
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to save projects")
    return user.get("email", "")


@router.get("", response_model=list[ProjectSummary])
async def list_projects(request: Request):
    user_id = _get_user_id(request)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name, offer_title, match_score, template, tone, created_at, updated_at "
            "FROM projects WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    return [ProjectSummary(**dict(r)) for r in rows]


@router.post("", response_model=ProjectDetail)
async def create_project(request: Request, name: str = "", offer_title: str = "", offer_url: str = ""):
    user_id = _get_user_id(request)
    with get_db() as conn:
        # Ensure user exists
        conn.execute(
            "INSERT OR IGNORE INTO users (id, email, provider) VALUES (?, ?, ?)",
            (user_id, user_id, request.session.get("user", {}).get("provider", "")),
        )
        cursor = conn.execute(
            "INSERT INTO projects (user_id, name, offer_title, offer_url) VALUES (?, ?, ?, ?)",
            (user_id, name, offer_title, offer_url),
        )
        project_id = cursor.lastrowid
    return ProjectDetail(id=project_id, name=name, offer_title=offer_title, offer_url=offer_url)


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(project_id: int, request: Request):
    user_id = _get_user_id(request)
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM projects WHERE id = ? AND user_id = ?",
            (project_id, user_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    data = dict(row)
    # Parse JSON fields
    for field in ["offer_data", "profile_data", "gap_analysis", "cv_data", "messages"]:
        if data.get(field):
            try:
                data[field] = json.loads(data[field])
            except (json.JSONDecodeError, TypeError):
                data[field] = None if field != "messages" else []
    return ProjectDetail(**data)


@router.put("/{project_id}")
async def update_project(project_id: int, request: Request):
    user_id = _get_user_id(request)
    body = await request.json()

    # Serialize JSON fields
    updates = {}
    for field in ["offer_data", "profile_data", "gap_analysis", "cv_data", "messages"]:
        if field in body:
            updates[field] = json.dumps(body[field]) if body[field] else "{}"

    for field in ["name", "offer_title", "offer_url", "match_score", "template", "tone"]:
        if field in body:
            updates[field] = body[field]

    if not updates:
        return {"status": "ok"}

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [project_id, user_id]

    with get_db() as conn:
        conn.execute(
            f"UPDATE projects SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
            values,
        )
    return {"status": "ok"}


@router.delete("/{project_id}")
async def delete_project(project_id: int, request: Request):
    user_id = _get_user_id(request)
    with get_db() as conn:
        conn.execute("DELETE FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
    return {"status": "ok"}
