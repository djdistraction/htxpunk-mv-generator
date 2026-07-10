"""
video_assembler.py  —  music video assembly

Backends, selected by settings.video_backend:
  "modal"             — the real pipeline: per-panel image-to-video on
                         Modal's GPUs (LTX-Video), stitched with ffmpeg,
                         synced to audio, then a Wav2Lip lip-sync pass — see
                         services/modal_pipeline.py + modal_video_worker.py.
  "remotion"          — React/Remotion render (needs Node + remotion-composer).
  "runway"            — reserved for the experimental Gen-4 backend.
  "ffmpeg"            — Ken Burns preview renderer only. Blocked by default
                         unless ALLOW_FALLBACK_VIDEO=true.

The app should fail loudly when real video generation is not configured. A
fake slideshow that says "complete" is worse than a clear, actionable error.
"""

import json
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from config import settings
from utils.storage import url_to_local_path, upload_file_path

logger = logging.getLogger(__name__)

REMOTION_DIR = Path(__file__).parent.parent.parent / "remotion-composer"
KEN_BURNS_EFFECTS = ["zoom-in", "zoom-out", "pan-right", "pan-left"]


# ── ffmpeg discovery ──────────────────────────────────────────────────────────

def find_ffmpeg() -> str:
    """Return a usable ffmpeg binary path, or raise a clear error."""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    raise RuntimeError(
        "ffmpeg not found. Install it system-wide, or `pip install imageio-ffmpeg` "
        "to use the bundled binary."
    )


def _find_ffprobe(ffmpeg: str) -> str | None:
    exe = shutil.which("ffprobe")
    if exe:
        return exe
    ffmpeg_path = Path(ffmpeg)
    candidate = ffmpeg_path.with_name("ffprobe.exe" if os.name == "nt" else "ffprobe")
    return str(candidate) if candidate.exists() else None


