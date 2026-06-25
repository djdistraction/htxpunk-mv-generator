from pydantic_settings import BaseSettings
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    # LLM — Groq free tier (swap to OLLAMA_BASE_URL when you have a GPU)
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # Image generation — Gemini free tier by default ($0, 500 images/day)
    gemini_api_key: str = ""
    # Image backend: "auto" uses Gemini when GEMINI_API_KEY is set, otherwise
    # falls back to the offline placeholder renderer. Force one with:
    #   "gemini" = always call Gemini (errors if no key)
    #   "placeholder" = always render local placeholder frames (no API, $0,
    #                    works offline — useful for demos/tests)
    image_backend: str = "auto"

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
    if not settings.gemini_api_key or settings.gemini_api_key == "AIzaSy_YOUR_API_KEY_HERE":
        logger.info("ℹ️  GEMINI_API_KEY not set — using free offline placeholder images ($0)")

    if warnings:
        logger.warning("Configuration warnings:")
        for w in warnings:
            logger.warning(w)
