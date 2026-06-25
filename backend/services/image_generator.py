"""
Stages 4-5 — Image Generation
Uses Hugging Face Inference Providers with FLUX.1-schnell, with an offline
placeholder fallback so the whole pipeline runs end-to-end at $0.

NOTE: HuggingFace retired the old serverless endpoint
(api-inference.huggingface.co) and replaced it with the Inference Providers
system, which routes through router.huggingface.co. The InferenceClient picks
a provider via the `provider` argument ("auto" by default). Usage is billed
against your HF account; free accounts get a small monthly credit.

Image backend selection (settings.image_backend):
  "auto"        — HF FLUX when HF_TOKEN is present, else placeholder
  "huggingface" — always call HF (raises if no token)
  "placeholder" — always render local placeholder frames (no API, offline)

To pin a specific provider (e.g. fal-ai, replicate, nebius): set HF_PROVIDER.
When you have a local GPU: point at your own ComfyUI API instead.
"""
import io
import time
import hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from config import settings
from utils.storage import upload_bytes


# ── Backend selection ─────────────────────────────────────────────────────────

def _use_placeholder() -> bool:
    """Decide whether to render placeholder frames instead of calling HF."""
    backend = (settings.image_backend or "auto").lower()
    if backend == "placeholder":
        return True
    if backend == "huggingface":
        return False
    # auto: use placeholder when no usable HF token is configured
    token = (settings.hf_token or "").strip()
    return not token or token == "hf_YOUR_TOKEN_HERE"


# ── Placeholder renderer (offline, no API) ────────────────────────────────────

_PALETTE = [
    (124, 217, 105),   # poisonous green
    (138, 79, 191),    # purple
    (240, 180, 41),    # amber
    (20, 20, 24),      # near-black
    (235, 64, 160),    # hot pink
]


def _color_for(seed: str) -> tuple[int, int, int]:
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    return _PALETTE[h % len(_PALETTE)]


def _load_font(size: int):
    for name in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _wrap(draw, text: str, font, max_width: int) -> list[str]:
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=font) <= max_width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def render_placeholder(prompt: str, width: int, height: int,
                       label: str = "", subtitle: str = "") -> bytes:
    """Render a styled placeholder frame so the pipeline produces real output
    without any image API. Uses the WOW OH! palette and overlays shot text."""
    c1 = _color_for(prompt or label)
    c2 = _color_for((prompt or label) + "x")
    img = Image.new("RGB", (width, height), c1)

    # vertical gradient between two palette colors
    top, bot = c1, c2
    for y in range(height):
        t = y / max(height - 1, 1)
        r = int(top[0] * (1 - t) + bot[0] * t)
        g = int(top[1] * (1 - t) + bot[1] * t)
        b = int(top[2] * (1 - t) + bot[2] * t)
        img.paste((r, g, b), (0, y, width, y + 1))

    draw = ImageDraw.Draw(img, "RGBA")
    # darken center band for legible text
    band_h = int(height * 0.5)
    draw.rectangle([0, (height - band_h) // 2, width, (height + band_h) // 2],
                   fill=(0, 0, 0, 130))

    margin = int(width * 0.08)
    if label:
        lf = _load_font(int(height * 0.10))
        draw.text((margin, int(height * 0.18)), label, font=lf, fill=(255, 255, 255))

    pf = _load_font(int(height * 0.055))
    lines = _wrap(draw, prompt or "shot", pf, width - 2 * margin)[:5]
    y = int(height * 0.40)
    for line in lines:
        draw.text((margin, y), line, font=pf, fill=(245, 245, 245))
        y += int(height * 0.065)

    if subtitle:
        sf = _load_font(int(height * 0.040))
        draw.text((margin, int(height * 0.85)), subtitle, font=sf, fill=(210, 210, 210))

    draw.text((margin, int(height * 0.91)), "PREVIEW · placeholder render",
              font=_load_font(int(height * 0.028)), fill=(180, 180, 180))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ── HF FLUX renderer ──────────────────────────────────────────────────────────

def _generate_hf(full_prompt: str, width: int, height: int) -> bytes:
    from huggingface_hub import InferenceClient
    # provider goes in the constructor; "auto" lets HF route to an available
    # provider for the model. api_key takes the HF token for HF routing.
    client = InferenceClient(provider=settings.hf_provider, api_key=settings.hf_token)

    max_retries = 3
    retry_delay = 5
    for attempt in range(max_retries):
        try:
            # HF routing can rate-limit; a small pause between calls avoids 429s
            time.sleep(2)
            image = client.text_to_image(
                full_prompt,
                model=settings.hf_image_model,
                width=width,
                height=height,
            )
            buf = io.BytesIO()
            image.save(buf, format="PNG")
            return buf.getvalue()
        except Exception as e:
            error_str = str(e)
            # A dead/old endpoint hostname is a permanent failure — don't burn
            # retries on it. This points at a stale huggingface_hub install.
            if "api-inference.huggingface.co" in error_str and (
                "getaddrinfo" in error_str or "NameResolutionError" in error_str
            ):
                raise RuntimeError(
                    "huggingface_hub is calling the retired endpoint "
                    "'api-inference.huggingface.co'. Upgrade the library "
                    "(pip install -U huggingface_hub, >=0.28) so it uses the new "
                    "Inference Providers router, then restart the backend."
                ) from e
            if attempt < max_retries - 1:
                if "NameResolutionError" in error_str or "getaddrinfo failed" in error_str:
                    print(f"Network error (DNS/connectivity), retrying in {retry_delay}s... (attempt {attempt + 1}/{max_retries})")
                    time.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, 30)
                elif "401" in error_str or "Unauthorized" in error_str:
                    raise ValueError(f"HuggingFace authentication failed. Check HF_TOKEN in .env is valid. Error: {error_str}")
                elif "429" in error_str:
                    print(f"Rate limited, waiting {retry_delay * 2}s... (attempt {attempt + 1}/{max_retries})")
                    time.sleep(retry_delay * 2)
                else:
                    print(f"Image generation error, retrying... (attempt {attempt + 1}/{max_retries}): {error_str}")
                    time.sleep(retry_delay)
            else:
                raise


