from pathlib import Path
from pydantic_settings import BaseSettings

_DEFAULT = Path.home() / ".htxpunk-mv-generator" / "storage"


class Settings(BaseSettings):
    studio_data_dir: str = str(_DEFAULT / "studio-v2")
    groq_api_key: str = ""
    whisper_model: str = "base"
    # Parent monorepo backend (for reusing services)
    legacy_backend_dir: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
DATA_DIR = Path(settings.studio_data_dir)
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "studio.db"
STORAGE = DATA_DIR / "files"
STORAGE.mkdir(parents=True, exist_ok=True)
