"""
Tests for the Lyric Video v1 render path (services/video_assembler.py's
build_lyric_timeline / render_lyric_video_with_remotion / assemble_lyric_video).

build_lyric_timeline is tested directly (pure logic, no subprocess).
render_lyric_video_with_remotion's actual `npx remotion render` call is
mocked here — the real Remotion CLI invocation, the "/public/<filename>"
asset-path requirement (Remotion's asset server 404s on any other form,
confirmed by direct rendering + frame-level visual inspection during
development), and the rendered output's visual correctness were verified
manually and are not re-verified by CI, which doesn't set up Node/Chromium
for the backend job. What's tested here is this module's own plumbing:
building the props/timeline correctly, copying audio into
remotion-composer/public/ under a project-scoped filename, and cleaning up
after itself — regressions in that logic are real risks independent of
whether Remotion itself is exercised.
"""
import json
import subprocess
from pathlib import Path

import pytest

from services import video_assembler


def test_build_lyric_timeline_computes_duration_from_segments(monkeypatch, tmp_path):
    monkeypatch.setattr(video_assembler, "_probe_media_duration", lambda ffmpeg, path: None)
    monkeypatch.setattr(video_assembler, "find_ffmpeg", lambda: "ffmpeg")

    segments = [
        {"start": 0.0, "end": 2.0, "text": "hello there"},
        {"start": 2.0, "end": 4.5, "text": "goodbye now"},
    ]
    timeline = video_assembler.build_lyric_timeline(str(tmp_path / "audio.wav"), segments, fps=25)

    assert timeline["fps"] == 25
    assert timeline["durationInFrames"] == int(4.5 * 25)
    assert timeline["segments"] == segments
    assert timeline["backgroundColor"]
    assert timeline["audioSrc"] == ""  # filled in later by the renderer, not here


def test_build_lyric_timeline_drops_blank_segments_and_uses_audio_duration_floor(monkeypatch, tmp_path):
    monkeypatch.setattr(video_assembler, "_probe_media_duration", lambda ffmpeg, path: 10.0)
    monkeypatch.setattr(video_assembler, "find_ffmpeg", lambda: "ffmpeg")

    segments = [
        {"start": 0.0, "end": 2.0, "text": "hello there"},
        {"start": 2.0, "end": 3.0, "text": "   "},  # blank text — must be dropped
    ]
    timeline = video_assembler.build_lyric_timeline(str(tmp_path / "audio.wav"), segments, fps=25)

    assert len(timeline["segments"]) == 1
    # audio is longer than the last real segment's end — duration should
    # cover the full song, not truncate at the last lyric line.
    assert timeline["durationInFrames"] == int(10.0 * 25)


def test_render_lyric_video_copies_audio_to_public_dir_with_correct_prefix(monkeypatch, tmp_path):
    remotion_dir = tmp_path / "remotion-composer"
    remotion_dir.mkdir()
    monkeypatch.setattr(video_assembler, "REMOTION_DIR", remotion_dir)
    monkeypatch.setattr(video_assembler, "upload_file_path", lambda path, key, content_type: f"https://storage.test/{key}")

    audio_path = tmp_path / "source_audio.wav"
    audio_path.write_bytes(b"fake-wav-bytes")

    captured = {}

    def fake_run(cmd, cwd, capture_output, text, timeout):
        captured["cmd"] = cmd
        captured["cwd"] = cwd
        props_path = next(arg for arg in cmd if arg.startswith("--props=")).split("=", 1)[1]
        captured["props"] = json.loads(Path(props_path).read_text())
        # the copied audio file must exist at render time, inside public/
        captured["public_audio_exists"] = list((remotion_dir / "public").glob("proj123_audio*"))
        out_path = Path(cmd[4])
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"fake-mp4-bytes")
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")

    monkeypatch.setattr(video_assembler.subprocess, "run", fake_run)

    timeline = {"fps": 25, "durationInFrames": 50, "segments": [], "backgroundColor": "#111111"}
    url = video_assembler.render_lyric_video_with_remotion("proj123", str(audio_path), timeline)

    assert url == "https://storage.test/projects/proj123/videos/lyric_video.mp4"
    assert captured["cmd"][:4] == ["npx", "remotion", "render", "LyricVideo"]
    assert captured["cwd"] == str(remotion_dir)

    # audioSrc must use the verified "/public/<filename>" form — a bare
    # "/<filename>" or a file:// URI both 404 against Remotion's asset
    # server, confirmed by direct rendering (see module docstring).
    assert captured["props"]["audioSrc"] == "/public/proj123_audio.wav"
    assert len(captured["public_audio_exists"]) == 1

    # cleaned up again after the render — public/ must not accumulate audio
    # files across renders.
    public_audio_files = list((remotion_dir / "public").glob("proj123_audio*"))
    assert public_audio_files == [], f"public audio file was not cleaned up: {public_audio_files}"


def test_render_lyric_video_raises_clear_error_when_composer_missing(tmp_path, monkeypatch):
    missing_dir = tmp_path / "does-not-exist"
    monkeypatch.setattr(video_assembler, "REMOTION_DIR", missing_dir)
    with pytest.raises(RuntimeError, match="remotion-composer"):
        video_assembler.render_lyric_video_with_remotion("proj1", str(tmp_path / "a.wav"), {})
