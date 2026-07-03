from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from database import (
    db_get_project, db_update_project,
    db_list_shot_manifests, db_update_shot_manifest,
    db_get_series, db_get_assets, db_update_asset,
)

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


# ── Shot Manifest models ──────────────────────────────────────────────────────

class ShotManifestUpdate(BaseModel):
    locked_prompts: dict | None = None  # frozen prompts after approval
    status: str = "draft"               # draft | reviewing | approved | locked | rejected
    revision_notes: str = ""            # feedback if rejected


class ManifestApproval(BaseModel):
    revision_notes: str = ""  # optional notes before approving


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


@router.post("/{project_id}/upload-shot-image")
async def upload_shot_image(
    project_id: str,
    asset_id: str = Form(...),
    file: UploadFile = File(...),
):
    """Manually supply an image for a shot, bypassing AI image generation
    entirely. Fills the exact same slot generate_shot_frame/regenerate would
    have — same asset, same approval gate — so manual and AI-generated shots
    flow through the pipeline identically from here on.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    assets = db_get_assets(project_id)
    asset = next((a for a in assets if a.get("id") == asset_id), None)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.get("asset_type") not in ("storyboard_panel", "panel"):
        raise HTTPException(
            status_code=400,
            detail="Only storyboard panel images can be manually uploaded",
        )

    raw = await file.read()
    try:
        import io
        from PIL import Image
        img = Image.open(io.BytesIO(raw))
        img.load()  # force-decode so downstream save can't fail silently
        # Preserve transparency: convert to RGBA when the image has an alpha
        # channel (RGBA, LA, PA) or a transparency palette entry ('P' with
        # 'transparency' in img.info); otherwise normalise to RGB.
        if img.mode not in ("RGB", "RGBA"):
            has_transparency = (
                img.mode in ("LA", "PA")
                or (img.mode == "P" and "transparency" in img.info)
            )
            img = img.convert("RGBA" if has_transparency else "RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()
    except Exception:
        raise HTTPException(status_code=400, detail="Uploaded file is not a readable image")

    import uuid
    import json as _json
    from utils.storage import upload_bytes
    shot_no = asset.get("shot_number") or asset_id[:6]
    # Unique key per upload (like AI re-rolls) so the URL always changes —
    # otherwise the browser/UI has no signal that the image was replaced.
    key = f"{project_id}/shots/shot_{shot_no}_manual_{uuid.uuid4().hex}.png"
    url = upload_bytes(png_bytes, key, "image/png")

    # "source" isn't a real column — it lives in the metadata JSON blob
    # alongside duration/panel_index/shot_manifest_id etc, so merge into the
    # existing metadata rather than overwriting it via db_update_asset's
    # column-only kwargs.
    metadata = _json.loads(asset.get("metadata") or "{}")
    metadata["source"] = "manual"
    db_update_asset(asset_id, url=url, prompt="(manually uploaded)", metadata=metadata)
    return {"message": "Image uploaded", "url": url}


# ── Shot Manifest gate ───────────────────────────────────────────────────────

@router.get("/{project_id}/shot-manifests")
async def get_shot_manifests(project_id: str):
    """Retrieve all shot manifests for a project."""
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    manifests = db_list_shot_manifests(project_id)
    return {
        "project_id": project_id,
        "count": len(manifests),
        "manifests": manifests,
    }


@router.post("/{project_id}/approve-manifests")
async def approve_manifests(project_id: str, body: ManifestApproval = ManifestApproval()):
    """
    Human approves all shot manifests for the project.
    Marks all drafts as 'locked' and transitions project to building_storyboard.
    The orchestrator picks it up from there.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Mark all draft manifests as locked
    manifests = db_list_shot_manifests(project_id)
    for manifest in manifests:
        if manifest['status'] in ('draft', 'approved'):
            db_update_shot_manifest(
                manifest['id'],
                status='locked',
                revision_notes=body.revision_notes,
            )

    db_update_project(
        project_id,
        stage="manifest_approved",
        revision_notes=body.revision_notes,
    )
    return {"message": "Shot manifests locked — generating shot frames"}


@router.post("/{project_id}/revise-manifests")
async def revise_manifests(project_id: str, body: ManifestApproval):
    """
    Human rejects the shot manifests and provides feedback.
    Stores feedback and resets to treatment stage for regeneration.
    """
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db_update_project(
        project_id,
        revision_notes=body.revision_notes,
        stage="analyzed",
    )
    return {"message": "Manifest revision noted — regenerating treatment"}


@router.post("/{project_id}/import-production-guide")
async def import_production_guide(project_id: str, file: UploadFile = File(...)):
    """
    Import a production guide (Excel shot sheet) and create shot manifests.
    Transitions project to awaiting_manifest_approval for human review.
    """
    from services.production_guide_importer import (
        parse_excel_shot_sheet, create_project_shot_manifests
    )
    import tempfile

    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Save uploaded file to temp location
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Parse the Excel file
        parsed = parse_excel_shot_sheet(tmp_path, project_id=project_id)

        # Create shot manifests in database
        manifest_ids = create_project_shot_manifests(project_id, parsed['shots'])

        # Update project stage and metadata
        db_update_project(
            project_id,
            stage="awaiting_manifest_approval",
            revision_notes=f"Imported {len(manifest_ids)} shot manifests from production guide",
        )

        return {
            "message": f"Imported {len(manifest_ids)} shot manifests",
            "manifest_ids": manifest_ids,
            "metadata": parsed['metadata'],
            "continuity_bible": parsed['continuity_bible'],
        }

    finally:
        # Clean up temp file
        import os
        os.unlink(tmp_path)
