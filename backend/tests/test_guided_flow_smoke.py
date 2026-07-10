"""
End-to-end smoke test for the guided audio-prep flow (issue #19), in
placeholder mode so it needs no real API keys or network model downloads.

Uses the user-provided-vocal-stem upload path to skip real vocal
separation (a legitimate, already-supported flow, not a test-only shortcut),
and mocks transcribe_audio — the one remaining step that would otherwise
need to download a real Whisper model — so the whole test is fast and
deterministic in CI.

This is exactly the manual verification run by hand repeatedly during
development of the guided-flow endpoints; it existed as a throwaway script
each time instead of a permanent test until now.

guided/* steps now dispatch to a background thread (see
_start_guided_worker in api/projects.py) instead of blocking the request —
a real bug found via manual testing (a slow guided step made the whole
server, including /health, stop responding to everything else; see
docs/lyric-karaoke-module-implementation-plan.md and
testing-notes/2026-07-10-pipeline-run.md). Steps below poll project state
after each POST instead of reading the result out of the POST response
body, matching that new contract.
"""
import subprocess
import time

import imageio_ffmpeg


def _make_test_wav(path: str, seconds: float = 2.0) -> None:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [ffmpeg, "-y", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
         "-ac", "1", "-ar", "16000", path],
        check=True, capture_output=True,
    )


def _wait_for_stage(client, pid, expected_stage, timeout=10.0):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = client.get(f"/api/projects/{pid}")
        last = r.json()
        if last.get("stage") == expected_stage:
            return last
        time.sleep(0.05)
    raise AssertionError(f"stage never reached {expected_stage!r}, last seen: {last}")


def test_guided_audio_flow_reaches_info_review(client, test_storage_dir, tmp_path, monkeypatch):
    # api/projects.py's guided_transcribe_lyrics does
    # `from services.audio_analyzer import transcribe_audio` lazily, inside
    # the worker closure. patching the source module's attribute is
    # picked up at call time since that import statement re-resolves it.
    import services.audio_analyzer as audio_analyzer
    monkeypatch.setattr(
        audio_analyzer, "transcribe_audio",
        lambda *a, **k: {"segments": [{"start": 0.0, "end": 1.0, "text": "test lyric"}]},
    )

    song_path = tmp_path / "song.wav"
    vocals_path = tmp_path / "vocals.wav"
    _make_test_wav(str(song_path))
    _make_test_wav(str(vocals_path))

    with open(song_path, "rb") as song_f, open(vocals_path, "rb") as vocals_f:
        r = client.post(
            "/api/projects/upload-audio",
            data={"title": "CI Smoke Test Song", "bpm": "", "musical_key": "", "beat_grid": ""},
            files={
                "file": ("song.wav", song_f, "audio/wav"),
                "vocals_file": ("vocals.wav", vocals_f, "audio/wav"),
            },
        )
    assert r.status_code == 200, r.text
    project = r.json()
    pid = project["id"]
    assert project["stage"] == "audio_uploaded"
    assert project["user_vocals_url"]

    r = client.post(
        f"/api/projects/{pid}/guided/analyze-rhythm-key",
        json={"bpm": "120", "musical_key": "C major", "beat_grid": [0.5, 1.0]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["stage"] == "rhythm_key_analyzed"

    r = client.post(f"/api/projects/{pid}/guided/prepare-audio")
    assert r.status_code == 200, r.text
    assert "started" in r.json()["message"]
    _wait_for_stage(client, pid, "audio_prepared")

    r = client.post(f"/api/projects/{pid}/guided/read-metadata")
    assert r.status_code == 200, r.text
    _wait_for_stage(client, pid, "metadata_ready")

    r = client.post(f"/api/projects/{pid}/guided/isolate-vocals")
    assert r.status_code == 200, r.text
    _wait_for_stage(client, pid, "vocals_ready")

    r = client.post(f"/api/projects/{pid}/guided/transcribe-lyrics")
    assert r.status_code == 200, r.text
    final = _wait_for_stage(client, pid, "awaiting_project_info_review")
    assert final["transcript"]["segments"][0]["text"] == "test lyric"


def test_guided_step_returns_immediately_while_work_runs_in_background(client, test_storage_dir, tmp_path, monkeypatch):
    """The actual regression: a slow guided step must not block the request.

    Confirmed as a real bug via manual testing — a plain GET /health hung
    for the full duration of an in-progress isolate-vocals call, because
    the CPU-bound work ran inline in the async route handler. This proves
    the fix's behavioral contract directly: the POST returns fast even
    when the underlying work is slow, and the work still completes
    correctly in the background.
    """
    import services.audio_preprocessor as audio_preprocessor
    import threading

    release = threading.Event()
    entered = threading.Event()

    def slow_separate_vocals(mp3_path, tmp_dir):
        entered.set()
        release.wait(timeout=5)
        import shutil
        out = str(tmp_path / "slow_vocals.wav")
        shutil.copy(mp3_path, out)
        return out

    monkeypatch.setattr(audio_preprocessor, "separate_vocals", slow_separate_vocals)

    song_path = tmp_path / "song2.wav"
    _make_test_wav(str(song_path))
    with open(song_path, "rb") as song_f:
        r = client.post(
            "/api/projects/upload-audio",
            data={"title": "Background Dispatch Test", "bpm": "", "musical_key": "", "beat_grid": ""},
            files={"file": ("song2.wav", song_f, "audio/wav")},
        )
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    client.post(f"/api/projects/{pid}/guided/prepare-audio")
    _wait_for_stage(client, pid, "audio_prepared")

    t0 = time.time()
    r = client.post(f"/api/projects/{pid}/guided/isolate-vocals")
    dispatch_time = time.time() - t0
    assert r.status_code == 200, r.text
    assert dispatch_time < 2.0, f"guided/isolate-vocals blocked the request for {dispatch_time:.2f}s"

    # The background thread must actually be inside the slow call by now —
    # otherwise this test would trivially pass even without the fix.
    assert entered.wait(timeout=5), "background worker never started"

    # While the "slow" job is still running, an unrelated request must
    # still get a fast, correct response — this is the actual bug.
    t0 = time.time()
    health = client.get("/health")
    health_time = time.time() - t0
    assert health.status_code == 200
    assert health_time < 2.0, f"/health blocked for {health_time:.2f}s while a guided step was running"

    release.set()
    _wait_for_stage(client, pid, "vocals_ready")