def generate_image(prompt: str, style_suffix: str = "", width: int = 1024, height: int = 576,
                   label: str = "", subtitle: str = "") -> bytes:
    """Generate an image and return raw PNG bytes.

    Routes to HF FLUX or the offline placeholder renderer based on
    settings.image_backend. Retries HF on transient network errors.
    """
    full_prompt = f"{prompt}. {style_suffix}".strip(" .")

    if _use_placeholder():
        return render_placeholder(full_prompt, width, height, label=label, subtitle=subtitle)

    return _generate_hf(full_prompt, width, height)


def generate_background(project_id: str, bg_id: str, prompt: str, style_suffix: str = "") -> str:
    """Generate a background image. Returns storage URL."""
    print(f"Generating background: {bg_id}")
    img_bytes = generate_image(
        f"{prompt}. Wide establishing shot. No people or figures. Static background.",
        style_suffix=style_suffix,
        width=1920, height=1080,
    )
    key = f"{project_id}/backgrounds/{bg_id}.png"
    return upload_bytes(img_bytes, key, "image/png")


def generate_element(project_id: str, element_id: str, prompt: str,
                     style_suffix: str = "", remove_bg: bool = True) -> str:
    """Generate a character/prop element. Optionally removes background."""
    print(f"Generating element: {element_id}")
    img_bytes = generate_image(
        f"{prompt}. Full body. Plain white background. Centered. No shadows.",
        style_suffix=style_suffix,
        width=768, height=1024,
    )

    if remove_bg and not _use_placeholder():
        try:
            from rembg import remove
            img_bytes = remove(img_bytes)
            key = f"{project_id}/elements/{element_id}.png"
            return upload_bytes(img_bytes, key, "image/png")
        except Exception as e:
            print(f"rembg failed ({e}), saving with white background")

    key = f"{project_id}/elements/{element_id}.png"
    return upload_bytes(img_bytes, key, "image/png")


def generate_shot_frame(project_id: str, shot_id: str, prompt: str,
                        style_suffix: str = "", label: str = "", subtitle: str = "",
                        width: int = 1920, height: int = 1080) -> str:
    """Generate a full-frame image for a shot manifest. Returns storage URL.

    Unlike backgrounds/elements, a shot frame is a complete composed image
    (characters in scene), which is what manifest-driven generation needs.
    """
    print(f"Generating shot frame: {shot_id}")
    img_bytes = generate_image(
        prompt, style_suffix=style_suffix,
        width=width, height=height, label=label, subtitle=subtitle,
    )
    key = f"{project_id}/shots/{shot_id}.png"
    return upload_bytes(img_bytes, key, "image/png")
