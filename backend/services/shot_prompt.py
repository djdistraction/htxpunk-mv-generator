"""
Shot prompt builder.

Turns a locked shot manifest (+ optional series continuity bible) into a
concrete image-generation prompt and a negative-constraint string. This is the
bridge between the production plan and image generation: an approved manifest
deterministically produces the prompt used to render its frame.
"""
from typing import Optional


def build_shot_prompt(shot: dict, continuity_bible: Optional[dict] = None,
                      style_prompt: str = "", reference_notes: str = "") -> str:
    """Compose a full-frame image prompt from a shot manifest.

    Order matters for diffusion models: subject/action first, then setting,
    then camera, then mood/style. Continuity-bible style is appended so every
    shot in a series shares a coherent look.

    reference_notes: user-supplied reference material (same text threaded
    through treatment/element/storyboard generation), appended after style so
    a referenced character/prop/location can still surface per-shot even on
    the manifest-driven path, which otherwise builds prompts purely from the
    shot fields and never saw this context at all.
    """
    parts: list[str] = []

    characters = shot.get("characters") or []
    if characters:
        parts.append(", ".join(characters))

    action = (shot.get("action") or "").strip()
    if action:
        parts.append(action)

    location = (shot.get("location") or "").strip()
    if location:
        parts.append(f"in {location}")

    camera = (shot.get("camera") or "").strip()
    if camera:
        parts.append(camera)

    mood = (shot.get("mood") or "").strip()
    if mood:
        parts.append(f"{mood} mood")

    # Continuity-bible look
    bible = continuity_bible or {}
    palette = bible.get("color_palette") or []
    if palette:
        parts.append("color palette: " + ", ".join(palette))
    motion = bible.get("motion_style")
    if motion:
        parts.append(motion)

    if style_prompt:
        parts.append(style_prompt)

    if reference_notes.strip():
        parts.append(reference_notes.strip())

    # Per-shot continuity rules reinforce consistency
    for rule in (shot.get("continuity_rules") or [])[:4]:
        parts.append(rule)

    prompt = ". ".join(p for p in parts if p)
    return prompt.strip(" .")


def build_negative_prompt(shot: dict, continuity_bible: Optional[dict] = None) -> str:
    """Compose a negative prompt from shot + series banned mistakes."""
    negatives: list[str] = list(shot.get("negative_constraints") or [])

    bible = continuity_bible or {}
    negatives.extend(bible.get("banned_mistakes") or [])

    # always-on quality guards
    negatives.extend([
        "text", "watermark", "logo", "extra limbs",
        "deformed hands", "low quality", "blurry",
    ])

    # dedupe while preserving order
    seen, out = set(), []
    for n in negatives:
        key = n.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(n.strip())
    return ", ".join(out)


def shot_duration_seconds(shot: dict, default: float = 5.0) -> float:
    """Compute a shot's on-screen duration from its timecodes."""
    start = _to_seconds(shot.get("start_time"))
    end = _to_seconds(shot.get("end_time"))
    if start is not None and end is not None and end > start:
        return round(end - start, 2)
    return default


def _to_seconds(tc) -> Optional[float]:
    if tc is None:
        return None
    s = str(tc).strip()
    if not s:
        return None
    try:
        if ":" in s:
            parts = [float(p) for p in s.split(":")]
            if len(parts) == 3:
                return parts[0] * 3600 + parts[1] * 60 + parts[2]
            if len(parts) == 2:
                return parts[0] * 60 + parts[1]
            return parts[0]
        return float(s)
    except (ValueError, TypeError):
        return None
