from fastapi import APIRouter
from database import get_db

router = APIRouter()


@router.get("/{project_id}")
async def list_assets(project_id: str, asset_type: str | None = None):
    db = get_db()
    q = db.table("assets").select("*").eq("project_id", project_id)
    if asset_type:
        q = q.eq("asset_type", asset_type)
    return q.order("created_at").execute().data
