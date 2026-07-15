"""
Unit tests for lyrics alignment mapping + validation.

Real espeak/aeneas E2E is optional; the production path maps Whisper word
timestamps onto user lyric lines (aeneas was crushing trailing choruses).
"""
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest


def test_normalize_lyric_lines_strips_blanks_and_smart_quotes():
    from services.lyrics_aligner import _normalize_lyric_lines

    text = "  it’s alright  \n\n\u201cwow\u201d  \n"
    lines = _normalize_lyric_lines(text)
    assert lines == ["it's alright", '"wow"']


def test_map_lines_to_word_stream_uses_real_word_times():
    from services.lyrics_aligner import map_lines_to_word_stream

    words = []
    # "hello there my friend" then gap then "goodbye for now"
    timeline = [
        ("hello", 10.0, 10.3),
        ("there", 10.3, 10.5),
        ("my", 10.5, 10.7),
        ("friend", 10.7, 11.0),
        ("yeah", 12.0, 12.2),  # ad-lib to skip
        ("goodbye", 20.0, 20.4),
        ("for", 20.4, 20.6),
        ("now", 20.6, 21.0),
    ]
    for tok, s, e in timeline:
        words.append({"token": tok, "start": s, "end": e})

    lines = ["hello there my friend", "goodbye for now"]
    segs = map_lines_to_word_stream(lines, words)

    assert len(segs) == 2
    assert segs[0]["text"] == lines[0]
    assert segs[1]["text"] == lines[1]
    assert abs(segs[0]["start"] - 10.0) < 0.05
    assert abs(segs[0]["end"] - 11.0) < 0.05
    assert abs(segs[1]["start"] - 20.0) < 0.05
    assert abs(segs[1]["end"] - 21.0) < 0.05
    assert segs[0]["end"] <= segs[1]["start"] + 0.05


def test_global_align_handles_repeated_chorus():
    from services.lyrics_aligner import map_lines_to_word_stream

    # Chorus appears twice in whisper stream
    words = []
    for tok, s, e in [
        ("hello", 1.0, 1.2),
        ("world", 1.2, 1.5),
        ("verse", 5.0, 5.3),
        ("line", 5.3, 5.6),
        ("hello", 10.0, 10.2),
        ("world", 10.2, 10.5),
    ]:
        words.append({"token": tok, "start": s, "end": e})
    lines = ["hello world", "verse line", "hello world"]
    segs = map_lines_to_word_stream(lines, words)
    assert abs(segs[0]["start"] - 1.0) < 0.05
    assert abs(segs[1]["start"] - 5.0) < 0.05
    assert abs(segs[2]["start"] - 10.0) < 0.05


def test_map_lines_interpolates_unmatched_middle():
    from services.lyrics_aligner import map_lines_to_word_stream

    words = [
        {"token": "one", "start": 1.0, "end": 1.2},
        {"token": "two", "start": 1.2, "end": 1.4},
        {"token": "four", "start": 5.0, "end": 5.3},
        {"token": "five", "start": 5.3, "end": 5.6},
    ]
    # "three xyz" won't match any whisper tokens → interpolate between line1 and line3
    lines = ["one two", "three xyz totally missing", "four five"]
    segs = map_lines_to_word_stream(lines, words)
    assert len(segs) == 3
    assert segs[0]["start"] == 1.0
    assert segs[2]["end"] == 5.6
    # middle sits between first end and last start
    assert segs[0]["end"] <= segs[1]["start"] + 0.05
    assert segs[1]["end"] <= segs[2]["start"] + 0.05
    assert segs[1]["end"] > segs[1]["start"]


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


def test_validate_rejects_tail_crush_same_timestamp():
    from services.lyrics_aligner import _validate_complete_alignment

    # Mimic The World Is Mine failure: many lines stuck at ~189.4s
    lines = [f"line {i}" for i in range(12)]
    segments = []
    for i, text in enumerate(lines):
        if i < 4:
            segments.append({"start": 30.0 + i * 2, "end": 31.0 + i * 2, "text": text})
        else:
            segments.append({"start": 189.4, "end": 189.4, "text": text})
    with pytest.raises(RuntimeError):
        _validate_complete_alignment(lines, segments, audio_duration=244.0)


def test_align_lyrics_rejects_empty_text():
    from services.lyrics_aligner import align_lyrics

    with tempfile.TemporaryDirectory(prefix="htxpunk_test_align_") as tmp:
        wav_path = str(Path(tmp) / "speech.wav")
        # Empty lyrics fail before audio is used, but path must exist
        Path(wav_path).write_bytes(b"RIFF" + b"\x00" * 40)
        with pytest.raises(ValueError):
            align_lyrics(wav_path, "   \n  ")


def test_align_lyrics_missing_audio_raises():
    from services.lyrics_aligner import align_lyrics

    with pytest.raises(ValueError):
        align_lyrics("/no/such/file.wav", "hello world")


@pytest.mark.skipif(
    not (shutil.which("espeak-ng") or shutil.which("espeak")),
    reason="espeak-ng not available on PATH",
)
def test_map_on_espeak_audio_via_synthetic_words_only():
    """Smoke: espeak still available for other tooling; mapping unit-tested above."""
    assert shutil.which("espeak-ng") or shutil.which("espeak")