def _probe_media_duration(ffmpeg: str, media_path: str) -> float | None:
    """Best-effort duration probe used only for the opt-in preview renderer."""
    if not media_path or not os.path.exists(media_path):
        return None
    ffprobe = _find_ffprobe(ffmpeg)
    if not ffprobe:
        return None
    cmd = [
        ffprobe, "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", media_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            return None
        duration = float(result.stdout.strip())
        return duration if duration > 0 else None
    except Exception:
        return None


def _resolution() -> tuple[int, int]:
    try:
        w, h = settings.output_resolution.lower().split("x")
        return int(w), int(h)
    except Exception:
        return 1920, 1080


# ── Ken Burns preview rendering ───────────────────────────────────────────────

def _ken_burns_filter(effect: str, dur_frames: int, w: int, h: int, fps: int) -> str:
    """Build a zoompan filter string for one still image.

    Upscaling before zoompan avoids the well-known zoompan jitter.
    """
    d = max(dur_frames, 1)
    pre = f"scale={w*2}:{h*2}:force_original_aspect_ratio=increase,crop={w*2}:{h*2}"
    if effect == "zoom-out":
        z = "if(lte(on,1),1.5,max(zoom-0.0010,1.0))"
        xy = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
    elif effect == "pan-right":
        z = "1.3"
        xy = "x='(iw-iw/zoom)*on/%d':y='ih/2-(ih/zoom/2)'" % d
    elif effect == "pan-left":
        z = "1.3"
        xy = "x='(iw-iw/zoom)*(1-on/%d)':y='ih/2-(ih/zoom/2)'" % d
    else:  # zoom-in
        z = "min(zoom+0.0010,1.5)"
        xy = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
    return (
        f"{pre},zoompan=z='{z}':{xy}:d={d}:s={w}x{h}:fps={fps},"
        f"format=yuv420p"
    )


def _render_clip(ffmpeg: str, image_path: str, out_path: str,
                 effect: str, duration: float, w: int, h: int, fps: int):
    dur_frames = max(int(round(duration * fps)), fps)  # at least 1s
    flt = _ken_burns_filter(effect, dur_frames, w, h, fps)
    cmd = [
        ffmpeg, "-y", "-loop", "1", "-i", image_path,
        "-t", f"{duration:.3f}",
        "-vf", flt,
        "-r", str(fps),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
        out_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg clip render failed for {image_path}:\n{result.stderr[-1500:]}"
        )


def assemble_with_ffmpeg(
    project_id: str,
    audio_path: str,
    panels: list[dict],
    output_filename: str = "final.mp4",
) -> str:
    """Render an explicitly opt-in Ken Burns preview with ffmpeg.

    This is not a production video backend. It exists only for manual preview
    testing when ALLOW_FALLBACK_VIDEO=true. If panel durations are absent and
    audio is available, it distributes panels across the full song duration so
    preview output does not truncate the song.
    """
    ffmpeg = find_ffmpeg()
    w, h = _resolution()
    fps = settings.video_fps
    fallback_default_dur = float(settings.clip_duration)

    workdir = Path(tempfile.mkdtemp(prefix=f"mv_{project_id[:8]}_"))
    clip_paths: list[Path] = []
    try:
        renderable: list[tuple[int, dict, str]] = []
        for i, panel in enumerate(panels):
            image_url = panel.get("composite_url") or panel.get("image_url", "")
            image_path = url_to_local_path(image_url) if image_url else ""
            if not image_path or not os.path.exists(image_path):
                logger.warning("[assemble] missing image for panel %d (%s) — skipping", i, image_url)
                continue
            renderable.append((i, panel, image_path))

        if not renderable:
            raise ValueError("No renderable panels (all images missing).")

        has_explicit_durations = any(p.get("duration") for _, p, _ in renderable)
        audio_duration = _probe_media_duration(ffmpeg, audio_path)
        if audio_duration and not has_explicit_durations:
            default_dur = max(audio_duration / len(renderable), 1.0)
            logger.info(
                "[assemble] distributing %d preview panels across %.1fs audio (%.2fs each)",
                len(renderable), audio_duration, default_dur,
            )
        else:
            default_dur = fallback_default_dur

        for out_i, (panel_i, panel, image_path) in enumerate(renderable):
            duration = panel.get("duration") or default_dur
            try:
                duration = float(duration)
            except (TypeError, ValueError):
                duration = default_dur
            effect = KEN_BURNS_EFFECTS[panel_i % len(KEN_BURNS_EFFECTS)]
            clip_path = workdir / f"clip_{out_i:04d}.mp4"
            _render_clip(ffmpeg, image_path, str(clip_path), effect, duration, w, h, fps)
            clip_paths.append(clip_path)

        concat_list = workdir / "concat.txt"
        concat_list.write_text("".join(f"file '{p.as_posix()}'\n" for p in clip_paths))
        silent_video = workdir / "silent.mp4"
        cmd = [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(silent_video)]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg concat failed:\n{result.stderr[-1500:]}")

        out_path = workdir / output_filename
        if audio_path and os.path.exists(audio_path):
            cmd = [
                ffmpeg, "-y", "-i", str(silent_video), "-i", audio_path,
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-map", "0:v:0", "-map", "1:a:0", "-shortest", str(out_path),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg audio mux failed:\n{result.stderr[-1500:]}")
        else:
            logger.info("[assemble] no audio attached — rendering silent preview video")
            shutil.move(str(silent_video), str(out_path))

        storage_key = f"projects/{project_id}/videos/{output_filename}"
        url = upload_file_path(str(out_path), storage_key, "video/mp4")
        logger.info("[assemble] ffmpeg preview render complete → %s", url)
        return url
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ── Remotion backend (opt-in) ─────────────────────────────────────────────────

def build_timeline(
    project_id: str,
    audio_path: str,
    panels: list[dict],
    word_timestamps: Optional[list[dict]] = None,
    fps: int = None,
    clip_duration: int = None,
) -> dict:
    """Construct the TimelineData JSON that MusicVideo.tsx consumes."""
    fps = fps or settings.video_fps
    clip_duration = clip_duration or settings.clip_duration
    frames_per_clip = fps * clip_duration

    def _lyric_for_panel(panel_index: int) -> Optional[str]:
        if not word_timestamps:
            return None
        start_sec = panel_index * clip_duration
        end_sec = start_sec + clip_duration
        words = [w["word"] for w in word_timestamps if start_sec <= w.get("start", 0) < end_sec]
        return " ".join(words).strip() or None

    timeline_panels = []
    cursor = 0
    for i, panel in enumerate(panels):
        image_url = panel.get("composite_url") or panel.get("image_url", "")
        image_path = url_to_local_path(image_url) if image_url else ""
        image_src = Path(image_path).as_uri() if image_path and os.path.exists(image_path) else image_url

        dur = panel.get("duration") or clip_duration
        frames = int(float(dur) * fps)
        timeline_panels.append({
            "imageSrc": image_src,
            "startFrame": cursor,
            "endFrame": cursor + frames,
            "effect": KEN_BURNS_EFFECTS[i % len(KEN_BURNS_EFFECTS)],
            "lyric": panel.get("lyric") or _lyric_for_panel(i),
            "energyLevel": panel.get("energy_level", 0.5),
        })
        cursor += frames

    audio_src = Path(audio_path).as_uri() if audio_path and os.path.exists(audio_path) else audio_path
    return {
        "fps": fps,
        "durationInFrames": cursor,
        "audioSrc": audio_src,
        "panels": timeline_panels,
    }


def render_with_remotion(project_id: str, timeline: dict, output_filename: str = "final.mp4") -> str:
    """Call Remotion to render MusicVideo. Returns storage URL of rendered video."""
    if not REMOTION_DIR.exists():
        raise RuntimeError(
            f"remotion-composer/ not found at {REMOTION_DIR}. Run: cd remotion-composer && npm install"
        )

    out_dir = REMOTION_DIR / "out"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"{project_id}_{output_filename}"

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, dir=REMOTION_DIR) as f:
        json.dump(timeline, f)
        props_path = f.name

    try:
        cmd = ["npx", "remotion", "render", "MusicVideo", str(out_path), f"--props={props_path}", "--log=verbose"]
        logger.info("Starting Remotion render: %s", " ".join(cmd))
        result = subprocess.run(cmd, cwd=str(REMOTION_DIR), capture_output=True, text=True, timeout=1800)
        if result.returncode != 0:
            logger.error("Remotion stderr:\n%s", result.stderr)
            raise RuntimeError(f"Remotion render failed (exit {result.returncode}):\n{result.stderr[-2000:]}")
        storage_key = f"projects/{project_id}/videos/{output_filename}"
        return upload_file_path(str(out_path), storage_key, "video/mp4")
    finally:
        try:
            os.unlink(props_path)
        except OSError:
            pass


