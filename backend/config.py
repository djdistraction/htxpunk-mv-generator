from pydantic_settings import BaseSettings
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    # LLM — Groq free tier (swap to OLLAMA_BASE_URL when you have a GPU)
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # Image generation — Gemini free tier (500 images/day)
    gemini_api_key: str = ""
    # Image backend: "gemini" (default, uses Gemini API)
    # For development/testing only: "placeholder" renders offline (no API, $0)
    image_backend: str = "gemini"

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
    errors = []
    if not settings.groq_api_key or settings.groq_api_key == "gsk_YOUR_API_KEY_HERE":
        errors.append("❌ GROQ_API_KEY not set")
    if not settings.gemini_api_key or settings.gemini_api_key == "AIzaSy_YOUR_API_KEY_HERE":
        if settings.image_backend != "placeholder":
            errors.append("❌ GEMINI_API_KEY not set (or set IMAGE_BACKEND=placeholder for dev-only mode)")

    if errors:
        logger.error("Configuration errors:")
        for e in errors:
            logger.error(e)
        if settings.image_backend != "placeholder":
            raise RuntimeError(
                "Missing required API keys. Set GROQ_API_KEY and GEMINI_API_KEY in .env, "
                "or IMAGE_BACKEND=placeholder for offline development mode only."
            )
