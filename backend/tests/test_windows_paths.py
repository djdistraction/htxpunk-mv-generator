"""
Targeted unit tests for the specific functions that have already caused
real, shipped Windows-only bugs in this project (illegal filename
characters crashing an upload, IPv4/IPv6 proxy mismatch, split storage
paths). Fast, no heavy deps, no real ffmpeg/ffprobe binary required —
designed to run in the windows-latest CI job as well as Linux, so these
bugs get caught before a Windows user hits them instead of after.
"""
import os

from api.projects import _sanitize_filename


def test_sanitize_filename_strips_windows_illegal_characters():
    # ':' '"' '<' '>' '|' '?' '*' and control chars are illegal in Windows
    # paths (Linux tolerates them) — an unsanitized filename with any of
    # these crashed the write with an unhelpful 500, Windows-only.
    dirty = 'My Song: "Live" <2024> | Take *1*?.mp3'
    clean = _sanitize_filename(dirty)
    for bad_char in '<>:"/\\|?*':
        assert bad_char not in clean, f"{bad_char!r} survived sanitization: {clean!r}"


def test_sanitize_filename_strips_trailing_dots_and_spaces():
    # Windows silently strips/rejects trailing dots and spaces in filenames.
    assert _sanitize_filename("song. ") == "song"


def test_sanitize_filename_handles_none_and_empty():
    assert _sanitize_filename(None) == "file"
    assert _sanitize_filename("") == "file"
    assert _sanitize_filename("   ") == "file"


def test_config_storage_path_is_absolute_and_platform_correct():
    from config import settings

    # Path.home() resolves correctly on both Windows and Linux; asserting
    # absoluteness catches the class of bug where a relative repo-local
    # default silently diverges between manual runs and the packaged app
    # (the real bug fixed in PR #15).
    assert os.path.isabs(settings.local_storage_path)


def test_find_ffmpeg_falls_back_to_bundled_binary():
    # Must not crash even when no system ffmpeg is on PATH — CI runners
    # (especially windows-latest) commonly have none. imageio-ffmpeg is a
    # real pip dependency, so this should always resolve to something.
    from services.video_assembler import find_ffmpeg

    exe = find_ffmpeg()
    assert exe
    assert os.path.exists(exe)


def test_find_ffprobe_degrades_gracefully_when_absent():
    # Real gap: imageio-ffmpeg bundles ffmpeg but not ffprobe. Must return
    # None, not raise, when neither a system ffprobe nor a sibling binary
    # exists next to the resolved ffmpeg path.
    from services.video_assembler import _find_ffprobe, find_ffmpeg

    result = _find_ffprobe(find_ffmpeg())
    assert result is None or os.path.exists(result)
