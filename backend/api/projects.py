from fastapi import APIRouter, UploadFile, File, HTTPException
from models.project import Project, ProjectCreate
from database import get_db
from utils.storage import upload_file
from workers.pipeline_worker import run_audio_analysis

router = APIRouter()


@router.get("/")
async def list_projects():
    db = get_db()
    result = db.table("projects").select("*").order("created_at", desc=True).execute()
    return result.data


@router.post("/")
async def create_project(data: ProjectCreate):
    project = Project(**data.model_dump())
    db = get_db()
    db.table("projects").insert(project.model_dump()).execute()
    return project


@router.get("/{project_id}")
async def get_project(project_id: str):
    db = get_db()
    result = db.table("projects").select("*").eq("id", project_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return result.data


@router.post("/{project_id}/upload-audio")
async def upload_audio(project_id: str, file: UploadFile = File(...)):
    audio_url = await upload_file(file, f"projects/{project_id}/audio/{file.filename}")
    db = get_db()
    db.table("projects").update({
        "audio_url": audio_url,
        "stage": "uploaded"
    }).eq("id", project_id).execute()
    # Kick off analysis automatically
    run_audio_analysis.delay(project_id)
    return {"audio_url": audio_url, "message": "Audio uploaded, analysis started"}
