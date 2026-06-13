from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
import uuid

PipelineStage = Literal[
    "uploaded", "analyzing", "analyzed",
    "treatment_pending", "treatment_approved",
    "extracting_elements", "elements_ready",
    "generating_backgrounds", "generating_elements",
    "building_storyboard", "storyboard_approved",
    "generating_clips", "assembling", "complete", "error"
]


class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    artist: str
    stage: PipelineStage = "uploaded"
    audio_url: Optional[str] = None
    video_url: Optional[str] = None
    analysis: Optional[dict] = None
    treatment: Optional[dict] = None
    elements: Optional[dict] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProjectCreate(BaseModel):
    title: str
    artist: str
