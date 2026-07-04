"""
Stage 2 — Visual Treatment Generation
Uses Groq free tier (Llama 3.3 70B).
"""
import json
from openai import OpenAI
from config import settings
from utils.groq_json import call_groq_json


def _groq_client():
    return OpenAI(api_key=settings.groq_api_key, base_url="https://api.groq.com/openai/v1")


def generate_treatment(
    analysis: dict,
    revision_notes: str = "",
    series: dict | None = None,
    creative_brief: str = "",
    reference_notes: str = "",
) -> dict:
    """
    Generate a full visual treatment from song analysis.
    - revision_notes: if set, regenerate addressing user feedback
    - series: if set, inherit series style/characters for continuity
    - creative_brief: the artist's free-text vision for the video
    - reference_notes: descriptions of reference files the artist uploaded
    """
    client = _groq_client()

    brief_block = ""
    if creative_brief.strip():
        brief_block = (
            f"\n\nARTIST'S CREATIVE VISION — treat this as the primary brief. The "
            f"treatment must honor it:\n\"{creative_brief.strip()}\""
        )
    if reference_notes.strip():
        brief_block += (
            f"\n\nREFERENCE MATERIAL the artist supplied. Incorporate these specific "
            f"characters, places, and ideas (reuse their names and descriptions; do "
            f"not invent replacements for things already described here):\n"
            f"{reference_notes.strip()}"
        )

    revision_block = ""
    if revision_notes:
        revision_block = (
            f"\n\nREVISION REQUEST — the previous treatment was not approved. "
            f"User feedback:\n\"{revision_notes}\"\n\nAddress this feedback directly."
        )

    series_block = ""
    if series:
        chars_json = json.dumps(series.get("characters") or [], indent=2)
        palette_json = json.dumps(series.get("color_palette") or [], indent=2)
        series_block = (
            f"\n\nSERIES CONTINUITY — this video is part of the \"{series.get('name', '')}\" series. "
            f"Maintain visual consistency with the series:\n"
            f"Series style: {series.get('style_prompt', 'not specified')}\n"
            f"Series color palette: {palette_json}\n"
            f"Recurring characters (reuse these — keep names and descriptions consistent):\n{chars_json}\n"
            f"You may introduce new characters but must include the series characters above."
        )

    system_prompt = (
        "You are a visionary music video director. Create bold, specific, "
        "cinematic visual treatments. Avoid clichés. Return JSON only."
    )
    user_prompt = (
        "Create a complete music video visual treatment.\n\n"
        f"SONG ANALYSIS:\n{json.dumps(analysis, indent=2)}"
        f"{brief_block}"
        f"{series_block}"
        f"{revision_block}\n\n"
        "Return JSON with:\n"
        "- logline: one-sentence visual pitch (compelling, specific)\n"
        "- visual_style: art style and aesthetic (specific — not just 'cinematic')\n"
        "- color_palette: list of 4-6 specific colors with hex codes\n"
        "- world_description: the world this video lives in (2-3 sentences)\n"
        "- characters: list of {name, description, role, states_needed: [visual states/poses needed]}\n"
        "- locations: list of {name, description, mood} — 2-4 distinct environments\n"
        "- recurring_motifs: list of 3-5 visual symbols that recur throughout\n"
        "- narrative_structure: how the visuals arc across the song (3-4 sentences)\n"
        "- image_gen_style_prompt: a FLUX style suffix (15-25 words) appended to ALL "
        "image prompts to ensure visual consistency. Be specific about art style, rendering, lighting."
    )
    content = call_groq_json(
        client, model=settings.groq_model, system=system_prompt,
        user=user_prompt, temperature=0.85,
    )
    return json.loads(content)
