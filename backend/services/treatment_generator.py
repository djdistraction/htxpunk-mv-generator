"""
Stage 2 — Visual Treatment Generation
Uses Groq free tier (Llama 3.3 70B).
"""
import json
from openai import OpenAI
from config import settings


def _groq_client():
    return OpenAI(api_key=settings.groq_api_key, base_url="https://api.groq.com/openai/v1")


def _has_groq_key() -> bool:
    key = (settings.groq_api_key or "").strip()
    return bool(key and not key.endswith("_HERE"))


def _fallback_treatment(
    analysis: dict,
    revision_notes: str = "",
    series: dict | None = None,
    creative_brief: str = "",
    reference_notes: str = "",
) -> dict:
    themes = analysis.get("themes") or ["performance", "emotion"]
    base_logline = (
        f"A visual journey through {', '.join(themes[:2])}, paced to the song's emotional arc."
    )
    if creative_brief.strip():
        base_logline = creative_brief.strip()[:240]
    if revision_notes.strip():
        base_logline = f"{base_logline} (Updated with requested revisions.)"

    characters = []
    if series and isinstance(series.get("characters"), list):
        for c in series.get("characters", []):
            if isinstance(c, dict) and c.get("name"):
                characters.append({
                    "name": c.get("name"),
                    "description": c.get("description") or c.get("look") or "Recurring series character.",
                    "role": c.get("role") or "series lead",
                    "states_needed": ["neutral", "performance", "emotional close-up"],
                })
    if not characters:
        characters = [{
            "name": "Lead Performer",
            "description": "Primary on-screen performer driving the visual narrative.",
            "role": "protagonist",
            "states_needed": ["neutral", "performance", "emotional close-up"],
        }]

    locations = [
        {"name": "Main performance set", "description": "Core stage environment for recurring shots.", "mood": "dramatic"},
        {"name": "Atmospheric secondary set", "description": "Contrasting environment for visual variation.", "mood": "reflective"},
    ]

    return {
        "logline": base_logline,
        "visual_style": series.get("style_prompt") if series and series.get("style_prompt") else "Stylized music-video look with strong contrast and cinematic framing.",
        "color_palette": (analysis.get("color_mood") or ["neon purple", "midnight blue", "warm amber"])[:6],
        "world_description": "A guided-production storyboard world designed to be editable, where each scene can be refined manually or regenerated with AI.",
        "characters": characters,
        "locations": locations,
        "recurring_motifs": (analysis.get("visual_keywords") or ["silhouette", "texture", "lights"])[:5],
        "narrative_structure": analysis.get("narrative_arc") or "Start intimate, build intensity, and resolve with a strong closing image.",
        "image_gen_style_prompt": "cinematic music video frame, dynamic composition, dramatic lighting, rich contrast, coherent color grading, high detail, stylized realism",
    }


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
    if not _has_groq_key():
        return _fallback_treatment(
            analysis,
            revision_notes=revision_notes,
            series=series,
            creative_brief=creative_brief,
            reference_notes=reference_notes,
        )

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

    try:
        client = _groq_client()
        response = client.chat.completions.create(
            model=settings.groq_model,
            response_format={"type": "json_object"},
            temperature=0.85,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a visionary music video director. Create bold, specific, "
                        "cinematic visual treatments. Avoid clichés. Return JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": (
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
                    ),
                },
            ],
        )
        return json.loads(response.choices[0].message.content)
    except Exception:
        return _fallback_treatment(
            analysis,
            revision_notes=revision_notes,
            series=series,
            creative_brief=creative_brief,
            reference_notes=reference_notes,
        )
