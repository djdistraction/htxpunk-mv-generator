"""
Stages 4 & 5: Image Generation via FLUX.1-dev on Replicate
- Generates background images (no characters)
- Generates character/prop elements on white backgrounds
- REMBG removes backgrounds from element images -> transparent PNGs
"""
import replicate
import httpx
from PIL import Image
from rembg import remove
import io
from config import settings
from utils.storage import upload_bytes

FLUX_MODEL = "black-forest-labs/flux-1.1-pro"


def generate_image(prompt: str, width: int = 1920, height: int = 1080) -> bytes:
    """Calls FLUX.1 via Replicate. Returns raw PNG bytes."""
    output = replicate.run(
        FLUX_MODEL,
        input={
            "prompt": prompt,
            "width": width,
            "height": height,
            "output_format": "png",
            "output_quality": 95,
            "num_inference_steps": 28,
            "guidance": 3.5
        }
    )
    url = str(output)
    response = httpx.get(url, timeout=60)
    return response.content


def generate_background(background_def: dict) -> str:
    """Generate a background image and upload to R2. Returns public URL."""
    img_bytes = generate_image(
        prompt=background_def["image_prompt"],
        width=background_def.get("width", 1920),
        height=background_def.get("height", 1080)
    )
    path = f"projects/{background_def['project_id']}/backgrounds/{background_def['id']}.png"
    return upload_bytes(img_bytes, path, content_type="image/png")


def generate_element(state_def: dict, remove_bg: bool = True) -> str:
    """
    Generate an element in a specific state.
    If remove_bg=True, applies REMBG to strip the white background -> transparent PNG.
    Returns public URL of the final PNG.
    """
    img_bytes = generate_image(
        prompt=state_def["image_prompt"],
        width=1024,
        height=1024
    )

    if remove_bg:
        input_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
        output_img = remove(input_img)
        buf = io.BytesIO()
        output_img.save(buf, format="PNG")
        img_bytes = buf.getvalue()

    path = f"projects/{state_def['project_id']}/elements/{state_def['state_id']}.png"
    return upload_bytes(img_bytes, path, content_type="image/png")
