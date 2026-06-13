"""
Stage 3: Element Extraction
- Parses approved treatment + lyrics to build the complete element registry
- Every visual element is named, described, and given all required states
"""
import json
from openai import OpenAI
from config import settings

client = OpenAI(api_key=settings.openai_api_key)


def extract_elements(treatment: dict, analysis: dict, transcript: dict) -> dict:
    """Returns a structured element registry."""
    style_suffix = treatment.get("image_gen_style_prompt", "")

    prompt = f"""You are preparing production assets for a music video.

APPROVED TREATMENT:
{json.dumps(treatment, indent=2)}

SONG SECTIONS:
{json.dumps(analysis.get("sections", []), indent=2)}

Create a complete element registry. Every element that needs to be visually
generated must be listed with all required states.

Return JSON:
{{
  "backgrounds": [
    {{
      "id": "bg_001",
      "name": "Downtown Alley - Night",
      "location_ref": "Location name from treatment",
      "image_prompt": "Full detailed FLUX.1 prompt. No characters. Wide shot. Static background only. {style_suffix}",
      "width": 1920,
      "height": 1080,
      "sections_used": ["verse_1", "chorus"]
    }}
  ],
  "characters": [
    {{
      "id": "char_001",
      "name": "Character name",
      "base_appearance": "Full description for consistent generation",
      "states": [
        {{
          "state_id": "char_001_neutral",
          "state_name": "neutral standing",
          "image_prompt": "Full prompt. White background. Full body. Centered. {style_suffix}",
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
          "image_prompt": "Full prompt. White background. Centered object. {style_suffix}"
        }}
      ]
    }}
  ],
  "style_suffix": "{style_suffix}"
}}
Return ONLY valid JSON."""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.5
    )
    return json.loads(response.choices[0].message.content)
