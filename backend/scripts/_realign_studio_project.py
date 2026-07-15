"""Re-align a Studio project with the new whisper word mapper and print quality stats.

Usage (from backend/):
  python scripts/_realign_studio_project.py [project_id_prefix]
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

from services.lyrics_aligner import align_lyrics


def main() -> None:
    prefix = (sys.argv[1] if len(sys.argv) > 1 else "2f2fe793").strip()
    db_path = Path.home() / ".htxpunk-mv-generator/storage/studio-v2/studio.db"
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT id, title, data_json FROM projects WHERE id LIKE ?",
        (f"{prefix}%",),
    ).fetchone()
    if not row:
        raise SystemExit(f"No project matching {prefix}")

    data = json.loads(row["data_json"] or "{}")
    vocals = data.get("vocals_url")
    lyrics = (data.get("user_lyrics_text") or "").strip()
    if not lyrics:
        # rebuild from old segments if needed
        segs = (data.get("transcript") or {}).get("segments") or []
        lyrics = "\n".join(s.get("text") or "" for s in segs)
    if not vocals or not Path(str(vocals)).is_file():
        raise SystemExit(f"Missing vocals: {vocals}")
    if not lyrics.strip():
        raise SystemExit("No lyrics text on project")

    print(f"Project: {row['title']} ({row['id'][:8]})")
    print(f"Vocals: {vocals}")
    print(f"Lyric lines: {len([ln for ln in lyrics.splitlines() if ln.strip()])}")
    print("Aligning…")
    segments = align_lyrics(str(vocals), lyrics)
    durs = [float(s["end"]) - float(s["start"]) for s in segments]
    print(
        f"OK n={len(segments)} first={segments[0]['start']:.2f} "
        f"last={segments[-1]['end']:.2f} "
        f"min_dur={min(durs):.2f} max_dur={max(durs):.2f} "
        f"median={sorted(durs)[len(durs)//2]:.2f}"
    )
    zero = sum(1 for d in durs if d < 0.15)
    long = sum(1 for d in durs if d > 10)
    print(f"short(<0.15s)={zero} long(>10s)={long}")
    for i, s in enumerate(segments[:6]):
        print(f"  {i:02d} {s['start']:7.2f}-{s['end']:7.2f} {s['text'][:70]}")
    print("  …")
    for i, s in enumerate(segments[-6:], start=max(0, len(segments) - 6)):
        print(f"  {i:02d} {s['start']:7.2f}-{s['end']:7.2f} {s['text'][:70]}")

    # Persist so Studio can re-render without re-aligning in the UI
    data["transcript"] = {"segments": segments, "text": lyrics}
    data["user_lyrics_text"] = lyrics
    data["stage"] = "lyrics_ready"
    # clear old video so user re-renders with new times
    data["video_url"] = None
    data["base_video_url"] = None
    data["final_video_url"] = None
    data["error_message"] = None
    steps = dict(data.get("steps") or {})
    steps["lyrics"] = "needs_review"
    steps["lyric_video"] = "pending"
    data["steps"] = steps
    conn.execute(
        "UPDATE projects SET data_json=?, updated_at=datetime('now') WHERE id=?",
        (json.dumps(data), row["id"]),
    )
    conn.commit()
    print("Saved new transcript to Studio DB (video cleared — re-render step 5).")


if __name__ == "__main__":
    main()
