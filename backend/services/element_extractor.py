"""
Stage 3 — Element Extraction
Parses the approved treatment + song analysis to build a complete element registry.
Every visual that needs to be generated is listed here with all required states.
Uses Groq free tier (same as treatment generator).
"""
import json
from openai import OpenAI
from config import settings
from utils.groq_json import call_groq_json


def _groq_client():
    return OpenAI(api_key=settings.groq_api_key, base_url="https://api.groq.com/openai/v1")


def extract_elements(
    treatment: dict,
    analysis: dict,
    creative_brief: str = "",
    reference_notes: str = "",
) -> dict:
    """
    Returns a structured element registry with backgrounds, characters, and props.
    Each element includes all required image generation prompts.

    - creative_brief / reference_notes: the same user-supplied context already
      fed into song analysis and treatment generation. Previously this stopped
      after the treatment stage — a reference character/prop the artist
      described could shape the treatment's narrative but the element registry
      (what actually gets generated as images) never saw it, so the asset
      never showed up. Threading it through here keeps it in scope for exactly
      what this stage decides: which backgrounds/characters/props to generate.
    """
    client = _groq_client()
    style_suffix = treatment.get("image_gen_style_prompt", "")

    system_prompt = (
        "You are a music video production designer. "
        "Given an approved treatment and song structure, produce a complete "
        "asset registry — every image that needs to be generated. "
        "Be specific and production-ready. Return JSON only."
    )

    reference_block = ""
    if creative_brief.strip():
        reference_block += (
            f"\n\nARTIST'S CREATIVE VISION:\n\"{creative_brief.strip()}\""
        )
    if reference_notes.strip():
        reference_block += (
            f"\n\nREFERENCE MATERIAL the artist supplied. If a background, "
            f"character, or prop is described here, use it — reuse the names "
            f"and descriptions given rather than inventing replacements:\n"
            f"{reference_notes.strip()}"
        )

    user_prompt = f"""Create a complete visual asset registry for this music video.

APPROVED TREATMENT:
{json.dumps(treatment, indent=2)}

SONG SECTIONS:
{json.dumps(analysis.get("sections", []), indent=2)}
{reference_block}

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
- State IDs must be globally unique across the entire registry"""

    content = call_groq_json(
        client, model=settings.groq_model, system=system_prompt,
        user=user_prompt, temperature=0.5,
    )
    result = json.loads(content)
    result.setdefault("backgrounds", [])
    result.setdefault("characters", [])
    result.setdefault("props", [])
    result.setdefault("style_suffix", style_suffix)
    return result
