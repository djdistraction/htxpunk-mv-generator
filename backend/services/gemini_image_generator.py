"""Gemini 2.5 Flash Image — Free tier image generation (500 images/day)."""

import logging
import base64
import time
from pathlib import Path
import requests

logger = logging.getLogger(__name__)

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2-5-flash:generateContent"
MAX_RETRIES = 3
INITIAL_BACKOFF = 2  # seconds


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
    Falls back gracefully if API fails.
    """
    if not api_key:
        raise ValueError("GEMINI_API_KEY not set")

    # Build the request
    request_body = {
        "contents": [
            {
                "parts": [
                    {
                        "text": f"Generate a photorealistic image based on this description:\n\n{prompt}"
                        + (f"\n\nDo NOT include: {negative_prompt}" if negative_prompt else "")
                        + f"\n\nDimensions: {width}x{height}"
                    }
                ]
            }
        ],
        "generation_config": {
            "temperature": 0.8,
            "top_p": 0.95,
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
                timeout=60,
            )

            if response.status_code == 200:
                data = response.json()

                # Extract image from response
                try:
                    image_data = data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]

                    if output_path:
                        path = Path(output_path)
                        path.parent.mkdir(parents=True, exist_ok=True)
                        with open(output_path, "wb") as f:
                            f.write(base64.b64decode(image_data))
                        logger.info(f"[gemini] Generated image: {output_path}")
                        return output_path
                    else:
                        return image_data
                except (KeyError, IndexError, TypeError) as e:
                    logger.error(f"[gemini] Unexpected response format: {data}")
                    raise RuntimeError(f"Gemini returned unexpected format: {e}")

            elif response.status_code == 429:
                # Rate limit
                last_error = "Rate limited (500 images/day quota exhausted)"
                wait_time = backoff
                logger.warning(f"[gemini] Rate limited, backing off {wait_time}s")
                time.sleep(wait_time)
                backoff *= 2

            elif response.status_code == 401:
                raise RuntimeError("Gemini API key invalid or expired")

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
