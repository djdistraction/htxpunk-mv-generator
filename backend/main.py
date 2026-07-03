from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging

from config import settings, validate_settings
from database import init_db
from api import projects, pipeline, assets

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate configuration
    validate_settings()
    # Create DB tables on startup (including new tasks + series tables)
    await init_db()
    # Ensure local storage directory exists
    Path(settings.local_storage_path).mkdir(parents=True, exist_ok=True)
    # Start Chimera Tower orchestrator — replaces Celery worker process
    from orchestrator import start_orchestrator
    start_orchestrator(max_workers=4)
    yield

app = FastAPI(title="HTXpunk Productions MV Generator", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve generated images/video files directly
storage_path = Path(settings.local_storage_path)
storage_path.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=str(storage_path)), name="storage")

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])
app.include_router(assets.router, prefix="/api/assets", tags=["assets"])

@app.get("/health")
def health():
    return {
        "status": "ok",
        "backend_version": "1.0.0",
        "video_backend": settings.video_backend,
        "storage_backend": settings.storage_backend,
        "database": "sqlite" if "sqlite" in settings.database_url else "postgres",
        "storage_path": settings.local_storage_path if settings.storage_backend == "local" else "r2",
    }
