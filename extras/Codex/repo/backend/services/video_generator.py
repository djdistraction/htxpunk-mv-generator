"""
Stage 7 — Video Clip Generation

FFmpeg backend (default, free):
  Each storyboard panel becomes a 5-second clip with a Ken Burns effect
  (slow zoom + drift). This looks intentional and works well for music videos.

RunwayML backend (paid, ~$0.05/clip):
  Set video_backend=runway in .env and add runway_api_key.
  Uses Gen-4 Turbo with open/close panel pairs for AI animation.

Local GPU backend (future):
  Set video_backend=wan2 — will call local Wan2.1 server.
"""
import os
import subprocess
import tempfile
from pathlib import Path
from config import settings
from utils.storage import upload_file_path, url_to_local_path

def generate_clip(project_id: str, clip_index: int,
                  panel_url: str, scene_description: str = "",
                  close_panel_url: str = None) -> str:
    """
    Generate a 5-second video clip from a storyboard panel.
    Returns storage URL of the MP4.
    """
    if settings.video_backend == "runway":
        return _runway_clip(project_id, clip_index, panel_url, close_panel_url, scene_description)
    else:
        return _ffmpeg_ken_burns_clip(project_id, clip_index, panel_url)

# ─── FFmpeg Ken Burns (free) ─────────────────────────────────────────────────

def _ffmpeg_ken_burns_clip(project_id: str, clip_index: int, panel_url: str) -> str:
    """
    Create a 5-second Ken Burns clip from a still image.
    Alternates between zoom-in, zoom-out, pan-left, pan-right for variety.
    """
    img_path = url_to_local_path(panel_url)
    duration = settings.clip_duration
    fps = settings.video_fps
    total_frames = duration * fps
    w, h = settings.output_resolution.split("x")

    # Vary the effect based on clip index
    effect = clip_index % 4
    if effect == 0:
        # Slow zoom in
        zoom = f"'min(zoom+0.0008,1.3)'"
        x = f"'iw/2-(iw/zoom/2)'"
        y = f"'ih/2-(ih/zoom/2)'"
    elif effect == 1:
        # Slow zoom out
        zoom = f"'if(eq(on,1),1.3,max(zoom-0.0008,1.0))'"
        x = f"'iw/2-(iw/zoom/2)'"
        y = f"'ih/2-(ih/zoom/2)'"
    elif effect == 2:
        # Pan right + slight zoom
        zoom = f"'min(zoom+0.0005,1.15)'"
        x = f"'on/{total_frames}*(iw-iw/zoom)'"
        y = f"'ih/2-(ih/zoom/2)'"
    else:
        # Pan left + slight zoom
        zoom = f"'min(zoom+0.0005,1.15)'"
        x = f"'(1-on/{total_frames})*(iw-iw/zoom)'"
        y = f"'ih/2-(ih/zoom/2)'"

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        out_path = tmp.name

    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-i", img_path,
        "-filter_complex",
        (
            f"[0:v]scale=8000:-1,"
            f"zoompan=z={zoom}:x={x}:y={y}"
            f":d={total_frames}:s={w}x{h}:fps={fps},"
            f"setsar=1[v]"
        ),
        "-map", "[v]",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-t", str(duration),
        out_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg ken burns failed:\n{result.stderr}")

    key = f"{project_id}/clips/clip_{clip_index:03d}.mp4"
    url = upload_file_path(out_path, key, "video/mp4")
    os.unlink(out_path)
    return url

# ─── RunwayML Gen-4 (paid) ───────────────────────────────────────────────────

def _runway_clip(project_id: str, clip_index: int,
                 open_url: str, close_url: str, scene_description: str) -> str:
    """Generate a clip via RunwayML Gen-4 Turbo. ~$0.05/clip."""
    import httpx, time

    headers = {
        "Authorization": f"Bearer {settings.runway_api_key}",
        "Content-Type": "application/json",
        "X-Runway-Version": "2024-11-06",
    }
    payload = {
        "model": "gen4_turbo",
        "promptImage": open_url,
        "promptImageEnd": close_url,
        "promptText": scene_description[:500] if scene_description else "",
        "duration": settings.clip_duration,
        "ratio": "1280:720",
    }

    with httpx.Client(timeout=30) as client:
        resp = client.post("https://api.dev.runwayml.com/v1/image_to_video",
                           json=payload, headers=headers)
        resp.raise_for_status()
        task_id = resp.json()["id"]

    # Poll until complete (up to 10 min)
    for _ in range(120):
        time.sleep(5)
        with httpx.Client(timeout=15) as client:
            resp = client.get(f"https://api.dev.runwayml.com/v1/tasks/{task_id}",
                              headers=headers)
        data = resp.json()
        status = data.get("status")
        if status == "SUCCEEDED":
            video_url = data["output"][0]
            break
        elif status in ("FAILED", "CANCELLED"):
            raise RuntimeError(f"RunwayML task {task_id} failed: {data.get('failure')}")

    # Download and re-upload to our storage
    with httpx.Client(timeout=60) as client:
        video_bytes = client.get(video_url).content

    from utils.storage import upload_bytes
    key = f"{project_id}/clips/clip_{clip_index:03d}.mp4"
    return upload_bytes(video_bytes, key, "video/mp4")
