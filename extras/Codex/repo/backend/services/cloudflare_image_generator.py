"""Cloudflare Workers AI — FLUX.1-schnell text-to-image (free daily allocation).

REST API (confirmed against Cloudflare docs):
    POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/
         @cf/black-forest-labs/flux-1-schnell
    Authorization: Bearer {api_token}
    body: {"prompt": "...", "steps": 8}   # steps 1-8, higher = better/slower
    -> {"result": {"image": "<base64 JPEG>"}, "success": true, "errors": []}

flux-1-schnell outputs a square image, so we cover-crop to the requested
aspect ratio before returning PNG bytes.
"""

import io
import logging
import base64
import time

import requests
from PIL import Image

logger = logging.getLogger(__name__)

CF_MODEL = "@cf/black-forest-labs/flux-1-schnell"
MAX_RETRIES = 3
INITIAL_BACKOFF = 2  # seconds


def _cover_crop(raw: bytes, width: int, height: int) -> bytes:
    """Scale to cover width×height, center-crop, return PNG bytes."""
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    sw, sh = img.size
    target = width / height
    src = sw / sh
    if src > target:
        # source wider — match height, crop width
        new_h = height
        new_w = round(height * src)
    else:
        new_w = width
        new_h = round(width / src)
    img = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - width) // 2
    top = (new_h - height) // 2
    img = img.crop((left, top, left + width, top + height))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_with_cloudflare(
    account_id: str,
    api_token: str,
    prompt: str,
    negative_prompt: str = "",
    width: int = 1280,
    height: int = 720,
    steps: int = 8,
) -> bytes:
    """Generate an image via Workers AI FLUX.1-schnell. Returns cropped PNG bytes.

    Raises a clear RuntimeError/ValueError on failure (no silent fallback).
    """
    if not account_id or not api_token:
        raise ValueError("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set")

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{CF_MODEL}"
    # flux-1-schnell takes only prompt + steps; fold the negative into the prompt.
    full_prompt = prompt
    if negative_prompt:
        full_prompt += f". Avoid: {negative_prompt}"
    body = {"prompt": full_prompt[:2048], "steps": max(1, min(int(steps), 8))}
    headers = {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}

    backoff = INITIAL_BACKOFF
    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(url, json=body, headers=headers, timeout=120)

            if resp.status_code == 200:
                data = resp.json()
                if not data.get("success", False):
                    raise RuntimeError(f"Cloudflare AI error: {data.get('errors')}")
                b64 = data.get("result", {}).get("image")
                if not b64:
                    raise RuntimeError(f"Cloudflare response had no image: {str(data)[:200]}")
                return _cover_crop(base64.b64decode(b64), width, height)

            elif resp.status_code in (401, 403):
                raise RuntimeError(
                    "Cloudflare auth failed — check CLOUDFLARE_API_TOKEN has the "
                    "'Workers AI' permission and CLOUDFLARE_ACCOUNT_ID is correct"
                )

            elif resp.status_code == 404:
                raise RuntimeError(
                    f"Model or account not found (404). Verify the account ID and that "
                    f"'{CF_MODEL}' is available: {resp.text[:200]}"
                )

            elif resp.status_code == 429:
                last_error = "Rate limited / daily free allocation exhausted"
                logger.warning("[cloudflare] 429, backing off %ss", backoff)
                time.sleep(backoff)
                backoff *= 2

            else:
                last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                logger.warning("[cloudflare] %s, backing off %ss", last_error, backoff)
                time.sleep(backoff)
                backoff *= 2

        except requests.RequestException as e:
            last_error = str(e)
            if attempt < MAX_RETRIES - 1:
                logger.warning("[cloudflare] network error, backing off %ss: %s", backoff, e)
                time.sleep(backoff)
                backoff *= 2
            else:
                raise RuntimeError(f"Cloudflare request failed after {MAX_RETRIES} retries: {e}")

    raise RuntimeError(f"Cloudflare generation failed: {last_error}")
