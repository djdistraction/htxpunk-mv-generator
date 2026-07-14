from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
import uuid

PipelineStage = Literal[
    "uploaded", "audio_uploaded", "rhythm_key_analyzed", "audio_prepared",
    "metadata_ready", "vocals_ready", "preprocessing_audio", "awaiting_project_info_review",
    "info_confirmed", "interpreting_song", "analyzed",
    "treatment_pending", "awaiting_treatment_approval", "treatment_approved",
    "extracting_elements", "elements_ready",
    "generating_backgrounds", "generating_elements", "generating_images", "images_ready",
    "awaiting_manifest_approval", "manifest_approved", "generating_manifest_images",
    "building_storyboard", "awaiting_storyboard_approval", "storyboard_approved",
    "generating_clips", "assembling", "base_video_ready",
    "lip_syncing", "lip_sync_ready", "complete", "error"
]


class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    artist: str
    stage: PipelineStage = "uploaded"
    audio_url: Optional[str] = None
    video_url: Optional[str] = None
    base_video_url: Optional[str] = None
    lipsynced_video_url: Optional[str] = None
    final_video_url: Optional[str] = None
    production_paths: list[str] = Field(default_factory=list)
    section_statuses: dict = Field(default_factory=dict)
    analysis: Optional[dict] = None
    treatment: Optional[dict] = None
    elements: Optional[dict] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ProjectCreate(BaseModel):
    title: str
    artist: str
    production_paths: list[str] = Field(default_factory=list)


class ProjectInfoConfirm(BaseModel):
    """Human-editable facts shown on the project-info review gate — the only
    form in the pipeline before the AI takes over, now that upload itself is
    audio-only. song_length/bpm/musical_key are machine-measured and displayed
    read-only by the frontend, but accepted here too (e.g. bpm/musical_key/
    beat_grid arrive from the client-side essentia.js measurement, which has
    nowhere else to land them)."""
    title: Optional[str] = None
    artist: Optional[str] = None
    composer: Optional[str] = None
    album: Optional[str] = None
    bpm: Optional[str] = None
    musical_key: Optional[str] = None
    beat_grid: Optional[list[float]] = None
    transcript: Optional[dict] = None
    series_id: Optional[str] = None
    brief: Optional[str] = None
    production_paths: Optional[list[str]] = None


class FoundationUpdate(BaseModel):
    """Edit shared foundation fields anytime after upload (decision 2026-07-14).

    Foundation is song intelligence reused by Lyric, Karaoke, Performance, and
    Cinematic modules — users must be able to correct auto-filled metadata and
    lyric lines without re-running the whole intake tunnel.
    """
    title: Optional[str] = None
    artist: Optional[str] = None
    composer: Optional[str] = None
    album: Optional[str] = None
    bpm: Optional[str] = None
    musical_key: Optional[str] = None
    beat_grid: Optional[list[float]] = None
    transcript: Optional[dict] = None
    brief: Optional[str] = None
    user_lyrics_text: Optional[str] = None


class ProductionPathAdd(BaseModel):
    """Enable another video format on an existing foundation (no re-intake)."""
    path: str
