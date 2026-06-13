"""
Stage 7: Video Clip Generation via RunwayML Gen-4
- Animates pairs of storyboard panels (frame_a -> frame_b) into 5-second clips
"""
import time
import httpx
from config import settings
from utils.storage import upload_bytes

RUNWAY_API_URL = "https://api.dev.runwayml.com/v1"


def generate_clip(
    frame_a_url: str,
    frame_b_url: str,
    project_id: str,
    clip_index: int,
    scene_description: str = ""
) -> str:
    """
    Submits a Gen-4 image-to-image animation job.
    Polls until complete. Returns public URL of the 5-second MP4.
    """
    headers = {
        "Authorization": f"Bearer {settings.runwayml_api_secret}",
        "X-Runway-Version": "2024-11-06",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "gen4_turbo",
        "promptImage": frame_a_url,
        "promptImageEnd": frame_b_url,
        "promptText": scene_description or "Smooth cinematic animation",
        "duration": 5,
        "ratio": "1280:720"
    }

    create_resp = httpx.post(
        f"{RUNWAY_API_URL}/image_to_video",
        json=payload,
        headers=headers,
        timeout=30
    )
    create_resp.raise_for_status()
    task_id = create_resp.json()["id"]

    # Poll for completion (max ~10 minutes)
    for _ in range(120):
        time.sleep(5)
        status_resp = httpx.get(
            f"{RUNWAY_API_URL}/tasks/{task_id}",
            headers=headers,
            timeout=15
        )
        status_resp.raise_for_status()
        task = status_resp.json()

        if task["status"] == "SUCCEEDED":
            video_url = task["output"][0]
            video_bytes = httpx.get(video_url, timeout=120).content
            path = f"projects/{project_id}/clips/clip_{clip_index:04d}.mp4"
            return upload_bytes(video_bytes, path, content_type="video/mp4")

        if task["status"] == "FAILED":
            raise RuntimeError(f"RunwayML failed: {task.get('failure', 'unknown')}")

    raise TimeoutError(f"RunwayML task {task_id} timed out")
