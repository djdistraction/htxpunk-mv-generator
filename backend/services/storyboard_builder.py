"""
Stage 5b: Storyboard Builder
Maps lyrics + timestamps to visual scenes using Groq (free tier).
"""
import json
from openai import OpenAI
from config import settings
from utils.groq_json import call_groq_json


def _groq_client():
    return OpenAI(api_key=settings.groq_api_key, base_url="https://api.groq.com/openai/v1")


def build_scene_plan(
    treatment: dict,
    elements: dict,
    analysis: dict,
    creative_brief: str = "",
    reference_notes: str = "",
) -> list[dict]:
    """Returns ordered list of storyboard panels.

    creative_brief / reference_notes: same user-supplied context threaded
    through treatment/element generation — kept in scope here too so a
    referenced scene or moment the artist described can actually land in the
    storyboard, not just the treatment's prose.
    """
    client = _groq_client()

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
    ]

    if creative_brief.strip():
        prompt_lines += [
            "ARTIST'S CREATIVE VISION:",
            creative_brief.strip(),
            "",
        ]
    if reference_notes.strip():
        prompt_lines += [
            "REFERENCE MATERIAL the artist supplied. If a described scene, "
            "character, or moment fits a panel, use it by name rather than "
            "inventing a replacement:",
            reference_notes.strip(),
            "",
        ]

    prompt_lines += [
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
        "- timestamp_start/timestamp_end must be plain numbers in seconds "
        "(e.g. 8.0) — never expressions or formulas",
    ]

    content = call_groq_json(
        client, model=settings.groq_model,
        system="You are a music video storyboard director. Return JSON only.",
        user="\n".join(prompt_lines), temperature=0.6,
    )

    result = json.loads(content)
    panels = result.get("panels", result) if isinstance(result, dict) else result
    return panels if isinstance(panels, list) else []
