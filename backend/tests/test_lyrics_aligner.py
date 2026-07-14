"""
Real (non-mocked) forced-alignment test for services/lyrics_aligner.py.

Synthesizes a short speech clip with espeak-ng at test time and aligns the
same text against it — cheap enough (a few lines, no models to download)
to run for real in CI rather than mocking, unlike the Whisper/audio-separator
paths in test_guided_flow_smoke.py.
"""
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(
    not (shutil.which("espeak-ng") or shutil.which("espeak")),
    reason="espeak-ng not available on PATH",
)


def _espeak_binary() -> str:
    return shutil.which("espeak-ng") or shutil.which("espeak")


def test_align_lyrics_produces_ordered_segments():
    from services.lyrics_aligner import align_lyrics

    lines = [
        "hello there my friend",
        "this is a test of alignment",
        "goodbye for now",
    ]
    utterance = ". ".join(lines) + "."

    with tempfile.TemporaryDirectory(prefix="htxpunk_test_align_") as tmp:
        wav_path = str(Path(tmp) / "speech.wav")
        subprocess.run([_espeak_binary(), "-s", "150", "-w", wav_path, utterance], check=True)

        segments = align_lyrics(wav_path, "\n".join(lines))

    assert [seg["text"] for seg in segments] == lines
    for prev, cur in zip(segments, segments[1:]):
        assert prev["end"] <= cur["start"] + 0.01
    for seg in segments:
        assert seg["end"] > seg["start"]


def test_align_lyrics_rejects_empty_text():
    from services.lyrics_aligner import align_lyrics

    with tempfile.TemporaryDirectory(prefix="htxpunk_test_align_") as tmp:
        wav_path = str(Path(tmp) / "speech.wav")
        subprocess.run([_espeak_binary(), "-s", "150", "-w", wav_path, "hello world."], check=True)

        with pytest.raises(ValueError):
            align_lyrics(wav_path, "   \n  ")


def test_align_lyrics_missing_audio_raises():
    from services.lyrics_aligner import align_lyrics

    with pytest.raises(ValueError):
        align_lyrics("/no/such/file.wav", "hello world")


def test_normalize_lyric_lines_strips_blanks_and_smart_quotes():
    from services.lyrics_aligner import _normalize_lyric_lines

    text = "  it’s alright  \n\n\u201cwow\u201d  \n"
    lines = _normalize_lyric_lines(text)
    assert lines == ["it's alright", '"wow"']


def test_validate_complete_alignment_rejects_partial():
    from services.lyrics_aligner import _validate_complete_alignment

    lines = ["one", "two", "three", "four"]
    partial = [
        {"start": 0.0, "end": 1.0, "text": "one"},
        {"start": 1.0, "end": 2.0, "text": "two"},
    ]
    with pytest.raises(RuntimeError, match="Alignment incomplete"):
        _validate_complete_alignment(lines, partial, audio_duration=120.0)

    crushed = [
        {"start": 0.0, "end": 1.0, "text": "one"},
        {"start": 1.0, "end": 2.0, "text": "two"},
        {"start": 2.0, "end": 3.0, "text": "three"},
        {"start": 3.0, "end": 4.0, "text": "four"},
    ]
    with pytest.raises(RuntimeError, match="covers only"):
        _validate_complete_alignment(lines, crushed, audio_duration=120.0)
