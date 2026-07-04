"""
video_assembler.py  —  music video assembly

Backends, selected by settings.video_backend:
  "ffmpeg"   (default) — Ken Burns slideshow rendered with ffmpeg. Works with
                         no external services. Audio is optional (silent video
                         if none attached). The $0, no-GPU fallback.
  "modal"              — the real pipeline: per-panel image-to-video on
                         Modal's GPUs (LTX-Video), stitched with ffmpeg,
                         synced to audio, then a Wav2Lip lip-sync pass — see
                         services/modal_pipeline.py + modal_video_worker.py.
  "remotion"           — React/Remotion render (needs Node + remotion-composer).
  "runway"             — reserved for the experimental Gen-4 backend.

The ffmpeg backend finds a binary via PATH, falling back to the one bundled
with the `imageio-ffmpeg` Python package, so it works even when ffmpeg isn't
installed system-wide.
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


def _resolution() -> tuple[int, int]:
    try:
        w, h = settings.output_resolution.lower().split("x")
        return int(w), int(h)
    except Exception:
        return 1920, 1080


# ── Ken Burns clip rendering ──────────────────────────────────────────────────

def _ken_burns_filter(effect: str, dur_frames: int, w: int, h: int, fps: int) -> str:
    """Build a zoompan filter string for one still image.

    Upscaling before zoompan avoids the well-known zoompan jitter.
    """
    d = max(dur_frames, 1)
    # upscale before zoompan so sub-pixel zoom steps land cleanly (avoids jitter)
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
    """Render a Ken Burns music video with ffmpeg. Returns storage URL."""
    ffmpeg = find_ffmpeg()
    w, h = _resolution()
    fps = settings.video_fps
    default_dur = float(settings.clip_duration)

    workdir = Path(tempfile.mkdtemp(prefix=f"mv_{project_id[:8]}_"))
    clip_paths: list[Path] = []
    try:
        for i, panel in enumerate(panels):
            image_url = panel.get("composite_url") or panel.get("image_url", "")
            image_path = url_to_local_path(image_url) if image_url else ""
            if not image_path or not os.path.exists(image_path):
                logger.warning("[assemble] missing image for panel %d (%s) — skipping",
                               i, image_url)
                continue
            duration = panel.get("duration") or default_dur
            try:
                duration = float(duration)
            except (TypeError, ValueError):
                duration = default_dur
            effect = KEN_BURNS_EFFECTS[i % len(KEN_BURNS_EFFECTS)]
            clip_path = workdir / f"clip_{i:04d}.mp4"
            _render_clip(ffmpeg, image_path, str(clip_path), effect, duration, w, h, fps)
            clip_paths.append(clip_path)

        if not clip_paths:
            raise ValueError("No renderable panels (all images missing).")

        # Concatenate clips (same codec/params → stream copy is safe)
        concat_list = workdir / "concat.txt"
        concat_list.write_text(
            "".join(f"file '{p.as_posix()}'\n" for p in clip_paths)
        )
        silent_video = workdir / "silent.mp4"
        cmd = [
            ffmpeg, "-y", "-f", "concat", "-safe", "0",
            "-i", str(concat_list), "-c", "copy", str(silent_video),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg concat failed:\n{result.stderr[-1500:]}")

        out_path = workdir / output_filename
        if audio_path and os.path.exists(audio_path):
            # Mux audio, cut to whichever stream is shorter
            cmd = [
                ffmpeg, "-y", "-i", str(silent_video), "-i", audio_path,
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-map", "0:v:0", "-map", "1:a:0", "-shortest", str(out_path),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg audio mux failed:\n{result.stderr[-1500:]}")
        else:
            logger.info("[assemble] no audio attached — rendering silent video")
            shutil.move(str(silent_video), str(out_path))

        storage_key = f"projects/{project_id}/videos/{output_filename}"
        url = upload_file_path(str(out_path), storage_key, "video/mp4")
        logger.info("[assemble] ffmpeg render complete → %s", url)
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
        words = [
            w["word"] for w in word_timestamps
            if start_sec <= w.get("start", 0) < end_sec
        ]
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


def render_with_remotion(project_id: str, timeline: dict,
                         output_filename: str = "final.mp4") -> str:
    """Call Remotion to render MusicVideo. Returns storage URL of rendered video."""
    if not REMOTION_DIR.exists():
        raise RuntimeError(
            f"remotion-composer/ not found at {REMOTION_DIR}. "
            "Run: cd remotion-composer && npm install"
        )

    out_dir = REMOTION_DIR / "out"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"{project_id}_{output_filename}"

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, dir=REMOTION_DIR
    ) as f:
        json.dump(timeline, f)
        props_path = f.name

    try:
        cmd = [
            "npx", "remotion", "render", "MusicVideo",
            str(out_path), f"--props={props_path}", "--log=verbose",
        ]
        logger.info("Starting Remotion render: %s", " ".join(cmd))
        result = subprocess.run(
            cmd, cwd=str(REMOTION_DIR),
            capture_output=True, text=True, timeout=1800,
        )
        if result.returncode != 0:
            logger.error("Remotion stderr:\n%s", result.stderr)
            raise RuntimeError(
                f"Remotion render failed (exit {result.returncode}):\n{result.stderr[-2000:]}"
            )
        storage_key = f"projects/{project_id}/videos/{output_filename}"
        return upload_file_path(str(out_path), storage_key, "video/mp4")
    finally:
        try:
            os.unlink(props_path)
        except OSError:
            pass


# ── High-level entry point ────────────────────────────────────────────────────

def assemble_music_video(
    project_id: str,
    audio_path: str,
    panels: list[dict],
    word_timestamps: Optional[list[dict]] = None,
) -> str:
    """Dispatch to the configured video backend. ffmpeg is the working default."""
    backend = (settings.video_backend or "ffmpeg").lower()
    logger.info("Assembling music video for project %s (%d panels, backend=%s)",
                project_id, len(panels), backend)

    if backend == "remotion":
        timeline = build_timeline(
            project_id=project_id, audio_path=audio_path,
            panels=panels, word_timestamps=word_timestamps,
        )
        logger.info("Timeline: %d frames @ %dfps = %.1fs",
                    timeline["durationInFrames"], timeline["fps"],
                    timeline["durationInFrames"] / timeline["fps"])
        return render_with_remotion(project_id, timeline)

    if backend == "modal":
        from services.modal_pipeline import assemble_with_modal
        return assemble_with_modal(
            project_id=project_id, audio_path=audio_path, panels=panels,
        )

    # default: ffmpeg (also used for "runway" until that backend lands)
    return assemble_with_ffmpeg(
        project_id=project_id, audio_path=audio_path, panels=panels,
    )
