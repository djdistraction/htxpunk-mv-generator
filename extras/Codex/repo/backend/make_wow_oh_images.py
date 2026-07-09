#!/usr/bin/env python3
"""
Generate the WOW OH! storyboard frames — and STOP before video.

Seeds the embedded WOW OH! demo and generates one frame per shot using the
configured IMAGE_BACKEND, leaving the project parked at
'awaiting_storyboard_approval'. The frames are then viewable and manageable in
the app's Storyboard view (review, regenerate, reorder) — no video is built.

Usage (from the backend/ directory), with a .env in the project root:

    IMAGE_BACKEND=cloudflare
    CLOUDFLARE_ACCOUNT_ID=...
    CLOUDFLARE_API_TOKEN=...

    python make_wow_oh_images.py

Then start the app (uvicorn main:app --port 8000  +  the frontend) and open the
project's Storyboard page to see all the images. Use IMAGE_BACKEND=placeholder
to dry-run offline with no credentials.

Re-running creates a fresh project each time; the script prints the project id
and a direct Storyboard URL.
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    from config import settings
    print("=" * 60)
    print("WOW OH! — storyboard frame generation (stops before video)")
    print("=" * 60)
    print(f"image backend : {settings.image_backend}")
    print(f"resolution    : {settings.output_resolution}")
    print(f"storage       : {settings.local_storage_path}")
    print("-" * 60)

    from database import init_db, db_get_project, db_get_assets
    asyncio.run(init_db())

    from seed_wow_oh import seed_series, seed_project, load_shots
    shots = load_shots(None)
    series_id = seed_series()
    project_id = seed_project(series_id, shots)

    # The manifest path: lock the plan, then generate a frame per shot. We call
    # the worker directly (same code the orchestrator runs) so this is a single,
    # synchronous, watchable build.
    from workers.pipeline_worker import run_manifest_generation

    print(f"\nGenerating {len(shots)} frames (backend={settings.image_backend})…")
    t0 = time.time()
    run_manifest_generation(project_id)

    panels = db_get_assets(project_id, asset_type="storyboard_panel")
    proj = db_get_project(project_id)
    print(f"\ngenerated {len(panels)} frames in {time.time() - t0:.0f}s")
    print(f"project stage: {proj.get('stage')}")

    missing = [p for p in panels if not p.get("url")]
    if missing:
        print(f"⚠️  {len(missing)} frames have no image URL — check logs above.")

    print("\n" + "=" * 60)
    print("✅ DONE — frames ready for review (no video built)")
    print(f"   project id : {project_id}")
    print(f"   open in app: http://localhost:3000/projects/{project_id}/storyboard")
    print("\n   Start the app if it isn't running:")
    print("     backend : uvicorn main:app --port 8000")
    print("     frontend: (in ../frontend)  npm run dev")
    print("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"\n❌ Build failed: {e}")
        sys.exit(1)
