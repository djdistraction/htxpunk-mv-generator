from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import db_get_project, db_update_project

router = APIRouter()


# ── Request/response models ───────────────────────────────────────────────────

class TreatmentApproval(BaseModel):
    notes: str = ""          # optional notes saved with project (not used by pipeline)
    treatment: dict | None = None  # optionally override treatment before approving

class TreatmentRevision(BaseModel):
    feedback: str            # what the user wants changed

class StoryboardApproval(BaseModel):
    panel_order: list[str]   # asset IDs in the desired sequence

class ImageRegenRequest(BaseModel):
    asset_id: str
    new_prompt: str


# ── Treatment gate ────────────────────────────────────────────────────────────

@router.post("/{project_id}/approve-treatment")
async def approve_treatment(project_id: str, body: TreatmentApproval = TreatmentApproval()):
    """
    Human approves the AI-generated treatment.
    Optionally pass an edited treatment dict to override before approval.
    The orchestrator automatically picks up and runs element extraction.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    updates: dict = {"stage": "treatment_approved"}
    if body.treatment:
        updates["treatment"] = body.treatment

    db_update_project(project_id, **updates)
    return {"message": "Treatment approved — images generating soon"}


@router.post("/{project_id}/revise-treatment")
async def revise_treatment(project_id: str, body: TreatmentRevision):
    """
    Human rejects the treatment and provides feedback.
    Stores the feedback and resets stage so the orchestrator regenerates.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db_update_project(
        project_id,
        revision_notes=body.feedback,
        stage="analyzed",   # orchestrator will re-run treatment generation
    )
    return {"message": "Revision noted — regenerating treatment"}


# ── Storyboard gate ───────────────────────────────────────────────────────────

@router.post("/{project_id}/approve-storyboard")
async def approve_storyboard(project_id: str, body: StoryboardApproval):
    """
    Human approves the storyboard (optionally with a new panel order).
    The orchestrator automatically picks up and runs video assembly.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db_update_project(
        project_id,
        panel_order=body.panel_order,
        stage="storyboard_approved",
    )
    return {"message": "Storyboard approved — video assembly starting soon"}


# ── Image regeneration ────────────────────────────────────────────────────────

@router.post("/{project_id}/regenerate-image")
async def regenerate_image(project_id: str, body: ImageRegenRequest):
    """Regenerate a single background or element image with a revised prompt."""
    from workers.pipeline_worker import regenerate_single_image
    import threading
    t = threading.Thread(
        target=regenerate_single_image,
        args=(project_id, body.asset_id, body.new_prompt),
        daemon=True,
    )
    t.start()
    return {"message": "Regeneration started"}
