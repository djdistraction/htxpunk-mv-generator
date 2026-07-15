"""
Forced alignment of user-supplied lyrics against real vocal audio.

Primary path for music: faster-whisper word timestamps (VAD off, lyrics
prompt) + global token alignment onto the user's exact lines.

Why not plain aeneas alone: espeak TTS + DTW is built for speech. On real
songs it has been observed to:
- pin/stretch early lines over the intro
- crush the entire second half of the lyrics into a zero-length blip near
  mid-track (confirmed on "The World Is Mine": 14 lines stuck at ~189.40s
  of a 244s song)

Why not naive sequential matching alone: Whisper ASR on singing is sparse
and imperfect; greedy cursor matching fails after the first wrong word.
Global sequence alignment assigns every lyric token a best-effort whisper
time, then line times = first/last matched token span, with interpolation
for lines that still have no hits.

Fallback: chunked aeneas (align ~12 lines at a time on proportional audio
windows) so long tracks don't collapse the tail.
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from collections import Counter
from difflib import SequenceMatcher

import numpy as _np

logger = logging.getLogger(__name__)

_DEFAULT_BACKEND = os.environ.get("LYRICS_ALIGN_BACKEND", "auto").strip().lower()


def _patch_numpy_fromstring():
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


def _check_prerequisites_aeneas():
    missing = []
    if not (shutil.which("espeak-ng") or shutil.which("espeak")):
        missing.append("espeak-ng (or espeak)")
    if not shutil.which("ffprobe"):
        missing.append(
            "ffprobe (install ffmpeg system-wide — the bundled imageio-ffmpeg "
            "binary doesn't include ffprobe)"
        )
    if not (shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")):
        # imageio-ffmpeg may provide ffmpeg for slice extraction
        try:
            import imageio_ffmpeg  # noqa: F401
        except Exception:
            missing.append("ffmpeg")
    if missing:
        raise RuntimeError(
            "Lyric alignment (aeneas) requires "
            + " and ".join(missing)
            + " on PATH."
        )


def _find_ffmpeg() -> str:
    for name in ("ffmpeg", "ffmpeg.exe"):
        found = shutil.which(name)
        if found:
            return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:
        raise RuntimeError("ffmpeg not found for audio slicing") from exc


def _tts_engine_config():
    from aeneas.runtimeconfiguration import RuntimeConfiguration

    if shutil.which("espeak-ng") and not shutil.which("espeak"):
        return RuntimeConfiguration("tts=espeak-ng")
    return RuntimeConfiguration()


def _probe_duration_seconds(audio_path: str) -> float | None:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    try:
        result = subprocess.run(
            [
                ffprobe, "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                audio_path,
            ],
            capture_output=True, text=True, timeout=60, check=False,
        )
        if result.returncode != 0:
            return None
        return float(result.stdout.strip())
    except (ValueError, OSError, subprocess.SubprocessError):
        return None


def _normalize_lyric_lines(lyrics_text: str) -> list[str]:
    translations = str.maketrans({
        "\u2018": "'", "\u2019": "'",
        "\u201c": '"', "\u201d": '"',
        "\u2013": "-", "\u2014": "-",
        "\u2026": "...", "\u00a0": " ",
    })
    lines: list[str] = []
    for raw in lyrics_text.splitlines():
        line = raw.translate(translations).strip()
        if not line:
            continue
        line = re.sub(r"[ \t]+", " ", line)
        lines.append(line)
    return lines


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", (text or "").lower())


def _token_similar(a: str, b: str) -> bool:
    if a == b:
        return True
    if not a or not b:
        return False
    if a.rstrip("s") == b.rstrip("s") and min(len(a), len(b)) >= 3:
        return True
    if a.rstrip("'") == b.rstrip("'"):
        return True
    if len(a) < 4 or len(b) < 4:
        return False
    return SequenceMatcher(None, a, b).ratio() >= 0.78


def _flatten_whisper_words(transcript: dict) -> list[dict]:
    flat: list[dict] = []
    for seg in transcript.get("segments") or []:
        words = seg.get("words") or []
        if words:
            for w in words:
                raw = (w.get("word") or "").strip()
                if not raw:
                    continue
                for tok in _tokenize(raw):
                    flat.append({
                        "token": tok,
                        "start": float(w["start"]),
                        "end": float(w["end"]),
                    })
        else:
            text = (seg.get("text") or "").strip()
            tokens = _tokenize(text)
            if not tokens:
                continue
            s = float(seg.get("start") or 0)
            e = float(seg.get("end") or s)
            span = max(e - s, 0.05)
            step = span / len(tokens)
            for i, tok in enumerate(tokens):
                flat.append({
                    "token": tok,
                    "start": s + i * step,
                    "end": s + (i + 1) * step,
                })
    return flat


def _global_token_assignment(user_tokens: list[str], words: list[dict]) -> list[int | None]:
    """Needleman–Wunsch-style alignment: user token i → whisper word index or None.

    O(n*m) with n,m typically a few hundred — fine for song-length lyrics.
    """
    n, m = len(user_tokens), len(words)
    if n == 0 or m == 0:
        return [None] * n

    MATCH = 3
    MISMATCH = -1
    GAP_USER = -1   # skip a user token
    GAP_WORD = -1   # skip a whisper word (ad-lib / extra ASR)

    # Rolling two-row DP for memory; keep full backpointers as bytes
    # 0=diag, 1=up (skip user), 2=left (skip word)
    prev = [j * GAP_WORD for j in range(m + 1)]
    bt = bytearray((n + 1) * (m + 1))

    for j in range(m + 1):
        bt[j] = 2  # left
    for i in range(n + 1):
        bt[i * (m + 1)] = 1  # up
    bt[0] = 0

    for i in range(1, n + 1):
        cur = [0] * (m + 1)
        cur[0] = i * GAP_USER
        ut = user_tokens[i - 1]
        row = i * (m + 1)
        for j in range(1, m + 1):
            wt = words[j - 1]["token"]
            score = MATCH if _token_similar(ut, wt) else MISMATCH
            diag = prev[j - 1] + score
            up = prev[j] + GAP_USER
            left = cur[j - 1] + GAP_WORD
            if diag >= up and diag >= left:
                cur[j] = diag
                bt[row + j] = 0
            elif up >= left:
                cur[j] = up
                bt[row + j] = 1
            else:
                cur[j] = left
                bt[row + j] = 2
        prev = cur

    assignment: list[int | None] = [None] * n
    i, j = n, m
    while i > 0 or j > 0:
        if i == 0:
            j -= 1
            continue
        if j == 0:
            i -= 1
            continue
        move = bt[i * (m + 1) + j]
        if move == 0:
            # only keep assignment if tokens actually similar (avoid forced mismatches)
            if _token_similar(user_tokens[i - 1], words[j - 1]["token"]):
                assignment[i - 1] = j - 1
            i -= 1
            j -= 1
        elif move == 1:
            i -= 1
        else:
            j -= 1
    return assignment


def map_lines_to_word_stream(lines: list[str], words: list[dict]) -> list[dict]:
    """Map each lyric line onto whisper word times via global token alignment."""
    if not words:
        raise RuntimeError("No timed words available to map lyrics onto.")

    # Flatten user tokens with line ownership
    user_tokens: list[str] = []
    token_line: list[int] = []
    for li, line in enumerate(lines):
        toks = _tokenize(line)
        if not toks:
            continue
        for t in toks:
            user_tokens.append(t)
            token_line.append(li)

    assignment = _global_token_assignment(user_tokens, words)

    # Per-line collect matched word indices
    line_hits: list[list[int]] = [[] for _ in lines]
    for tok_i, w_i in enumerate(assignment):
        if w_i is None:
            continue
        line_hits[token_line[tok_i]].append(w_i)

    raw: list[dict] = []
    matched_lines = 0
    for li, line in enumerate(lines):
        hits = line_hits[li]
        if not hits:
            raw.append({"start": None, "end": None, "text": line, "matched": 0.0})
            continue
        matched_lines += 1
        w0 = words[min(hits)]
        w1 = words[max(hits)]
        start = float(w0["start"])
        end = float(w1["end"])
        if end <= start:
            end = start + 0.12
        raw.append({
            "start": start,
            "end": end,
            "text": line,
            "matched": min(1.0, len(hits) / max(1, len(_tokenize(line)))),
        })

    match_rate = matched_lines / max(1, len(lines))
    logger.info(
        "Global align: matched %d/%d lines (%.0f%%), whisper_words=%d, user_tokens=%d",
        matched_lines, len(lines), 100 * match_rate, len(words), len(user_tokens),
    )
    if match_rate < 0.25 and len(lines) >= 8:
        raise RuntimeError(
            f"Whisper only matched {matched_lines}/{len(lines)} lyric lines "
            f"({match_rate:.0%}). ASR coverage is too thin for reliable sync."
        )

    return _interpolate_unmatched(raw, words)


def _interpolate_unmatched(raw: list[dict], words: list[dict]) -> list[dict]:
    n = len(raw)
    if n == 0:
        return []

    song_start = float(words[0]["start"])
    song_end = float(words[-1]["end"])

    i = 0
    while i < n:
        if raw[i]["start"] is not None:
            i += 1
            continue
        # block of unmatched
        j = i
        while j < n and raw[j]["start"] is None:
            j += 1
        prev_i = i - 1 if i > 0 and raw[i - 1]["start"] is not None else None
        next_i = j if j < n and raw[j]["start"] is not None else None

        if prev_i is not None and next_i is not None:
            gap_start = float(raw[prev_i]["end"])
            gap_end = float(raw[next_i]["start"])
        elif prev_i is not None:
            gap_start = float(raw[prev_i]["end"])
            gap_end = song_end
        elif next_i is not None:
            gap_start = song_start
            gap_end = float(raw[next_i]["start"])
        else:
            gap_start = song_start
            gap_end = song_end

        block = j - i
        span = max(gap_end - gap_start, 0.15 * block)
        step = span / block
        for k in range(block):
            raw[i + k]["start"] = gap_start + k * step
            raw[i + k]["end"] = gap_start + (k + 1) * step
            raw[i + k]["matched"] = 0.0
        i = j

    segments: list[dict] = []
    prev_end = 0.0
    for item in raw:
        start = float(item["start"] if item["start"] is not None else prev_end)
        end = float(item["end"] if item["end"] is not None else start + 0.2)
        if start < prev_end:
            start = prev_end
        if end <= start:
            end = start + 0.12
        segments.append({
            "start": round(start, 3),
            "end": round(end, 3),
            "text": item["text"],
        })
        prev_end = end
    return segments


def _validate_complete_alignment(
    lines: list[str],
    segments: list[dict],
    audio_duration: float | None,
) -> None:
    if len(segments) != len(lines):
        raise RuntimeError(
            f"Alignment incomplete: got {len(segments)} timed lines out of "
            f"{len(lines)} provided."
        )

    zeroish = [
        i for i, seg in enumerate(segments)
        if float(seg["end"]) - float(seg["start"]) < 0.05
    ]
    if zeroish and len(zeroish) >= max(3, len(segments) // 10):
        raise RuntimeError(
            f"Alignment produced {len(zeroish)} near-zero-length lines "
            f"(e.g. line {zeroish[0] + 1}). Timestamps are not usable."
        )

    if audio_duration and audio_duration > 0 and segments:
        last_end = float(segments[-1]["end"])
        first_start = float(segments[0]["start"])
        coverage = last_end / audio_duration
        if audio_duration >= 30 and coverage < 0.65:
            raise RuntimeError(
                f"Alignment covers only the first {last_end:.1f}s of "
                f"{audio_duration:.1f}s audio ({coverage:.0%})."
            )
        span = last_end - first_start
        if audio_duration >= 30 and span < audio_duration * 0.35:
            raise RuntimeError(
                f"Aligned lyrics only span {span:.1f}s of a {audio_duration:.1f}s track."
            )
        starts = [round(float(s["start"]), 1) for s in segments]
        if len(starts) >= 8:
            common_start, count = Counter(starts).most_common(1)[0]
            if count >= max(5, len(starts) // 4):
                raise RuntimeError(
                    f"{count} lyric lines are stuck at ~{common_start:.1f}s — "
                    "alignment collapsed."
                )


def _align_with_whisper(audio_path: str, lines: list[str]) -> list[dict]:
    from services.audio_analyzer import transcribe_for_alignment

    hint = "\n".join(lines)
    logger.info("Whisper alignment (VAD off, lyrics prompt) for %d lines", len(lines))
    transcript = transcribe_for_alignment(audio_path, lyrics_hint=hint)
    words = _flatten_whisper_words(transcript)
    if len(words) < 5:
        raise RuntimeError(
            "Whisper produced almost no word timestamps from the vocal stem."
        )
    logger.info(
        "Whisper words=%d first=%.2fs last=%.2fs text_chars=%d",
        len(words),
        words[0]["start"],
        words[-1]["end"],
        len(transcript.get("text") or ""),
    )
    return map_lines_to_word_stream(lines, words)


def _task_config_string(language: str) -> str:
    return "|".join([
        f"task_language={language}",
        "is_text_type=plain",
        "os_task_file_format=json",
        "is_audio_file_detect_head_min=0.0500",
        "is_audio_file_detect_head_max=45.0000",
        "is_audio_file_detect_tail_min=0.0500",
        "is_audio_file_detect_tail_max=45.0000",
        "task_adjust_boundary_algorithm=percent",
        "task_adjust_boundary_percent_value=50",
        "task_adjust_boundary_no_zero=True",
    ])


def _aeneas_align_file(audio_path: str, lines: list[str], language: str) -> list[dict]:
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
            end = start + 0.12
        segments.append({"start": start, "end": end, "text": text})
    return segments


def _slice_audio(src: str, dest: str, start: float, duration: float) -> None:
    ffmpeg = _find_ffmpeg()
    cmd = [
        ffmpeg, "-y",
        "-ss", f"{max(0.0, start):.3f}",
        "-t", f"{max(0.2, duration):.3f}",
        "-i", src,
        "-ac", "1",
        "-ar", "16000",
        dest,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0 or not os.path.isfile(dest):
        raise RuntimeError(f"ffmpeg slice failed: {(result.stderr or '')[-400:]}")


def _align_with_chunked_aeneas(
    audio_path: str,
    lines: list[str],
    language: str,
    audio_duration: float | None,
    chunk_size: int = 10,
) -> list[dict]:
    """Align lyrics in small chunks so aeneas does not crush the song tail.

    Each chunk is force-aligned against a proportional window of the audio
    (with padding). Times are offset back into the full timeline.
    """
    _check_prerequisites_aeneas()
    _patch_numpy_fromstring()

    duration = audio_duration or _probe_duration_seconds(audio_path)
    if not duration or duration <= 0:
        raise RuntimeError("Cannot chunk-align without known audio duration.")

    n = len(lines)
    if n == 0:
        return []

    # Prefer mono 16k wav for aeneas stability
    work_root = tempfile.mkdtemp(prefix="htxpunk_chunk_align_")
    try:
        mono = os.path.join(work_root, "full_mono.wav")
        _slice_audio(audio_path, mono, 0.0, duration)

        all_segments: list[dict] = []
        for start_line in range(0, n, chunk_size):
            chunk = lines[start_line:start_line + chunk_size]
            # Proportional window with generous padding so lines can land early/late
            t0 = duration * (start_line / n)
            t1 = duration * (min(start_line + len(chunk), n) / n)
            pad = max(4.0, (t1 - t0) * 0.35)
            win_start = max(0.0, t0 - pad)
            win_end = min(duration, t1 + pad)
            win_dur = max(0.5, win_end - win_start)

            slice_path = os.path.join(work_root, f"chunk_{start_line}.wav")
            _slice_audio(mono, slice_path, win_start, win_dur)
            logger.info(
                "aeneas chunk lines %d-%d window %.1f-%.1fs",
                start_line + 1,
                start_line + len(chunk),
                win_start,
                win_start + win_dur,
            )
            local = _aeneas_align_file(slice_path, chunk, language)
            if len(local) != len(chunk):
                # Fall back to even spread inside this window if aeneas drops lines
                logger.warning(
                    "aeneas chunk returned %d/%d lines — even-spreading this window",
                    len(local), len(chunk),
                )
                step = win_dur / len(chunk)
                local = [
                    {
                        "start": i * step,
                        "end": (i + 1) * step,
                        "text": chunk[i],
                    }
                    for i in range(len(chunk))
                ]
            else:
                # Ensure text order matches input chunk (aeneas preserves order)
                local = [
                    {"start": s["start"], "end": s["end"], "text": chunk[i]}
                    for i, s in enumerate(local)
                ]

            for seg in local:
                all_segments.append({
                    "start": float(seg["start"]) + win_start,
                    "end": float(seg["end"]) + win_start,
                    "text": seg["text"],
                })

        # Enforce global monotonic order after stitching overlapping windows
        prev_end = 0.0
        fixed: list[dict] = []
        for seg in all_segments:
            start = max(float(seg["start"]), prev_end)
            end = float(seg["end"])
            if end <= start:
                end = start + 0.15
            fixed.append({
                "start": round(start, 3),
                "end": round(end, 3),
                "text": seg["text"],
            })
            prev_end = end
        return fixed
    finally:
        shutil.rmtree(work_root, ignore_errors=True)


def _score_segments(segments: list[dict], audio_duration: float | None) -> float:
    """Higher is better — prefer even coverage and fewer tiny lines."""
    if not segments:
        return -1e9
    durs = [max(0.0, float(s["end"]) - float(s["start"])) for s in segments]
    tiny = sum(1 for d in durs if d < 0.15)
    long = sum(1 for d in durs if d > 12)
    span = float(segments[-1]["end"]) - float(segments[0]["start"])
    cov = (float(segments[-1]["end"]) / audio_duration) if audio_duration else 0.5
    # penalize tiny/long lines and reward span + coverage
    return span + 40 * cov - 3 * tiny - 2 * long


def align_lyrics(audio_path: str, lyrics_text: str, language: str = "eng") -> list[dict]:
    """Forced-align lyrics_text (one lyric line per line) against audio_path.

    Returns [{"start": float, "end": float, "text": str}, ...].
    """
    if not audio_path or not os.path.exists(audio_path):
        raise ValueError(f"Audio file not found: {audio_path}")

    lines = _normalize_lyric_lines(lyrics_text)
    if not lines:
        raise ValueError("No lyric lines provided.")

    audio_duration = _probe_duration_seconds(audio_path)
    backend = _DEFAULT_BACKEND or "auto"
    logger.info(
        "Aligning %d lyric lines against %s (duration=%s, backend=%s)",
        len(lines),
        audio_path,
        f"{audio_duration:.1f}s" if audio_duration else "unknown",
        backend,
    )

    attempts: list[tuple[str, object]] = []
    if backend in {"auto", "whisper", ""}:
        attempts.append(("whisper", lambda: _align_with_whisper(audio_path, lines)))
        if backend in {"auto", ""}:
            attempts.append((
                "chunked_aeneas",
                lambda: _align_with_chunked_aeneas(audio_path, lines, language, audio_duration),
            ))
    elif backend == "aeneas":
        attempts.append((
            "chunked_aeneas",
            lambda: _align_with_chunked_aeneas(audio_path, lines, language, audio_duration),
        ))
    else:
        attempts.append(("whisper", lambda: _align_with_whisper(audio_path, lines)))
        attempts.append((
            "chunked_aeneas",
            lambda: _align_with_chunked_aeneas(audio_path, lines, language, audio_duration),
        ))

    candidates: list[tuple[str, list[dict], float]] = []
    errors: list[str] = []

    for name, fn in attempts:
        try:
            segs = fn()  # type: ignore[operator]
            _validate_complete_alignment(lines, segs, audio_duration)
            score = _score_segments(segs, audio_duration)
            candidates.append((name, segs, score))
            logger.info(
                "Alignment candidate %s score=%.1f first=%.2f last=%.2f",
                name, score, segs[0]["start"], segs[-1]["end"],
            )
            # Good enough whisper result — don't spend minutes on aeneas fallback
            if name == "whisper" and score > 50:
                break
        except Exception as exc:
            errors.append(f"{name}: {exc}")
            logger.warning("Alignment attempt failed (%s: %s)", name, exc)

    if not candidates:
        raise RuntimeError(
            "Could not produce usable lyric timestamps. " + " | ".join(errors[-3:])
        )

    candidates.sort(key=lambda x: x[2], reverse=True)
    name, segments, score = candidates[0]
    logger.info(
        "Alignment ok via %s (score=%.1f): %d lines, first=%.2fs, last=%.2fs",
        name, score, len(segments), segments[0]["start"], segments[-1]["end"],
    )
    return segments
