"""
Stage 5b: Storyboard Builder
Maps lyrics + timestamps to visual scenes using Groq (free tier).
"""
import json
from openai import OpenAI
from config import settings


def _groq_client():
    return OpenAI(api_key=settings.groq_api_key, base_url="https://api.groq.com/openai/v1")


def _has_groq_key() -> bool:
    key = (settings.groq_api_key or "").strip()
    return bool(key and not key.endswith("_HERE"))


def _fallback_scene_plan(treatment: dict, elements: dict, analysis: dict) -> list[dict]:
    transcript = analysis.get("transcript", {})
    segments = transcript.get("segments", [])
    song_duration = float(analysis.get("song_duration", 180) or 180)
    song_duration = max(song_duration, 12.0)
    num_panels = max(6, int(song_duration / 8))

    backgrounds = elements.get("backgrounds", []) or []
    bg_ids = [b.get("id") for b in backgrounds if b.get("id")]

    state_ids = []
    for c in elements.get("characters", []) or []:
        for s in c.get("states", []) or []:
            if s.get("state_id"):
                state_ids.append(s["state_id"])
    for p in elements.get("props", []) or []:
        for s in p.get("states", []) or []:
            if s.get("state_id"):
                state_ids.append(s["state_id"])

    panels = []
    span = song_duration / num_panels
    for i in range(num_panels):
        start = round(i * span, 2)
        end = round(song_duration if i == num_panels - 1 else (i + 1) * span, 2)
        lyric = ""
        if segments:
            seg = segments[min(i, len(segments) - 1)]
            lyric = (seg.get("text") or "").strip()

        visible = []
        if state_ids:
            sid = state_ids[i % len(state_ids)]
            visible.append({
                "state_id": sid,
                "x": 0.5 if i % 2 == 0 else 0.38,
                "y": 0.74,
                "scale": 0.40,
                "z_index": 1,
            })

        panels.append({
            "panel_id": f"panel_{i + 1:03d}",
            "panel_index": i,
            "timestamp_start": start,
            "timestamp_end": end,
            "background_id": bg_ids[i % len(bg_ids)] if bg_ids else "",
            "elements_visible": visible,
            "energy_level": round(min(1.0, 0.45 + (i / max(num_panels - 1, 1)) * 0.35), 2),
            "scene_description": treatment.get("logline") or "Guided production panel.",
            "lyric_at_this_moment": lyric,
        })
    return panels


def build_scene_plan(treatment: dict, elements: dict, analysis: dict) -> list[dict]:
    """Returns ordered list of storyboard panels."""
    if not _has_groq_key():
        return _fallback_scene_plan(treatment, elements, analysis)

    transcript = analysis.get("transcript", {})
    song_duration = analysis.get("song_duration", 180)
    num_panels = max(6, int(song_duration / 8))

    bg_list = [{"id": b["id"], "name": b["name"]} for b in elements.get("backgrounds", [])]
    char_states = {
        c["name"]: [{"state_id": s["state_id"], "name": s["state_name"]}
                    for s in c.get("states", [])]
        for c in elements.get("characters", [])
    }
    prop_states = {
        p["name"]: [{"state_id": s["state_id"], "name": s["state_name"]}
                    for s in p.get("states", [])]
        for p in elements.get("props", [])
    }

    prompt_lines = [
        "Create a storyboard for this music video.",
        "",
        "TREATMENT:",
        f"Logline: {treatment.get('logline', '')}",
        f"Style: {treatment.get('visual_style', '')}",
        f"Narrative: {treatment.get('narrative_structure', '')}",
        "",
        "AVAILABLE BACKGROUNDS (use id to reference):",
        json.dumps(bg_list, indent=2),
        "",
        "CHARACTER STATES (use state_id to reference):",
        json.dumps(char_states, indent=2),
        "",
        "PROP STATES (use state_id to reference):",
        json.dumps(prop_states, indent=2),
        "",
        "SONG SEGMENTS:",
        json.dumps(transcript.get("segments", [])[:30], indent=2),
        "",
        f"Song duration: ~{song_duration}s. Create {num_panels} storyboard panels.",
        "",
        'Return a JSON object: {"panels": [{"panel_id": "panel_001", "panel_index": 0,',
        '"timestamp_start": 0.0, "timestamp_end": 8.0, "background_id": "bg_001",',
        '"elements_visible": [{"state_id": "char_001_neutral", "x": 0.5, "y": 0.75, "scale": 0.4, "z_index": 1}],',
        '"energy_level": 0.6, "scene_description": "...", "lyric_at_this_moment": "..."}]}',
        "",
        "Rules:",
        f"- Cover the full song duration across {num_panels} panels",
        "- Match visual energy (0.0-1.0) to song energy at each moment",
        "- Use background_id values from AVAILABLE BACKGROUNDS",
        "- Use state_id values from CHARACTER/PROP STATES",
        "- Vary character positions and states to tell the visual story",
    ]

    try:
        client = _groq_client()
        response = client.chat.completions.create(
            model=settings.groq_model,
            response_format={"type": "json_object"},
            temperature=0.6,
            messages=[
                {"role": "system", "content": "You are a music video storyboard director. Return JSON only."},
                {"role": "user", "content": "\n".join(prompt_lines)},
            ],
        )

        result = json.loads(response.choices[0].message.content)
        panels = result.get("panels", result) if isinstance(result, dict) else result
        return panels if isinstance(panels, list) else []
    except Exception:
        return _fallback_scene_plan(treatment, elements, analysis)
