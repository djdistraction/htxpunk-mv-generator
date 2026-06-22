"""
video_assembler.py  —  Remotion-based music video assembly

Builds a timeline JSON from storyboard panels + Whisper word timestamps,
then invokes:
    npx remotion render MusicVideo out/<project_id>_final.mp4 --props=<json>
inside the remotion-composer/ directory.
"""

import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from config import settings
from utils.storage import url_to_local_path, upload_file_path

logger = logging.getLogger(__name__)

REMOTION_DIR = Path(__file__).parent.parent.parent / "remotion-composer"
KEN_BURNS_EFFECTS = ["zoom-in", "zoom-out", "pan-right", "pan-left"]


def build_timeline(
    project_id: str,
    audio_path: str,
    panels: list[dict],
    word_timestamps: Optional[list[dict]] = None,
    fps: int = None,
    clip_duration: int = None,
) -> dict:
    """
    Construct the TimelineData JSON that MusicVideo.tsx consumes.

    panels: list of storyboard panel dicts, each with:
        - composite_url or image_url
        - panel_index
        - energy_level (0.0–1.0)

    word_timestamps: from Whisper output — list of
        {"word": str, "start": float, "end": float}
    """
    fps = fps or settings.video_fps
    clip_duration = clip_duration or settings.clip_duration
    frames_per_clip = fps * clip_duration

    def _lyric_for_panel(panel_index: int) -> Optional[str]:
        if not word_timestamps:
            return None
        start_sec = panel_index * clip_duration
        end_sec = start_sec + clip_duration
        words = [
            w["word"]
            for w in word_timestamps
            if start_sec <= w.get("start", 0) < end_sec
        ]
        return " ".join(words).strip() or None

    timeline_panels = []
    for i, panel in enumerate(panels):
        image_url = panel.get("composite_url") or panel.get("image_url", "")
        image_path = url_to_local_path(image_url) if image_url else ""

        if image_path and os.path.exists(image_path):
            image_src = Path(image_path).as_uri()
        else:
            image_src = image_url  # fallback for http:// in dev

        timeline_panels.append({
            "imageSrc": image_src,
            "startFrame": i * frames_per_clip,
            "endFrame": (i + 1) * frames_per_clip,
            "effect": KEN_BURNS_EFFECTS[i % len(KEN_BURNS_EFFECTS)],
            "lyric": _lyric_for_panel(i),
            "energyLevel": panel.get("energy_level", 0.5),
        })

    audio_src = Path(audio_path).as_uri() if os.path.exists(audio_path) else audio_path

    return {
        "fps": fps,
        "durationInFrames": len(panels) * frames_per_clip,
        "audioSrc": audio_src,
        "panels": timeline_panels,
    }


def render_with_remotion(
    project_id: str,
    timeline: dict,
    output_filename: str = "final.mp4",
) -> str:
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
            "npx", "remotion", "render",
            "MusicVideo",
            str(out_path),
            f"--props={props_path}",
            "--log=verbose",
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
        logger.info("Remotion render complete: %s", out_path)
        storage_key = f"projects/{project_id}/videos/{output_filename}"
        return upload_file_path(str(out_path), storage_key, "video/mp4")
    finally:
        try:
            os.unlink(props_path)
        except OSError:
            pass


def assemble_music_video(
    project_id: str,
    audio_path: str,
    panels: list[dict],
    word_timestamps: Optional[list[dict]] = None,
) -> str:
    """High-level entry point called by the pipeline worker."""
    logger.info("Assembling music video for project %s (%d panels)", project_id, len(panels))
    timeline = build_timeline(
        project_id=project_id,
        audio_path=audio_path,
        panels=panels,
        word_timestamps=word_timestamps,
    )
    logger.info(
        "Timeline: %d frames @ %dfps = %.1fs",
        timeline["durationInFrames"], timeline["fps"],
        timeline["durationInFrames"] / timeline["fps"],
    )
    return render_with_remotion(project_id, timeline)
