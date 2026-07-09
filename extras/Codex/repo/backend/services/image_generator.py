"""
Image Generation — pluggable backends

Image backend selection (settings.image_backend):
  "cloudflare"  — Workers AI FLUX.1-schnell (free daily allocation)
  "gemini"      — Gemini/Imagen (requires a billing-enabled Google project)
  "placeholder" — offline render, dev/testing only (no API, $0)

Cloudflare Workers AI has a free daily allocation. Gemini image generation is
paid-only (its free tier excludes image output). The placeholder renderer needs
no credentials and is for offline development/testing.
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
    """Check if running in placeholder mode (dev-only, offline)."""
    backend = (settings.image_backend or "cloudflare").lower()
    return backend == "placeholder"


def _assert_visual_generation_allowed():
    """Prevent spending image-generation tokens when final video cannot be real.

    The user asked for a music video, not a Ken Burns slideshow. Generating
    dozens of paid/API images when VIDEO_BACKEND is only the ffmpeg preview path
    wastes credits and produces a result the app should have pushed back on.

    Placeholder mode is allowed because it costs nothing and is explicitly for
    local smoke tests. Real image generation is allowed only when the real video
    backend is configured, or when the operator explicitly opts into fallback
    preview mode with ALLOW_FALLBACK_VIDEO=true.
    """
    image_backend = (settings.image_backend or "cloudflare").lower()
    if image_backend == "placeholder":
        return

    video_backend = (settings.video_backend or "ffmpeg").lower()
    if video_backend == "modal":
        if not settings.modal_token_id or not settings.modal_token_secret:
            raise RuntimeError(
                "Image generation was stopped before spending tokens because VIDEO_BACKEND=modal "
                "is selected, but MODAL_TOKEN_ID and MODAL_TOKEN_SECRET are not configured. "
                "Configure Modal for real image-to-video generation, or explicitly set "
                "ALLOW_FALLBACK_VIDEO=true with VIDEO_BACKEND=ffmpeg if you only want a preview slideshow."
            )
        return

    if settings.allow_fallback_video:
        return

    raise RuntimeError(
        f"Image generation was stopped before spending tokens because VIDEO_BACKEND={video_backend} "
        "cannot produce the requested real music video. The ffmpeg/Remotion-style preview path "
        "must be explicitly requested with ALLOW_FALLBACK_VIDEO=true. Configure VIDEO_BACKEND=modal "
        "for real image-to-video generation before running paid/API image generation."
    )


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


# ── Gemini renderer ──────────────────────────────────────────────────────────

def _generate_gemini(full_prompt: str, width: int, height: int, negative_prompt: str = "") -> bytes:
    """Generate image using Gemini 2.5 Flash Image (requires billing-enabled project)."""
    try:
        from services.gemini_image_generator import generate_with_gemini
    except ModuleNotFoundError:
        from gemini_image_generator import generate_with_gemini
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        output_path = f.name

    try:
        output_path = generate_with_gemini(
            api_key=settings.gemini_api_key,
            prompt=full_prompt,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            output_path=output_path,
        )
        with open(output_path, "rb") as f:
            return f.read()
    finally:
        import os
        try:
            os.unlink(output_path)
        except OSError:
            pass


def _generate_cloudflare(full_prompt: str, width: int, height: int, negative_prompt: str = "") -> bytes:
    """Generate image using Cloudflare Workers AI FLUX.1-schnell (free tier)."""
    try:
        from services.cloudflare_image_generator import generate_with_cloudflare
    except ModuleNotFoundError:
        from cloudflare_image_generator import generate_with_cloudflare
    return generate_with_cloudflare(
        account_id=settings.cloudflare_account_id,
        api_token=settings.cloudflare_api_token,
        prompt=full_prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
    )


def generate_image(prompt: str, style_suffix: str = "", width: int = 1024, height: int = 576,
                   label: str = "", subtitle: str = "", negative_prompt: str = "") -> bytes:
    """Generate an image and return raw PNG bytes.

    Routes to Gemini, Cloudflare, or the offline placeholder renderer based on
    settings.image_backend. Paid/API image generation is blocked before the
    call if the final video backend cannot satisfy a real music-video request.
    """
    full_prompt = f"{prompt}. {style_suffix}".strip(" .")

    backend = (settings.image_backend or "cloudflare").lower()
    if backend == "placeholder":
        return render_placeholder(full_prompt, width, height, label=label, subtitle=subtitle)

    _assert_visual_generation_allowed()

    if backend == "gemini":
        return _generate_gemini(full_prompt, width, height, negative_prompt)
    # default: cloudflare
    return _generate_cloudflare(full_prompt, width, height, negative_prompt)


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
