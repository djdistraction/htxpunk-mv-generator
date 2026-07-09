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
"""
import subprocess

import imageio_ffmpeg


def _make_test_wav(path: str, seconds: float = 2.0) -> None:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [ffmpeg, "-y", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
         "-ac", "1", "-ar", "16000", path],
        check=True, capture_output=True,
    )


def test_guided_audio_flow_reaches_info_review(client, test_storage_dir, tmp_path, monkeypatch):
    # api/projects.py's guided_transcribe_lyrics does
    # `from services.audio_analyzer import transcribe_audio` lazily, inside
    # the endpoint function — patching the source module's attribute is
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
    assert r.json()["project"]["stage"] == "audio_prepared"

    r = client.post(f"/api/projects/{pid}/guided/read-metadata")
    assert r.status_code == 200, r.text
    assert r.json()["project"]["stage"] == "metadata_ready"

    r = client.post(f"/api/projects/{pid}/guided/isolate-vocals")
    assert r.status_code == 200, r.text
    assert r.json()["project"]["stage"] == "vocals_ready"

    r = client.post(f"/api/projects/{pid}/guided/transcribe-lyrics")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["project"]["stage"] == "awaiting_project_info_review"
    assert body["result"]["segments"] == 1
