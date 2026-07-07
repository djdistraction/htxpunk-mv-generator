from pydantic_settings import BaseSettings
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Canonical default data location — the SAME directory the packaged Electron
# app uses (electron-app/main.js: path.join(os.homedir(), '.htxpunk-mv-generator')).
# Confirmed real-world failure this default fixes: running the backend
# manually (`uvicorn main:app --reload`) previously fell back to
# repo-relative paths (./backend/storage, ./backend/htxpunk.db) whenever a
# dev .env didn't override them — a SEPARATE, silently-diverging database
# and storage tree from the one the packaged app actually uses, with no
# indication anything had split. Defaulting both launch paths to the same
# home-directory location means "run it manually for a quick check" and
# "use the installed app" now see the same projects either way.
_DEFAULT_DATA_DIR = Path.home() / ".htxpunk-mv-generator" / "storage"

class Settings(BaseSettings):
    # Basic Auth gate for hosted deployments (e.g. htxpunk.com/mvgen) — unset
    # (both empty) means no auth is enforced, which is correct for local/
    # desktop use where the machine itself is the security boundary. Set
    # both to require a login before any route (including /storage) responds.
    auth_username: str = ""
    auth_password: str = ""

    # Comma-separated list of additional CORS origins for hosted deployments,
    # e.g. "https://htxpunk.com" — the localhost dev origins are always
    # allowed in addition to whatever's set here. Empty by default.
    cors_extra_origins: str = ""

    # LLM — Groq free tier (swap to OLLAMA_BASE_URL when you have a GPU)
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # Image generation backends
    gemini_api_key: str = ""              # Gemini (paid — requires billing)
    cloudflare_account_id: str = ""       # Workers AI (free daily allocation)
    cloudflare_api_token: str = ""        # token scoped to "Workers AI"
    # Image backend:
    #   "cloudflare"  — Workers AI FLUX.1-schnell (free tier)
    #   "gemini"      — Gemini/Imagen (requires a billing-enabled Google project)
    #   "placeholder" — offline render, dev/testing only (no API, $0)
    image_backend: str = "cloudflare"

    # Audio — local Whisper model size: tiny / base / small / medium
    whisper_model: str = "base"

    # Storage — local filesystem (swap to r2 when deploying)
    storage_backend: str = "local"  # "local" | "r2"
    local_storage_path: str = str(_DEFAULT_DATA_DIR)

    # R2 (only needed if storage_backend = "r2")
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "voodoo-mv"

    # Database — SQLite by default (swap to postgres url when deploying)
    database_url: str = f"sqlite+aiosqlite:///{_DEFAULT_DATA_DIR / 'htxpunk.db'}"

    # Video generation backend: "ffmpeg" | "runway" | "wan2"
    video_backend: str = "ffmpeg"   # ffmpeg (Ken Burns stills) | modal (AI video + lip-sync)
    runway_api_key: str = ""

    # Modal — serverless GPU for AI image-to-video + lip-sync (self-hosted models)
    # Tokens come from `modal token new` on the machine that deploys the app; Modal
    # also reads MODAL_TOKEN_ID / MODAL_TOKEN_SECRET straight from the environment.
    lipsync_enabled: bool = True
    modal_token_id: str = ""
    modal_token_secret: str = ""

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

    @property
    def cors_allow_origins(self) -> list[str]:
        extra = [o.strip() for o in self.cors_extra_origins.split(",") if o.strip()]
        return ["http://localhost:3000", "http://127.0.0.1:3000"] + extra

settings = Settings()

# Validation on startup
def validate_settings():
    backend = (settings.image_backend or "cloudflare").lower()
    errors = []
    valid_backends = {"cloudflare", "gemini", "placeholder"}

    if backend not in valid_backends:
        errors.append("❌ IMAGE_BACKEND must be one of: cloudflare, gemini, placeholder")

    if backend in {"cloudflare", "gemini"} and (
        not settings.groq_api_key or settings.groq_api_key == "gsk_YOUR_API_KEY_HERE"
    ):
        errors.append("❌ GROQ_API_KEY not set")

    if backend == "cloudflare":
        if not settings.cloudflare_account_id or not settings.cloudflare_api_token:
            errors.append(
                "❌ CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required for "
                "IMAGE_BACKEND=cloudflare"
            )
    elif backend == "gemini":
        if not settings.gemini_api_key or settings.gemini_api_key == "AIzaSy_YOUR_API_KEY_HERE":
            errors.append("❌ GEMINI_API_KEY required for IMAGE_BACKEND=gemini")
    # backend == "placeholder": no image credentials needed (dev/offline only)

    if errors:
        logger.error("Configuration errors:")
        for e in errors:
            logger.error(e)
        raise RuntimeError(
            "Missing required configuration: " + "; ".join(errors) + ". "
            "Set the keys in .env, or use IMAGE_BACKEND=placeholder for offline dev mode."
        )
