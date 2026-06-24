from pydantic_settings import BaseSettings
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    # LLM — Groq free tier (swap to OLLAMA_BASE_URL when you have a GPU)
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # Image generation — HF free inference API (swap to local ComfyUI later)
    hf_token: str = ""
    hf_image_model: str = "black-forest-labs/FLUX.1-schnell"

    # Audio — local Whisper model size: tiny / base / small / medium
    whisper_model: str = "base"

    # Storage — local filesystem (swap to r2 when deploying)
    storage_backend: str = "local"  # "local" | "r2"
    local_storage_path: str = str(Path(__file__).parent / "storage")

    # R2 (only needed if storage_backend = "r2")
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "voodoo-mv"

    # Database — SQLite by default (swap to postgres url when deploying)
    database_url: str = f"sqlite+aiosqlite:///{Path(__file__).parent / 'htxpunk.db'}"

    # Video generation backend: "ffmpeg" | "runway" | "wan2"
    video_backend: str = "ffmpeg"
    runway_api_key: str = ""

    # FFmpeg ken burns settings
    video_fps: int = 25
    clip_duration: int = 5  # seconds per clip
    output_resolution: str = "1920x1080"

    class Config:
        # .env lives at the project root (one level above backend/)
        # Use an absolute path so this works regardless of the working directory
        # uvicorn is launched from.
        env_file = str(Path(__file__).parent.parent / ".env")
        extra = "ignore"

settings = Settings()

# Validation on startup
def validate_settings():
    warnings = []
    if not settings.groq_api_key or settings.groq_api_key == "gsk_YOUR_API_KEY_HERE":
        warnings.append("⚠️  GROQ_API_KEY not set — set it in .env to use LLM features")
    if not settings.hf_token or settings.hf_token == "hf_YOUR_TOKEN_HERE":
        warnings.append("⚠️  HF_TOKEN not set — set it in .env to use image generation")

    if warnings:
        logger.warning("Configuration warnings:")
        for w in warnings:
            logger.warning(w)
