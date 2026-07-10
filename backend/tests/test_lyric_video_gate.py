"""
Verifies the Lyric Video v1 render gate (issue #29): generate-lyric-video
only accepts pure "lyric" production_paths projects, requires the same
upstream sections run-song-analysis does, and dispatches
run_lyric_video_assembly through the standard manual-worker background
pattern.
"""
import uuid

from database import db_create_project, db_get_project, db_update_project
from services.workbook_status import set_section_status


def _make_project(production_paths, stage="info_confirmed") -> str:
    project_id = str(uuid.uuid4())
    db_create_project(project_id, "Lyric Video Test", "Artist", production_paths=production_paths)
    db_update_project(project_id, stage=stage, transcript={"segments": [{"start": 0.0, "end": 1.0, "text": "test"}]})
    for section in ("project_setup", "song_file", "rhythm_key", "lyrics"):
        set_section_status(project_id, section, "approved", message="test setup")
    return project_id


def test_generate_lyric_video_rejects_non_pure_lyric_projects(client):
    project_id = _make_project(["cinematic"])
    r = client.post(f"/api/pipeline/{project_id}/generate-lyric-video")
    assert r.status_code == 400, r.text
    assert "lyric" in r.json()["detail"].lower()


def test_generate_lyric_video_rejects_hybrid_lyric_projects(client):
    project_id = _make_project(["lyric", "karaoke"])
    r = client.post(f"/api/pipeline/{project_id}/generate-lyric-video")
    assert r.status_code == 400, r.text


def test_generate_lyric_video_rejects_missing_prerequisites(client):
    project_id = str(uuid.uuid4())
    db_create_project(project_id, "No Prereqs", "Artist", production_paths=["lyric"])
    db_update_project(project_id, stage="info_confirmed")
    # Realistic pre-state: required_sections gating only activates once *any*
    # section_statuses exist (legacy-project bootstrapping) — a project with
    # none at all silently bypasses the check entirely (see
    # test_workbook_dispatch.py). Approving exactly one of the four required
    # sections keeps the gate active while leaving the real condition under
    # test (the other three still missing) genuinely unmet.
    set_section_status(project_id, "project_setup", "approved", message="test setup")
    r = client.post(f"/api/pipeline/{project_id}/generate-lyric-video")
    assert r.status_code == 400, r.text
    assert "Approve these workbook sections" in r.json()["detail"]


def test_generate_lyric_video_dispatches_for_pure_lyric_project(client, monkeypatch):
    project_id = _make_project(["lyric"])

    called = {"n": 0}

    def fake_assembly(pid):
        called["n"] += 1

    from workers import pipeline_worker
    monkeypatch.setattr(pipeline_worker, "run_lyric_video_assembly", fake_assembly)

    r = client.post(f"/api/pipeline/{project_id}/generate-lyric-video")
    assert r.status_code == 200, r.text
    assert "started" in r.json()["message"]

    import time
    for _ in range(20):
        if called["n"] == 1:
            break
        time.sleep(0.05)
    assert called["n"] == 1

    project = db_get_project(project_id)
    assert project["section_statuses"]["final_video"]["status"] == "running"
