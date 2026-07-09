from pydantic import BaseModel, Field
from typing import Optional, Literal
import uuid

AssetType = Literal[
    "audio", "background", "element",
    "storyboard_panel", "clip", "final_video"
]


class Asset(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    asset_type: AssetType
    name: str
    url: str
    # type-specific data: timestamps, element_name, state, sequence_index, etc.
    metadata: Optional[dict] = None
