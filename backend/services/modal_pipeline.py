"""
Layer 4 — backend-side orchestration for the Modal video pipeline.

Calls the ALREADY-DEPLOYED Modal app (see modal_video_worker.py) from
within the FastAPI process. This requires
`modal deploy backend/services/modal_video_worker.py` to have been run at
least once (not just `modal run`, which is an ephemeral local-only deploy)
so generate_video_clip_remote / apply_lipsync_remote are resolvable by name.

UNVERIFIED END TO END ON REAL HARDWARE. Layer 2 (one still -> one clip) and
Layer 3 (lip-sync on one clip) were each confirmed manually in isolation;
this is the first time they're wired into a full multi-panel run. Watch the
first real project closely — Function.map()'s concurrency behavior across
20-30 panels in particular hasn't been exercised for real.
"""
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from config import settings
from utils.storage import url_to_local_path, upload_file_path
from services.video_assembler import find_ffmpeg

logger = logging.getLogger(__name__)

MODAL_APP_NAME = "htxpunk-video-worker"


def _modal_function(name: str):
    import modal
    return modal.Function.from_name(MODAL_APP_NAME, name)


def _round_frames_for_ltx(duration_seconds: float, fps: int) -> int:
    """Mirrors modal_video_worker._round_frames_for_ltx. Duplicated (not
    imported) so computing a frame count doesn't require pulling in that
    module's Modal App/Image definitions, which only matter on Modal's side."""
    raw = max(9, round(duration_seconds * fps))
    k = round((raw - 1) / 8)
    return max(9, k * 8 + 1)


def assemble_with_modal(
    project_id: str,
    audio_path: str,
    panels: list[dict],
    output_filename: str = "final.mp4",
) -> str:
    """Generate every panel's clip in parallel on Modal, concatenate, mux
    audio, then lip-sync (unless disabled). Returns the final storage URL.

    Raises on failure at any stage — including lip-sync — rather than
    silently shipping a lesser video and marking the project complete.
    """
    if not panels:
        raise ValueError(f"No storyboard panels found for project {project_id}")

    fps = 24
    image_bytes_list: list[bytes] = []
    prompt_list: list[str] = []
    num_frames_list: list[int] = []
    fps_list: list[int] = []

    for panel in panels:
        image_url = panel.get("composite_url") or panel.get("image_url", "")
        image_path = url_to_local_path(image_url) if image_url else ""
        if not image_path or not os.path.exists(image_path):
            logger.warning("[modal-assemble] missing image for panel — skipping: %s", image_url)
            continue
        with open(image_path, "rb") as f:
            image_bytes_list.append(f.read())

        base_prompt = panel.get("prompt") or "cinematic scene"
        prompt_list.append(f"{base_prompt}. Subtle natural motion, cinematic camera movement.")

        duration = panel.get("duration") or settings.clip_duration
        try:
            duration = float(duration)
        except (TypeError, ValueError):
            duration = float(settings.clip_duration)
        num_frames_list.append(_round_frames_for_ltx(duration, fps))
        fps_list.append(fps)

    if not image_bytes_list:
        raise ValueError("No renderable panels (all images missing).")

    logger.info("[modal-assemble] generating %d clips on Modal (parallel)…", len(image_bytes_list))
    generate_fn = _modal_function("generate_video_clip_remote")
    clip_bytes_list = list(
        generate_fn.map(image_bytes_list, prompt_list, num_frames_list, fps_list)
    )

    workdir = Path(tempfile.mkdtemp(prefix=f"mv_modal_{project_id[:8]}_"))
    try:
        ffmpeg = find_ffmpeg()
        clip_paths = []
        for i, clip_bytes in enumerate(clip_bytes_list):
            clip_path = workdir / f"clip_{i:04d}.mp4"
            clip_path.write_bytes(clip_bytes)
            clip_paths.append(clip_path)

        concat_list = workdir / "concat.txt"
        concat_list.write_text("".join(f"file '{p.as_posix()}'\n" for p in clip_paths))
        silent_video = workdir / "silent.mp4"
        result = subprocess.run(
            [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
             "-c", "copy", str(silent_video)],
            capture_output=True, text=True, timeout=900,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg concat failed:\n{result.stderr[-1500:]}")

        synced_video = workdir / "synced.mp4"
        has_audio = bool(audio_path) and os.path.exists(audio_path)
        if has_audio:
            result = subprocess.run(
                [ffmpeg, "-y", "-i", str(silent_video), "-i", audio_path,
                 "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                 "-map", "0:v:0", "-map", "1:a:0", "-shortest", str(synced_video)],
                capture_output=True, text=True, timeout=900,
            )
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg audio mux failed:\n{result.stderr[-1500:]}")
        else:
            logger.info("[modal-assemble] no audio attached — skipping mux and lip-sync")
            shutil.move(str(silent_video), str(synced_video))

        final_path = synced_video
        if settings.lipsync_enabled and has_audio:
            logger.info("[modal-assemble] running Wav2Lip lip-sync pass on Modal…")
            lipsync_fn = _modal_function("apply_lipsync_remote")
            with open(synced_video, "rb") as f:
                video_bytes = f.read()
            with open(audio_path, "rb") as f:
                audio_bytes = f.read()
            lipsynced_bytes = lipsync_fn.remote(video_bytes, audio_bytes)
            final_path = workdir / output_filename
            final_path.write_bytes(lipsynced_bytes)
        elif not settings.lipsync_enabled:
            logger.info("[modal-assemble] LIPSYNC_ENABLED=false — shipping without lip-sync")

        storage_key = f"projects/{project_id}/videos/{output_filename}"
        url = upload_file_path(str(final_path), storage_key, "video/mp4")
        logger.info("[modal-assemble] complete → %s", url)
        return url
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
