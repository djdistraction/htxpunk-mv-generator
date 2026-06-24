from pydantic_settings import BaseSettings
from pathlib import Path

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
    database_url: str = "sqlite+aiosqlite:///./htxpunk.db"

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
