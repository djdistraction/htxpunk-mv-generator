from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings
from database import init_db
from api import projects, pipeline, assets

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables on startup
    await init_db()
    # Ensure local storage directory exists
    Path(settings.local_storage_path).mkdir(parents=True, exist_ok=True)
    yield

app = FastAPI(title="VoodooHut MV Generator", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
    return {"status": "ok", "video_backend": settings.video_backend,
            "storage_backend": settings.storage_backend}