# ── Lyric Video (issue #29, Lyric Video v1) ───────────────────────────────────
#
# A pure Lyric Video has no shots, no per-shot images, no shot manifest — just
# audio and an approved transcript. Renders LyricVideo.tsx (captions over a
# flat color/gradient background) directly, skipping treatment/element
# plan/element images/storyboard entirely. Always uses the local Remotion
# renderer regardless of settings.video_backend — that setting selects how
# the Cinematic path turns per-shot images into video (modal/ffmpeg/remotion
# with panels), none of which apply here. Never touches Modal.

def build_lyric_timeline(audio_path: str, segments: list[dict], fps: int = None) -> dict:
    """Construct the LyricVideoData JSON that LyricVideo.tsx consumes."""
    fps = fps or settings.video_fps
    clean_segments = [
        {"start": float(seg.get("start", 0)), "end": float(seg.get("end", 0)), "text": str(seg.get("text", "")).strip()}
        for seg in segments if str(seg.get("text", "")).strip()
    ]

    duration_seconds = max((seg["end"] for seg in clean_segments), default=0.0)
    audio_duration = _probe_media_duration(find_ffmpeg(), audio_path)
    if audio_duration:
        duration_seconds = max(duration_seconds, audio_duration)

    return {
        "fps": fps,
        "durationInFrames": max(1, int(duration_seconds * fps)),
        "audioSrc": "",  # filled in by render_lyric_video_with_remotion
        "segments": clean_segments,
        "backgroundColor": "#111111",
    }


