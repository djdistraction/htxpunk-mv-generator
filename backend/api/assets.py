from fastapi import APIRouter
from database import db_get_assets

router = APIRouter()


@router.get("/{project_id}")
async def list_assets(project_id: str, asset_type: str | None = None):
    return db_get_assets(project_id, asset_type=asset_type)
