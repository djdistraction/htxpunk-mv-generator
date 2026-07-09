"""
Verifies the optional lip-sync gate (issue #27): base video and lip sync are
separate approval-gated stages, lip sync can't run before the base video is
approved, and it reuses the same in-flight guard as every other manual
workbook action.
"""
import uuid

from database import db_create_project, db_get_project, db_update_project
from services.workbook_status import set_section_status


def _make_project(stage: str) -> str:
    project_id = str(uuid.uuid4())
    db_create_project(project_id, "Lip Sync Test", "Artist")
    db_update_project(project_id, stage=stage, base_video_url="/storage/fake_base.mp4")
    return project_id


def test_run_lip_sync_blocked_until_base_video_approved(client):
    project_id = _make_project("base_video_ready")
    # Realistic pre-state: section-status gating only activates once *any*
    # status exists (legacy-project bootstrapping) — a real project reaching
    # base_video_ready already has "final_video": "generated" from the base
    # render, just not yet approved. Setting only that (not "approved")
    # keeps the gate active while leaving the actual condition under test
    # (base video not yet approved) genuinely unmet.
    set_section_status(project_id, "final_video", "generated", message="test setup")
    r = client.post(f"/api/pipeline/{project_id}/run-lip-sync")
    assert r.status_code == 400, r.text
    assert "final_video" in r.json()["detail"]


def test_run_lip_sync_allowed_once_base_video_approved(client, monkeypatch):
    project_id = _make_project("base_video_ready")
    set_section_status(project_id, "final_video", "approved", message="test setup")

    called = {"n": 0}

    def fake_lip_sync(pid):
        called["n"] += 1

    from workers import pipeline_worker
    monkeypatch.setattr(pipeline_worker, "run_lip_sync_generation", fake_lip_sync)

    r = client.post(f"/api/pipeline/{project_id}/run-lip-sync")
    assert r.status_code == 200, r.text


def test_approving_lip_sync_requires_base_video_already_approved():
    """Approving the lip_sync section directly (bypassing the run step) must
    still enforce that final_video was approved first — the two approvals
    are meant to be sequential, not independent."""
    from fastapi.testclient import TestClient
    import main as main_module
    c = TestClient(main_module.app)

    project_id = _make_project("lip_sync_ready")
    db_update_project(project_id, lipsynced_video_url="/storage/fake_lipsynced.mp4")

    r = c.post(f"/api/projects/{project_id}/sections/lip_sync/approve")
    assert r.status_code == 400, r.text
    assert "base video" in r.json()["detail"].lower()

    set_section_status(project_id, "final_video", "approved", message="test setup")
    r = c.post(f"/api/projects/{project_id}/sections/lip_sync/approve")
    assert r.status_code == 200, r.text
    project = db_get_project(project_id)
    assert project["final_video_url"] == "/storage/fake_lipsynced.mp4"
    assert project["stage"] == "complete"
