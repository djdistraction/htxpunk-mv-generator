"""Gemini 2.5 Flash Image — Free tier image generation (500 images/day).

Uses the dedicated image model `gemini-2.5-flash-image` via the
generateContent REST endpoint. The image comes back base64-encoded in
candidates[0].content.parts[*].inlineData.data — note the image part is not
necessarily parts[0] when the model also returns a text part, so we scan all
parts for the first inlineData.
"""

import logging
import base64
import time
from math import gcd
from pathlib import Path
import requests

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-2.5-flash-image"
GEMINI_API_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)
# Aspect ratios the model accepts; we snap the requested W×H to the nearest.
SUPPORTED_ASPECTS = {
    "1:1": 1.0, "3:4": 0.75, "4:3": 1.333, "9:16": 0.5625,
    "16:9": 1.778, "2:3": 0.667, "3:2": 1.5, "4:5": 0.8, "5:4": 1.25,
}
MAX_RETRIES = 3
INITIAL_BACKOFF = 2  # seconds


def _aspect_ratio(width: int, height: int) -> str:
    """Snap an arbitrary W×H to the closest aspect ratio the model supports."""
    if not width or not height:
        return "16:9"
    target = width / height
    return min(SUPPORTED_ASPECTS, key=lambda k: abs(SUPPORTED_ASPECTS[k] - target))


def _extract_image_b64(data: dict) -> str:
    """Pull the base64 image out of a generateContent response, scanning all parts."""
    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError(f"Gemini returned no candidates: {data}")
    parts = candidates[0].get("content", {}).get("parts") or []
    for part in parts:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline and inline.get("data"):
            return inline["data"]
    raise RuntimeError(
        f"Gemini response contained no image part (parts={[list(p.keys()) for p in parts]})"
    )


def generate_with_gemini(
    api_key: str,
    prompt: str,
    negative_prompt: str = "",
    width: int = 1280,
    height: int = 720,
    output_path: str = None,
) -> str:
    """
    Generate an image using Gemini 2.5 Flash Image.

    Returns the base64-encoded PNG data (or saves to file if output_path provided).
    Raises a clear RuntimeError/ValueError on failure (no silent fallback).
    """
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set")

    full_prompt = prompt
    if negative_prompt:
        full_prompt += f"\n\nAvoid the following: {negative_prompt}"

    # responseModalities is required for image output; imageConfig sets the ratio.
    request_body = {
        "contents": [{"parts": [{"text": full_prompt}]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {"aspectRatio": _aspect_ratio(width, height)},
        },
    }

    backoff = INITIAL_BACKOFF
    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.post(
                f"{GEMINI_API_URL}?key={api_key}",
                json=request_body,
                headers={"Content-Type": "application/json"},
                timeout=120,
            )

            if response.status_code == 200:
                image_data = _extract_image_b64(response.json())
                if output_path:
                    path = Path(output_path)
                    path.parent.mkdir(parents=True, exist_ok=True)
                    with open(output_path, "wb") as f:
                        f.write(base64.b64decode(image_data))
                    logger.info(f"[gemini] Generated image: {output_path}")
                    return output_path
                return image_data

            elif response.status_code == 429:
                # Rate limit
                last_error = "Rate limited (500 images/day quota exhausted)"
                wait_time = backoff
                logger.warning(f"[gemini] Rate limited, backing off {wait_time}s")
                time.sleep(wait_time)
                backoff *= 2

            elif response.status_code in (401, 403):
                raise RuntimeError("Gemini API key invalid, expired, or lacks access")

            elif response.status_code == 404:
                raise RuntimeError(
                    f"Gemini model '{GEMINI_MODEL}' not found — the model name or API "
                    f"version may have changed: {response.text[:200]}"
                )

            elif response.status_code == 400:
                error_msg = response.json().get("error", {}).get("message", "")
                raise RuntimeError(f"Gemini request failed: {error_msg}")

            else:
                last_error = f"HTTP {response.status_code}: {response.text[:200]}"
                wait_time = backoff
                logger.warning(f"[gemini] Request failed, backing off {wait_time}s: {last_error}")
                time.sleep(wait_time)
                backoff *= 2

        except requests.RequestException as e:
            last_error = str(e)
            if attempt < MAX_RETRIES - 1:
                wait_time = backoff
                logger.warning(f"[gemini] Network error, backing off {wait_time}s: {e}")
                time.sleep(wait_time)
                backoff *= 2
            else:
                raise RuntimeError(f"Gemini request failed after {MAX_RETRIES} retries: {e}")

    raise RuntimeError(f"Gemini generation failed: {last_error}")
