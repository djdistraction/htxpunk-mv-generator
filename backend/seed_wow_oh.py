#!/usr/bin/env python3
"""
Seed the WOW OH! demo: series + continuity bible + 30 shot manifests.

By default this uses the embedded canonical WOW OH! data — no external file
needed:

  cd backend
  python seed_wow_oh.py

Optionally import an Excel production shot sheet instead:

  python seed_wow_oh.py /path/to/WOW_OH_Production_Shot_Sheet.xlsx

Creates a "WOW OH!" series and a demo project parked at
awaiting_manifest_approval, ready to review → approve → generate → render.
"""
import sys
import uuid
import asyncio
from pathlib import Path


def seed_series() -> str:
    """Create the WOW OH! series with locked continuity bible + characters."""
    from database import db_create_series, db_update_series
    from services.wow_oh_data import CONTINUITY_BIBLE, CHARACTERS, STYLE_PROMPT

    series_id = str(uuid.uuid4())
    db_create_series(series_id, name="WOW OH!", artist="HTXpunk")
    db_update_series(
        series_id,
        continuity_bible=CONTINUITY_BIBLE,
        characters=CHARACTERS,
        color_palette=CONTINUITY_BIBLE["color_palette"],
        style_prompt=STYLE_PROMPT,
    )
    print(f"✓ Created WOW OH! series: {series_id}")
    print(f"  palette: {', '.join(CONTINUITY_BIBLE['color_palette'])}")
    print(f"  characters: {', '.join(CHARACTERS.keys())}")
    return series_id


def seed_project(series_id: str, shots: list) -> str:
    """Create a demo project with shot manifests, parked for approval."""
    from database import db_create_project, db_update_project
    from services.production_guide_importer import create_project_shot_manifests

    project_id = str(uuid.uuid4())
    db_create_project(project_id, "WOW OH! Demo", "HTXpunk")
    db_update_project(project_id, series_id=series_id)
    manifest_ids = create_project_shot_manifests(project_id, shots)
    db_update_project(
        project_id,
        stage="awaiting_manifest_approval",
        revision_notes=f"Seeded {len(manifest_ids)} WOW OH! shot manifests",
    )
    print(f"✓ Created demo project: {project_id}")
    print(f"  stage: awaiting_manifest_approval")
    print(f"  shots: {len(manifest_ids)} manifests")
    return project_id


def load_shots(xlsx_path: str | None) -> list:
    if xlsx_path:
        from services.production_guide_importer import parse_excel_shot_sheet
        print(f"\U0001F4CB Importing shots from: {xlsx_path}")
        parsed = parse_excel_shot_sheet(xlsx_path)
        return parsed["shots"]
    from services.wow_oh_data import SHOTS
    print(f"\U0001F4CB Using embedded WOW OH! data ({len(SHOTS)} shots)")
    return SHOTS


def main():
    xlsx_path = None
    if len(sys.argv) == 2:
        xlsx_path = sys.argv[1]
        if not Path(xlsx_path).exists():
            print(f"❌ File not found: {xlsx_path}")
            sys.exit(1)

    print("=" * 60)
    print("WOW OH! Demo Seeder")
    print("=" * 60)

    try:
        from database import init_db
        asyncio.run(init_db())

        shots = load_shots(xlsx_path)
        series_id = seed_series()
        project_id = seed_project(series_id, shots)

        print("\n" + "=" * 60)
        print("✅ Seeding complete!")
        print("\nNext steps:")
        print("  1. Start backend:  uvicorn main:app --reload --port 8000")
        print("  2. Start frontend: cd ../frontend && npm run dev")
        print(f"  3. Open the project, review the production plan, click Approve.")
        print("     With no HF_TOKEN set, frames render as offline placeholders")
        print("     (IMAGE_BACKEND=placeholder) so you get a full video at $0.")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
