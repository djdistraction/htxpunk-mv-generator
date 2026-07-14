"""
Forced alignment of user-supplied lyrics against real audio, via aeneas.

Why this exists: Whisper transcription can come out significantly wrong on a
full instrumental+vocal mix — not hallucinated nonsense, clearly the right
song, but missing whole lines. The existing transcript editor only supports
minor per-line text edits; there's no way to fix missing lines because
there's no way to produce correct timestamps for text the model never
transcribed in the first place. If the user already knows the real lyrics,
forced alignment gives exact timestamps for that exact text instead of
asking the model to guess again.

aeneas (last released 2018) needs several things to work on a modern stack,
each confirmed by real end-to-end testing (including hitting the failure
first, not just installing it and assuming success):

1. Build time: `AENEAS_WITH_CEW=False`, `AENEAS_WITH_CDTW=False`,
   `AENEAS_WITH_CMFCC=False` skip ALL of its optional C extensions, so
   installing it never needs a C/C++ compiler on any platform — confirmed a
   real blocker on Windows without Visual C++ Build Tools installed. The
   pure-Python/subprocess fallback for all three is plenty fast at this
   scale (benchmarked: ~5s wall time to align 30 lines against 94s of
   audio). Also needs `python scripts/prepare_aeneas_install.py` run first
   (same Python, right before installing requirements-aeneas.txt): its
   setup.py unconditionally imports `numpy.distutils`, which NumPy removed
   entirely on Python >= 3.12 (no numpy version restores it there) — that
   script shims in the one function aeneas actually needs from it, a no-op
   on Python < 3.12. All of this is set by run.py / electron-app's
   dependency install step and by CI, not here — this module only needs it
   to have already happened at install time. See requirements-aeneas.txt
   for the full rationale on each piece.
2. Runtime: its vendored wavfile.py calls `numpy.fromstring(data,
   dtype=...)` in binary mode, removed in current NumPy. Patched below,
   scoped to aeneas's own call pattern only.

Also requires `espeak`/`espeak-ng` and `ffmpeg`+`ffprobe` on PATH at
runtime — aeneas's algorithm synthesizes each text fragment via TTS and
DTW-aligns it against the real audio, so espeak is central to how it works,
not a side feature. ffprobe specifically has no bundled fallback in this
app (imageio-ffmpeg only bundles ffmpeg) — see _check_prerequisites().

aeneas defaults to the classic `espeak` binary (`ESPEAKTTSWrapper`), which
most modern distros no longer ship (`espeak-ng` replaced it). That engine
choice is a *runtime* config (`RuntimeConfiguration(tts=...)`), not a task
config — passing `tts=espeak-ng` in the task's own config string is silently
ignored, confirmed by hitting exactly that dead end. _tts_engine_config()
below picks whichever binary is actually present.

Alignment quality fixes (confirmed against real user reports):
- First line pinned at 0:00 despite instrumental intro → enable aeneas
  head/tail detection so the first real lyric line is not stretched over
  the intro.
- Large trailing chunks of provided lyrics missing from the sync map →
  validate every input line appears in the output and fail clearly instead
  of silently returning a partial transcript. Also sanitize characters that
  cause espeak/aeneas to drop fragments, and refuse impossibly short
  coverage vs. the real audio duration.
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile

import numpy as _np

logger = logging.getLogger(__name__)


def _patch_numpy_fromstring():
    """aeneas/wavfile.py calls numpy.fromstring(bytes, dtype=...) with no
    `sep` argument, which NumPy now hard-errors on for binary data (removed
    in favor of frombuffer). Redirect just that call shape; anything passing
    a real `sep` (actual string-parsing usage, not aeneas's) still goes
    through the untouched original."""
    if getattr(_np, "_aeneas_fromstring_patched", False):
        return
    _original_fromstring = _np.fromstring
    _original_frombuffer = _np.frombuffer

    def _fromstring_compat(data, dtype=float, count=-1, sep=""):
        if sep == "":
            return _original_frombuffer(data, dtype=dtype, count=count)
        return _original_fromstring(data, dtype=dtype, count=count, sep=sep)

    _np.fromstring = _fromstring_compat
    _np._aeneas_fromstring_patched = True


def _check_prerequisites():
    missing = []
    if not (shutil.which("espeak-ng") or shutil.which("espeak")):
        missing.append("espeak-ng (or espeak)")
    if not shutil.which("ffprobe"):
        missing.append("ffprobe (install ffmpeg system-wide — the bundled imageio-ffmpeg binary doesn't include ffprobe)")
    if missing:
        raise RuntimeError(
            "Lyric alignment requires " + " and ".join(missing) +
            " on PATH. Install the missing tool(s) and try again."
        )


def _tts_engine_config():
    """aeneas's default TTS engine is classic `espeak`; explicitly select
    `espeak-ng` when that's what's actually on PATH (the common case on
    modern distros), otherwise leave the default in place."""
    from aeneas.runtimeconfiguration import RuntimeConfiguration

    if shutil.which("espeak-ng") and not shutil.which("espeak"):
        return RuntimeConfiguration("tts=espeak-ng")
    return RuntimeConfiguration()


def _probe_duration_seconds(audio_path: str) -> float | None:
    """Best-effort audio duration via ffprobe. None if probing fails."""
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    try:
        result = subprocess.run(
            [
                ffprobe,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                audio_path,
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        if result.returncode != 0:
            return None
        return float(result.stdout.strip())
    except (ValueError, OSError, subprocess.SubprocessError):
        return None


def _normalize_lyric_lines(lyrics_text: str) -> list[str]:
    """Split lyrics into alignable plain-text lines.

    - Drops blank lines (aeneas plain text treats each non-empty line as a fragment).
    - Normalizes smart quotes / odd unicode that cause espeak to drop fragments.
    - Collapses internal whitespace.
    """
    # Map common "smart" punctuation to espeak-safe ASCII equivalents.
    translations = str.maketrans({
        "\u2018": "'",  # ‘
        "\u2019": "'",  # ’
        "\u201c": '"',  # “
        "\u201d": '"',  # ”
        "\u2013": "-",  # –
        "\u2014": "-",  # —
        "\u2026": "...",  # …
        "\u00a0": " ",  # nbsp
    })
    lines: list[str] = []
    for raw in lyrics_text.splitlines():
        line = raw.translate(translations).strip()
        if not line:
            continue
        # Strip decorative stage directions in brackets that aren't sung,
        # but keep the rest of the line. Full-line bracket tags like
        # "[Chorus]" are kept as structure if the user included them —
        # aeneas can still place them; users who don't want them can remove
        # them before aligning.
        line = re.sub(r"[ \t]+", " ", line)
        lines.append(line)
    return lines


def _task_config_string(language: str) -> str:
    """Build aeneas task config.

    Head/tail detection: music videos almost always have instrumental intro
    and/or outro. Without head detection aeneas pins the first lyric line at
    0:00 and stretches it over the intro — the classic "first line at 0:00
    is wrong" failure mode.

    Boundary percent adjustment: places boundaries between adjacent fragments
    at the midpoint of the free gap rather than leaving aeneas's raw DTW
    edges, which tends to absorb silence into the previous line.
    """
    return "|".join([
        f"task_language={language}",
        "is_text_type=plain",
        "os_task_file_format=json",
        # Detect instrumental intro/outro rather than pinning first/last lines
        # to the absolute start/end of the audio file.
        "is_audio_file_detect_head_min=0.1000",
        "is_audio_file_detect_head_max=90.0000",
        "is_audio_file_detect_tail_min=0.1000",
        "is_audio_file_detect_tail_max=60.0000",
        # Place boundaries between fragments at mid-gap.
        "task_adjust_boundary_algorithm=percent",
        "task_adjust_boundary_percent_value=50",
        # Keep zero-length fragments out of the output.
        "task_adjust_boundary_no_zero=True",
    ])


def _validate_complete_alignment(
    lines: list[str],
    segments: list[dict],
    audio_duration: float | None,
) -> None:
    """Fail clearly if aeneas dropped lines or crushed the alignment into a
    short prefix of the song — the two failure modes reported in real use
    (first line at 0:00 with intro, and the second half of the lyrics
    missing entirely).
    """
    if len(segments) != len(lines):
        out_texts = [seg["text"] for seg in segments]
        out_set = set(out_texts)
        missing = [line for line in lines if line not in out_set]
        # Show a short preview so the error is actionable in the UI.
        preview = missing[:5]
        more = f" (+{len(missing) - 5} more)" if len(missing) > 5 else ""
        missing_msg = "; ".join(preview) + more if preview else "(unable to list)"
        raise RuntimeError(
            f"Alignment incomplete: got {len(segments)} timed lines out of "
            f"{len(lines)} provided. Missing examples: {missing_msg}. "
            "Check that the vocal stem covers the full song and that the "
            "lyrics text matches what is actually sung."
        )

    if audio_duration and audio_duration > 0 and segments:
        last_end = float(segments[-1]["end"])
        # If the last lyric ends before half the song (with a floor for short
        # songs), aeneas almost certainly crushed everything into the intro.
        coverage = last_end / audio_duration
        if audio_duration >= 30 and coverage < 0.5:
            raise RuntimeError(
                f"Alignment covers only the first {last_end:.1f}s of "
                f"{audio_duration:.1f}s audio ({coverage:.0%}). "
                "The vocal stem may be truncated, the wrong file, or mostly "
                "instrumental. Check the stem and try again."
            )

        first_start = float(segments[0]["start"])
        # After head detection the first real lyric line should usually not be
        # pinned at exactly 0.0 on a song with a normal intro. Not a hard
        # error (some tracks do start singing immediately), but log it.
        if first_start <= 0.001 and audio_duration >= 30:
            logger.warning(
                "First aligned lyric still starts at 0.00s on a %.1fs track — "
                "intro head detection may have failed for this audio.",
                audio_duration,
            )


def align_lyrics(audio_path: str, lyrics_text: str, language: str = "eng") -> list[dict]:
    """Forced-align lyrics_text (one lyric line per line) against audio_path.

    Returns [{"start": float, "end": float, "text": str}, ...] — the same
    shape as transcribe_audio()'s segments, so callers can store either
    directly into project.transcript without a separate data path.
    """
    if not audio_path or not os.path.exists(audio_path):
        raise ValueError(f"Audio file not found: {audio_path}")

    lines = _normalize_lyric_lines(lyrics_text)
    if not lines:
        raise ValueError("No lyric lines provided.")

    _check_prerequisites()
    _patch_numpy_fromstring()

    audio_duration = _probe_duration_seconds(audio_path)
    logger.info(
        "Aligning %d lyric lines against %s (duration=%s)",
        len(lines),
        audio_path,
        f"{audio_duration:.1f}s" if audio_duration else "unknown",
    )

    from aeneas.executetask import ExecuteTask
    from aeneas.task import Task

    workdir = tempfile.mkdtemp(prefix="htxpunk_align_")
    try:
        text_path = os.path.join(workdir, "lyrics.txt")
        sync_path = os.path.join(workdir, "synced.json")
        with open(text_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        task = Task(config_string=_task_config_string(language))
        task.audio_file_path_absolute = os.path.abspath(audio_path)
        task.text_file_path_absolute = text_path
        task.sync_map_file_path_absolute = sync_path

        ExecuteTask(task, rconf=_tts_engine_config()).execute()
        task.output_sync_map_file()

        with open(sync_path, encoding="utf-8") as f:
            sync_data = json.load(f)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    segments = []
    for fragment in sync_data.get("fragments", []):
        # aeneas may emit empty "head"/"tail" fragments when head/tail
        # detection is on — skip those, keep only real lyric lines.
        frag_id = str(fragment.get("id") or "")
        if frag_id in {"h00000", "t00000"}:
            continue
        text = " ".join(fragment.get("lines") or []).strip()
        if not text:
            continue
        try:
            start = float(fragment["begin"])
            end = float(fragment["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if end <= start:
            continue
        segments.append({"start": start, "end": end, "text": text})

    if not segments:
        raise RuntimeError(
            "Alignment produced no usable segments — check the vocal stem and lyrics text."
        )

    _validate_complete_alignment(lines, segments, audio_duration)
    logger.info(
        "Alignment ok: %d lines, first_start=%.2fs, last_end=%.2fs, audio_duration=%s",
        len(segments),
        segments[0]["start"],
        segments[-1]["end"],
        f"{audio_duration:.1f}s" if audio_duration else "unknown",
    )
    return segments
