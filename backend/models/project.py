from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
import uuid

PipelineStage = Literal[
    "uploaded", "preprocessing_audio", "awaiting_project_info_review",
    "info_confirmed", "interpreting_song", "analyzed",
    "treatment_pending", "awaiting_treatment_approval", "treatment_approved",
    "extracting_elements", "elements_ready",
    "generating_backgrounds", "generating_elements",
    "building_storyboard", "awaiting_storyboard_approval", "storyboard_approved",
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


class ProjectInfoConfirm(BaseModel):
    """Human-editable facts shown on the project-info review gate. song_length/
    bpm/musical_key are machine-measured and displayed read-only by the
    frontend, but accepted here too (e.g. bpm/musical_key/beat_grid arrive
    from the client-side essentia.js measurement, which has nowhere else to
    land them)."""
    title: Optional[str] = None
    artist: Optional[str] = None
    composer: Optional[str] = None
    album: Optional[str] = None
    bpm: Optional[str] = None
    musical_key: Optional[str] = None
    beat_grid: Optional[list[float]] = None
    transcript: Optional[dict] = None
