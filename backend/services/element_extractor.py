"""
Stage 3 — Element Extraction
Parses the approved treatment + song analysis to build a complete element registry.
Every visual that needs to be generated is listed here with all required states.
Uses Groq free tier (same as treatment generator).
"""
import json
import re
from openai import OpenAI
from config import settings


def _groq_client():
    return OpenAI(api_key=settings.groq_api_key, base_url="https://api.groq.com/openai/v1")


def _has_groq_key() -> bool:
    key = (settings.groq_api_key or "").strip()
    return bool(key and not key.endswith("_HERE"))


def _slug(value: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")
    return clean or "item"


def _fallback_elements(treatment: dict, analysis: dict) -> dict:
    style_suffix = treatment.get("image_gen_style_prompt", "")

    locations = treatment.get("locations") or []
    if not locations:
        locations = [{"name": "Main performance set", "description": "Primary environment"}]
    backgrounds = []
    for i, loc in enumerate(locations[:4], 1):
        name = loc if isinstance(loc, str) else (loc.get("name") or f"Location {i}")
        desc = "" if isinstance(loc, str) else (loc.get("description") or "")
        bg_id = f"bg_{i:03d}"
        backgrounds.append({
            "id": bg_id,
            "name": name,
            "location_ref": name,
            "image_prompt": f"{name}. {desc} Wide establishing shot. No people. Static environment. {style_suffix}".strip(),
            "width": 1920,
            "height": 1080,
            "sections_used": [s.get("name", "section") for s in (analysis.get("sections") or [])[:3]],
        })

    characters = []
    for i, char in enumerate((treatment.get("characters") or [])[:4], 1):
        name = char.get("name") if isinstance(char, dict) else str(char)
        if not name:
            name = f"Character {i}"
        base_appearance = (char.get("description") if isinstance(char, dict) else "") or "Consistent stylized appearance."
        states_needed = (char.get("states_needed") if isinstance(char, dict) else None) or ["neutral", "performance", "emotional close-up"]
        states = []
        for j, state_name in enumerate(states_needed[:4], 1):
            sid = f"char_{i:03d}_{_slug(str(state_name))}"
            states.append({
                "state_id": sid,
                "state_name": str(state_name),
                "image_prompt": f"{name}, {state_name}. Full body. Plain white background. Centered. {style_suffix}".strip(),
                "position_hint": "lower-third center",
            })
        characters.append({
            "id": f"char_{i:03d}",
            "name": name,
            "base_appearance": base_appearance,
            "states": states,
        })

    motifs = treatment.get("recurring_motifs") or []
    props = []
    for i, motif in enumerate(motifs[:2], 1):
        name = str(motif)
        pid = f"prop_{i:03d}"
        props.append({
            "id": pid,
            "name": name,
            "states": [{
                "state_id": f"{pid}_default",
                "state_name": "default",
                "image_prompt": f"{name}. White background. Object only, centered. {style_suffix}".strip(),
            }],
        })

    return {
        "backgrounds": backgrounds,
        "characters": characters,
        "props": props,
        "style_suffix": style_suffix,
    }


def extract_elements(treatment: dict, analysis: dict) -> dict:
    """
    Returns a structured element registry with backgrounds, characters, and props.
    Each element includes all required image generation prompts.
    """
    if not _has_groq_key():
        return _fallback_elements(treatment, analysis)

    style_suffix = treatment.get("image_gen_style_prompt", "")

    try:
        client = _groq_client()
        response = client.chat.completions.create(
            model=settings.groq_model,
            response_format={"type": "json_object"},
            temperature=0.5,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a music video production designer. "
                        "Given an approved treatment and song structure, produce a complete "
                        "asset registry — every image that needs to be generated. "
                        "Be specific and production-ready. Return JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": f"""Create a complete visual asset registry for this music video.

APPROVED TREATMENT:
{json.dumps(treatment, indent=2)}

SONG SECTIONS:
{json.dumps(analysis.get("sections", []), indent=2)}

Return JSON with this exact structure:
{{
  "backgrounds": [
    {{
      "id": "bg_001",
      "name": "Location name",
      "location_ref": "matching location name from treatment",
      "image_prompt": "Complete FLUX.1 prompt. Wide establishing shot. No people. Static environment. {style_suffix}",
      "width": 1920,
      "height": 1080,
      "sections_used": ["verse_1", "chorus"]
    }}
  ],
  "characters": [
    {{
      "id": "char_001",
      "name": "Character name",
      "base_appearance": "Detailed visual description for consistent generation",
      "states": [
        {{
          "state_id": "char_001_neutral",
          "state_name": "neutral standing",
          "image_prompt": "Complete FLUX.1 prompt. Plain white background. Full body. Centered. {style_suffix}",
          "position_hint": "lower-third center"
        }}
      ]
    }}
  ],
  "props": [
    {{
      "id": "prop_001",
      "name": "Prop name",
      "states": [
        {{
          "state_id": "prop_001_default",
          "state_name": "default",
          "image_prompt": "Complete FLUX.1 prompt. White background. Object only, centered. {style_suffix}"
        }}
      ]
    }}
  ],
  "style_suffix": "{style_suffix}"
}}

Rules:
- 2-4 backgrounds (one per major location)
- All characters from the treatment with 2-4 states each (neutral, emotional peaks, action moments)
- Props only if central to the treatment narrative
- Every image_prompt is complete and standalone — no "as above" references
- State IDs must be globally unique across the entire registry""",
                },
            ],
        )

        result = json.loads(response.choices[0].message.content)
        result.setdefault("backgrounds", [])
        result.setdefault("characters", [])
        result.setdefault("props", [])
        result.setdefault("style_suffix", style_suffix)
        return result
    except Exception:
        return _fallback_elements(treatment, analysis)
