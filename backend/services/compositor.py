"""
Stage 6a: Compositor
- Takes a background image and a list of (element_image, position, scale) tuples
- Composites them into a single storyboard panel image
"""
from PIL import Image
import io
from utils.storage import url_to_local_path, upload_bytes


def _read_storage_url(url: str) -> bytes:
    """Read a /storage/... URL directly from the local filesystem (no HTTP)."""
    local_path = url_to_local_path(url)
    with open(local_path, "rb") as f:
        return f.read()


def composite_panel(
    background_url: str,
    elements: list[dict],
    project_id: str,
    panel_id: str
) -> str:
    """
    Composites elements onto a background. Returns URL of the composited panel.

    elements format:
        url     : str   - /storage/... path of transparent PNG element
        x       : float - 0.0–1.0 horizontal position (center of element)
        y       : float - 0.0–1.0 vertical position (center of element)
        scale   : float - relative scale (1.0 = full canvas width)
        z_index : int   - layer order (higher = in front)
    """
    bg_bytes = _read_storage_url(background_url)
    canvas = Image.open(io.BytesIO(bg_bytes)).convert("RGBA")
    W, H = canvas.size

    for elem in sorted(elements, key=lambda e: e.get("z_index", 0)):
        elem_bytes = _read_storage_url(elem["url"])
        elem_img = Image.open(io.BytesIO(elem_bytes)).convert("RGBA")

        target_w = int(W * elem.get("scale", 0.25))
        ratio = target_w / elem_img.width
        target_h = int(elem_img.height * ratio)
        elem_img = elem_img.resize((target_w, target_h), Image.LANCZOS)

        paste_x = int(W * elem["x"]) - target_w // 2
        paste_y = int(H * elem["y"]) - target_h // 2
        canvas.paste(elem_img, (paste_x, paste_y), elem_img)

    buf = io.BytesIO()
    canvas.convert("RGB").save(buf, format="PNG", quality=95)

    path = f"projects/{project_id}/storyboard/{panel_id}.png"
    return upload_bytes(buf.getvalue(), path, content_type="image/png")
