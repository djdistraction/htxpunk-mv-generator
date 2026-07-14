"""Studio v2 paths — intentionally NOT named config.py so monorepo backend/config.py wins for service imports."""
from pathlib import Path
from pydantic_settings import BaseSettings

_DEFAULT = Path.home() / ".htxpunk-mv-generator" / "storage"


class StudioSettings(BaseSettings):
    studio_data_dir: str = str(_DEFAULT / "studio-v2")
    groq_api_key: str = ""
    whisper_model: str = "base"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = StudioSettings()
DATA_DIR = Path(settings.studio_data_dir)
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "studio.db"
STORAGE = DATA_DIR / "files"
STORAGE.mkdir(parents=True, exist_ok=True)