def render_lyric_video_with_remotion(project_id: str, audio_path: str, timeline: dict, output_filename: str = "lyric_video.mp4") -> str:
    """Call Remotion to render LyricVideo. Returns storage URL of rendered video.

    Local audio must be copied into remotion-composer/public/ and referenced
    with a "/public/<filename>" prefixed path in the props — confirmed by
    direct rendering + frame-level inspection, not assumed. This Remotion
    version's asset server resolves any src not starting with http(s):// as
    relative to the served bundle root, and public/ contents land at
    <bundle-root>/public/, not <bundle-root>/ — a bare "/<filename>" (the
    file:// URI convention build_timeline() uses for MusicVideo, or the path
    staticFile() itself returns) 404s. Out of scope to fix that for the
    Cinematic path here — see docs/lyric-karaoke-module-implementation-plan.md.
    """
    if not REMOTION_DIR.exists():
        raise RuntimeError(
            f"remotion-composer/ not found at {REMOTION_DIR}. Run: cd remotion-composer && npm install"
        )

    public_dir = REMOTION_DIR / "public"
    public_dir.mkdir(exist_ok=True)
    public_audio_name = f"{project_id}_audio{Path(audio_path).suffix or '.mp3'}"
    public_audio_path = public_dir / public_audio_name
    shutil.copyfile(audio_path, public_audio_path)
    timeline = {**timeline, "audioSrc": f"/public/{public_audio_name}"}

    out_dir = REMOTION_DIR / "out"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"{project_id}_{output_filename}"

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, dir=REMOTION_DIR) as f:
        json.dump(timeline, f)
        props_path = f.name

    try:
        cmd = ["npx", "remotion", "render", "LyricVideo", str(out_path), f"--props={props_path}", "--log=verbose"]
        logger.info("Starting Remotion Lyric Video render: %s", " ".join(cmd))
        result = subprocess.run(cmd, cwd=str(REMOTION_DIR), capture_output=True, text=True, timeout=1800)
        if result.returncode != 0:
            logger.error("Remotion stderr:\n%s", result.stderr)
            raise RuntimeError(f"Remotion render failed (exit {result.returncode}):\n{result.stderr[-2000:]}")
        storage_key = f"projects/{project_id}/videos/{output_filename}"
        return upload_file_path(str(out_path), storage_key, "video/mp4")
    finally:
        try:
            os.unlink(props_path)
        except OSError:
            pass
        try:
            public_audio_path.unlink()
        except OSError:
            pass


def assemble_lyric_video(project_id: str, audio_path: str, segments: list[dict]) -> str:
    """High-level entry point for pure Lyric Video projects."""
    timeline = build_lyric_timeline(audio_path=audio_path, segments=segments)
    logger.info(
        "Lyric video timeline for project %s: %d frames @ %dfps = %.1fs, %d segments",
        project_id, timeline["durationInFrames"], timeline["fps"],
        timeline["durationInFrames"] / timeline["fps"], len(timeline["segments"]),
    )
    return render_lyric_video_with_remotion(project_id, audio_path, timeline)


# ── High-level entry point ────────────────────────────────────────────────────

def assemble_music_video(
    project_id: str,
    audio_path: str,
    panels: list[dict],
    word_timestamps: Optional[list[dict]] = None,
) -> str:
    """Dispatch to the configured video backend.

    ffmpeg/Ken Burns is treated as an explicit preview renderer, not a fallback.
    """
    backend = (settings.video_backend or "ffmpeg").lower()
    logger.info("Assembling music video for project %s (%d panels, backend=%s)", project_id, len(panels), backend)

    if backend == "remotion":
        timeline = build_timeline(project_id=project_id, audio_path=audio_path, panels=panels, word_timestamps=word_timestamps)
        logger.info("Timeline: %d frames @ %dfps = %.1fs", timeline["durationInFrames"], timeline["fps"], timeline["durationInFrames"] / timeline["fps"])
        return render_with_remotion(project_id, timeline)

    if backend == "modal":
        from services.modal_pipeline import assemble_with_modal
        return assemble_with_modal(project_id=project_id, audio_path=audio_path, panels=panels)

    if backend == "ffmpeg":
        if not settings.allow_fallback_video:
            raise RuntimeError(
                "Real video generation is not configured. VIDEO_BACKEND=ffmpeg would only produce "
                "a Ken Burns preview slideshow, so rendering was stopped instead of creating an "
                "unusable fake video. Configure VIDEO_BACKEND=modal for real image-to-video, or set "
                "ALLOW_FALLBACK_VIDEO=true only when you explicitly want a preview slideshow."
            )
        return assemble_with_ffmpeg(project_id=project_id, audio_path=audio_path, panels=panels)

    if backend in {"runway", "wan2"}:
        raise RuntimeError(
            f"VIDEO_BACKEND={backend} is selected, but that backend is not implemented yet. "
            "Configure VIDEO_BACKEND=modal, or set ALLOW_FALLBACK_VIDEO=true with VIDEO_BACKEND=ffmpeg "
            "only for a preview slideshow."
        )

    raise RuntimeError(
        f"Unknown VIDEO_BACKEND={backend}. Supported values: modal, remotion, ffmpeg. "
        "ffmpeg requires ALLOW_FALLBACK_VIDEO=true because it is only a preview renderer."
    )
