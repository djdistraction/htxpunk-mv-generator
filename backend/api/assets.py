import json
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db_get_assets, db_update_asset

router = APIRouter()


class AssetReview(BaseModel):
    status: str
    note: str = ""


@router.get("/{project_id}")
async def list_assets(project_id: str, asset_type: str | None = None):
    return db_get_assets(project_id, asset_type=asset_type)


@router.post("/{project_id}/{asset_id}/review")
async def review_asset(project_id: str, asset_id: str, body: AssetReview):
    status = body.status.strip().lower()
    if status not in {"approved", "rejected", "generated"}:
        raise HTTPException(status_code=400, detail="Asset status must be approved, rejected, or generated.")

    assets = db_get_assets(project_id)
    asset = next((item for item in assets if item.get("id") == asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    metadata = json.loads(asset.get("metadata") or "{}")
    metadata["asset_status"] = status
    metadata["review_note"] = body.note.strip()
    metadata["reviewed_at"] = datetime.utcnow().isoformat()
    db_update_asset(asset_id, metadata=metadata)
    return {"asset": next(item for item in db_get_assets(project_id) if item.get("id") == asset_id)}
