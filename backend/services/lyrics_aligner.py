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
"""
import json
import os
import shutil
import tempfile

import numpy as _np


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


def align_lyrics(audio_path: str, lyrics_text: str, language: str = "eng") -> list[dict]:
    """Forced-align lyrics_text (one lyric line per line) against audio_path.

    Returns [{"start": float, "end": float, "text": str}, ...] — the same
    shape as transcribe_audio()'s segments, so callers can store either
    directly into project.transcript without a separate data path.
    """
    if not audio_path or not os.path.exists(audio_path):
        raise ValueError(f"Audio file not found: {audio_path}")

    lines = [line.strip() for line in lyrics_text.splitlines() if line.strip()]
    if not lines:
        raise ValueError("No lyric lines provided.")

    _check_prerequisites()
    _patch_numpy_fromstring()

    from aeneas.executetask import ExecuteTask
    from aeneas.task import Task

    workdir = tempfile.mkdtemp(prefix="htxpunk_align_")
    try:
        text_path = os.path.join(workdir, "lyrics.txt")
        sync_path = os.path.join(workdir, "synced.json")
        with open(text_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        config_string = f"task_language={language}|is_text_type=plain|os_task_file_format=json"
        task = Task(config_string=config_string)
        task.audio_file_path_absolute = audio_path
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
        text = " ".join(fragment.get("lines") or []).strip()
        if not text:
            continue
        try:
            start = float(fragment["begin"])
            end = float(fragment["end"])
        except (KeyError, TypeError, ValueError):
            continue
        segments.append({"start": start, "end": end, "text": text})

    if not segments:
        raise RuntimeError("Alignment produced no usable segments — check the audio and lyrics text.")
    return segments
