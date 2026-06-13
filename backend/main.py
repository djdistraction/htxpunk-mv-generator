from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from api import projects, pipeline, assets

app = FastAPI(
    title="VoodooHut MV Generator",
    description="AI-powered music video generation pipeline",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])
app.include_router(assets.router, prefix="/api/assets", tags=["assets"])


@app.get("/health")
def health():
    return {"status": "ok"}
