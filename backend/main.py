import base64
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
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
    # Loud and unmissable on purpose: a real confirmed failure was two
    # completely separate databases/storage trees silently diverging
    # depending on how the backend happened to be launched (packaged app
    # vs. a manually-run `uvicorn`), with nothing indicating anything had
    # split. Printing exactly where this instance reads/writes removes the
    # ambiguity instead of leaving it discoverable only by hunting the
    # filesystem after the fact.
    logger.info("=" * 70)
    logger.info("[Startup] Database : %s", settings.database_url)
    logger.info("[Startup] Storage  : %s", Path(settings.local_storage_path).resolve())
    logger.info("=" * 70)
    # Create DB tables on startup (including new tasks + series tables)
    await init_db()
    # Ensure local storage directory exists
    Path(settings.local_storage_path).mkdir(parents=True, exist_ok=True)
    # Start Chimera Tower orchestrator — replaces Celery worker process
    from orchestrator import start_orchestrator
    start_orchestrator(max_workers=4)
    yield

app = FastAPI(title="HTXpunk Productions MV Generator", lifespan=lifespan)

# HTTP Basic Auth gate for hosted deployments. Only active when both
# AUTH_USERNAME/AUTH_PASSWORD are set — local/desktop use (where the
# machine itself is the security boundary) is unaffected. Applied as
# middleware (not a per-route dependency) so it also covers /storage,
# which is mounted as static files with no dependency injection point.
@app.middleware("http")
async def basic_auth_gate(request: Request, call_next):
    if not (settings.auth_username and settings.auth_password):
        return await call_next(request)

    if request.method == "OPTIONS":
        # Let CORS preflight through unauthenticated — it carries no
        # credentials and browsers don't attach an Authorization header to it.
        return await call_next(request)

    header = request.headers.get("authorization", "")
    if header.startswith("Basic "):
        try:
            decoded = base64.b64decode(header[6:]).decode("utf-8")
            user, _, password = decoded.partition(":")
        except Exception:
            user, password = "", ""
        if secrets.compare_digest(user, settings.auth_username) and secrets.compare_digest(
            password, settings.auth_password
        ):
            return await call_next(request)

    return Response(
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="HTXpunk MV Generator"'},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
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
