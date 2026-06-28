#!/usr/bin/env python3
"""
One-command WOW OH! video build.

Seeds the embedded WOW OH! demo (series + 30 shot manifests), generates a frame
for every shot using the configured IMAGE_BACKEND, then assembles the timed
Ken Burns video with ffmpeg. Produces a real .mp4 you can play.

Usage (from the backend/ directory), with a .env in the project root, or env vars:

    IMAGE_BACKEND=cloudflare
    CLOUDFLARE_ACCOUNT_ID=...
    CLOUDFLARE_API_TOKEN=...

    python make_wow_oh_video.py

With IMAGE_BACKEND=placeholder it runs fully offline (no creds, non-final art).
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    from config import settings
    print("=" * 60)
    print("WOW OH! — full video build")
    print("=" * 60)
    print(f"image backend : {settings.image_backend}")
    print(f"video backend : {settings.video_backend}")
    print(f"resolution    : {settings.output_resolution}")
    print(f"storage       : {settings.local_storage_path}")
    print("-" * 60)

    from database import init_db, db_get_project, db_get_assets
    asyncio.run(init_db())

    from seed_wow_oh import seed_series, seed_project, load_shots
    shots = load_shots(None)
    series_id = seed_series()
    project_id = seed_project(series_id, shots)

    from workers.pipeline_worker import run_manifest_generation, run_video_assembly

    print(f"\n[1/2] Generating {len(shots)} shot frames "
          f"(backend={settings.image_backend})… this is the slow part.")
    t0 = time.time()
    run_manifest_generation(project_id)
    panels = db_get_assets(project_id, asset_type="storyboard_panel")
    print(f"      generated {len(panels)} frames in {time.time() - t0:.0f}s")

    print("\n[2/2] Assembling video with ffmpeg…")
    t0 = time.time()
    run_video_assembly(project_id)
    proj = db_get_project(project_id)
    print(f"      assembled in {time.time() - t0:.0f}s")

    video_url = proj.get("video_url")
    if not video_url:
        print("\n❌ No video produced — check the logs above for the failing stage.")
        sys.exit(1)

    from utils.storage import url_to_local_path
    local = url_to_local_path(video_url)
    print("\n" + "=" * 60)
    print("✅ DONE")
    print(f"   video: {local}")
    print(f"   exists: {os.path.exists(local)} "
          f"size: {os.path.getsize(local) if os.path.exists(local) else 0} bytes")
    print("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"\n❌ Build failed: {e}")
        sys.exit(1)
