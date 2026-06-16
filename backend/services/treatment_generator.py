"""
Stage 2 — Visual Treatment Generation
Uses Groq free tier (Llama 3.3 70B).
Swap groq_model to gpt-4o in config if you want to upgrade later.
"""
import json
from openai import OpenAI
from config import settings

def _groq_client():
    return OpenAI(api_key=settings.groq_api_key, base_url="https://api.groq.com/openai/v1")

def generate_treatment(analysis: dict) -> dict:
    """Generate a full visual treatment from song analysis."""
    client = _groq_client()
    response = client.chat.completions.create(
        model=settings.groq_model,
        response_format={"type": "json_object"},
        temperature=0.85,
        messages=[
            {"role": "system", "content": (
                "You are a visionary music video director. Create bold, specific, "
                "cinematic visual treatments. Avoid clichés. Return JSON only."
            )},
            {"role": "user", "content": f"""Create a complete music video visual treatment.

SONG ANALYSIS:
{json.dumps(analysis, indent=2)}

Return JSON with:
- logline: one-sentence visual pitch (compelling, specific)
- visual_style: art style and aesthetic (specific — not just "cinematic")
- color_palette: list of 4-6 specific colors with hex codes
- world_description: the world this video lives in (2-3 sentences)
- characters: list of {{name, description, role, states_needed: [list of visual states/poses needed]}}
- locations: list of {{name, description, mood}} — 2-4 distinct environments
- recurring_motifs: list of 3-5 visual symbols that recur throughout
- narrative_structure: how the visuals arc across the song (3-4 sentences)
- image_gen_style_prompt: a FLUX image generation style suffix (15-25 words) that will be appended to ALL image prompts to ensure visual consistency. Be specific about art style, rendering, lighting."""}
        ]
    )
    return json.loads(response.choices[0].message.content)
