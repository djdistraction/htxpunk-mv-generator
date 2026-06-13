from fastapi import APIRouter
from database import get_db
from workers.pipeline_worker import (
    run_element_extraction,
    run_clip_generation,
)

router = APIRouter()


@router.post("/{project_id}/approve-treatment")
async def approve_treatment(project_id: str, treatment: dict):
    """Human approves (and optionally edits) the AI treatment, then triggers element extraction."""
    db = get_db()
    db.table("projects").update({
        "treatment": treatment,
        "stage": "treatment_approved"
    }).eq("id", project_id).execute()
    run_element_extraction.delay(project_id)
    return {"message": "Treatment approved, extracting elements"}


@router.post("/{project_id}/approve-storyboard")
async def approve_storyboard(project_id: str, panel_order: list[str]):
    """Human approves storyboard panel order, triggers clip generation."""
    db = get_db()
    project = db.table("projects").select("analysis").eq("id", project_id).single().execute().data
    updated_analysis = {**project["analysis"], "panel_order": panel_order}
    db.table("projects").update({
        "stage": "storyboard_approved",
        "analysis": updated_analysis
    }).eq("id", project_id).execute()
    run_clip_generation.delay(project_id)
    return {"message": "Storyboard approved, generating clips"}


@router.post("/{project_id}/regenerate-image")
async def regenerate_image(project_id: str, asset_id: str, new_prompt: str):
    """Regenerate a single background or element image with a revised prompt."""
    from workers.pipeline_worker import regenerate_single_image
    regenerate_single_image.delay(project_id, asset_id, new_prompt)
    return {"message": "Regeneration queued"}
