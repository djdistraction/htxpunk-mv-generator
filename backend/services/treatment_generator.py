"""
Stage 2: Visual Treatment Generator
- Takes song analysis and produces a full creative treatment proposal
- Treatment defines the visual world, characters, style, and recurring motifs
"""
import json
from openai import OpenAI
from config import settings

client = OpenAI(api_key=settings.openai_api_key)

TREATMENT_PROMPT = """You are an award-winning music video director. Based on the song
analysis below, generate a complete visual treatment for this music video.

SONG ANALYSIS:
{analysis}

LYRICS:
{lyrics}

Return a JSON object with this structure:
{{
  "logline": "One sentence describing the video concept",
  "visual_style": "Detailed aesthetic description",
  "color_palette": {{
    "primary": ["#hex1", "#hex2"],
    "secondary": ["#hex3", "#hex4"],
    "accent": ["#hex5"]
  }},
  "world_description": "Where does this video take place?",
  "time_of_day": "day/night/golden hour/multiple",
  "characters": [
    {{
      "name": "Character name",
      "role": "protagonist/antagonist/supporting",
      "appearance": "Detailed physical description for image generation",
      "emotional_arc": "How this character changes through the video",
      "states_needed": ["neutral", "singing", "running", "silhouette"]
    }}
  ],
  "locations": [
    {{
      "name": "Location name",
      "description": "Detailed visual description",
      "atmosphere": "mood/lighting/weather",
      "scenes_used_in": ["intro", "chorus"]
    }}
  ],
  "recurring_motifs": ["motif1", "motif2"],
  "image_gen_style_prompt": "Style suffix to append to ALL image prompts for consistency",
  "narrative_structure": "How visual story maps to song sections"
}}
Return ONLY valid JSON."""


def generate_treatment(analysis: dict, transcript: dict) -> dict:
    lyrics = " ".join([s["text"] for s in transcript.get("segments", [])])
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": TREATMENT_PROMPT.format(
                analysis=json.dumps(analysis, indent=2),
                lyrics=lyrics
            )
        }],
        response_format={"type": "json_object"},
        temperature=0.85
    )
    return json.loads(response.choices[0].message.content)
