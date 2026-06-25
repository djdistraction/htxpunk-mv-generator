"""
Stages 4-5 — Image Generation
Uses Hugging Face Inference API (free tier) with FLUX.1-schnell.
No API cost. Rate limited — adds ~2-3s delay between calls automatically.

To upgrade to paid FLUX.1-dev on Replicate:
  Set image_backend=replicate in config and add replicate_api_key.
When you have a local GPU:
  Set image_backend=local and point at your ComfyUI API.
"""
import io
import time
from pathlib import Path
from PIL import Image
from config import settings
from utils.storage import upload_bytes

def generate_image(prompt: str, style_suffix: str = "", width: int = 1024, height: int = 576) -> bytes:
    """Generate an image and return raw PNG bytes. Retries on network errors."""
    full_prompt = f"{prompt}. {style_suffix}".strip(" .")

    from huggingface_hub import InferenceClient
    client = InferenceClient(token=settings.hf_token)

    max_retries = 3
    retry_delay = 5

    for attempt in range(max_retries):
        try:
            # HF free tier needs a small pause between calls to avoid 429s
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
            if attempt < max_retries - 1:
                error_str = str(e)
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

    if remove_bg:
        try:
            from rembg import remove
            img_bytes = remove(img_bytes)
            key = f"{project_id}/elements/{element_id}.png"
            return upload_bytes(img_bytes, key, "image/png")
        except Exception as e:
            print(f"rembg failed ({e}), saving with white background")

    key = f"{project_id}/elements/{element_id}.png"
    return upload_bytes(img_bytes, key, "image/png")
