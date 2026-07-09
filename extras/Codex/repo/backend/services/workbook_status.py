from datetime import datetime

from fastapi import HTTPException

from database import db_get_project, db_update_project


WORKBOOK_SECTIONS = {
    "project_setup",
    "song_file",
    "rhythm_key",
    "lyrics",
    "song_analysis",
    "treatment",
    "element_plan",
    "element_images",
    "shot_manifest",
    "storyboard_images",
    "final_video",
    "lip_sync",
}

WORKBOOK_STATUSES = {
    "empty",
    "locked",
    "ready",
    "running",
    "generated",
    "approved",
    "rejected",
    "failed",
    "skipped",
}


def validate_section_key(section_key: str) -> str:
    key = section_key.strip().lower().replace("-", "_")
    if key not in WORKBOOK_SECTIONS:
        raise HTTPException(status_code=404, detail=f"Unknown workbook section: {section_key}")
    return key


def get_section_statuses(project: dict | None) -> dict:
    statuses = (project or {}).get("section_statuses") or {}
    return statuses if isinstance(statuses, dict) else {}


def set_section_status(
    project_id: str,
    section_key: str,
    status: str,
    *,
    message: str = "",
    error: str = "",
) -> dict:
    section_key = validate_section_key(section_key)
    if status not in WORKBOOK_STATUSES:
        raise HTTPException(status_code=400, detail=f"Unsupported workbook status: {status}")

    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    statuses = get_section_statuses(project)
    previous = statuses.get(section_key) if isinstance(statuses.get(section_key), dict) else {}
    statuses[section_key] = {
        **previous,
        "status": status,
        "message": message,
        "error": error,
        "updated_at": datetime.utcnow().isoformat(),
    }
    if status == "approved":
        statuses[section_key]["approved_at"] = datetime.utcnow().isoformat()
    if status == "rejected":
        statuses[section_key]["rejected_at"] = datetime.utcnow().isoformat()

    db_update_project(project_id, section_statuses=statuses)
    return db_get_project(project_id)


def section_status(project: dict | None, section_key: str) -> str:
    entry = get_section_statuses(project).get(section_key)
    if isinstance(entry, dict):
        value = entry.get("status")
        if isinstance(value, str):
            return value
    return ""


def section_is_approved(project: dict | None, section_key: str) -> bool:
    return section_status(project, section_key) == "approved"
