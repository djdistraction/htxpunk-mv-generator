"""
Stage 6b: Storyboard Builder
- Uses GPT-4o to map lyrics + timestamps to visual scenes
- Each scene produces an open frame and a close frame for a 5-second clip
"""
import json
from openai import OpenAI
from config import settings

client = OpenAI(api_key=settings.openai_api_key)


def build_scene_plan(
    treatment: dict,
    elements: dict,
    transcript: dict,
    analysis: dict
) -> list[dict]:
    """Returns ordered list of storyboard panels (open/close pairs per clip)."""
    duration = transcript.get("duration", 180)
    num_clips = int(duration / 5) + 1

    bg_names = [b["name"] for b in elements.get("backgrounds", [])]
    char_states = {
        c["name"]: [s["state_name"] for s in c.get("states", [])]
        for c in elements.get("characters", [])
    }
    prop_states = {
        p["name"]: [s["state_name"] for s in p.get("states", [])]
        for p in elements.get("props", [])
    }

    prompt = f"""You are a music video storyboard director.

TREATMENT LOGLINE: {treatment.get("logline", "")}
VISUAL STYLE: {treatment.get("visual_style", "")}

AVAILABLE BACKGROUNDS: {json.dumps(bg_names)}
CHARACTER STATES: {json.dumps(char_states)}
PROP STATES: {json.dumps(prop_states)}

SONG SEGMENTS:
{json.dumps(transcript.get("segments", []), indent=2)}

The song is {duration:.1f}s long. We need {num_clips} clips of 5 seconds each.
Each clip needs TWO panels: an opening frame and a closing frame.
RunwayML will animate between them.

Return a JSON array of panels:
[
  {{
    "panel_id": "panel_001",
    "clip_index": 0,
    "frame_type": "open",
    "timestamp_start": 0.0,
    "background_id": "bg_001",
    "elements_visible": [
      {{"state_id": "char_001_neutral", "x": 0.5, "y": 0.75, "scale": 0.4, "z_index": 1}}
    ],
    "scene_description": "What the viewer sees and feels",
    "lyric_at_this_moment": "lyric text"
  }}
]

Rules:
- Every clip_index needs exactly one "open" and one "close" panel
- Order: clip 0 open, clip 0 close, clip 1 open, clip 1 close, ...
- Match visual energy to emotional content of the lyrics at that timestamp
Return ONLY a valid JSON array (not wrapped in an object)."""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.6
    )
    result = json.loads(response.choices[0].message.content)
    if isinstance(result, dict):
        for v in result.values():
            if isinstance(v, list):
                return v
    return result
