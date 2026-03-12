from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"


class ClothesItem(BaseModel):
    id: str
    name: str
    asset_url: str


class ClothesResponse(BaseModel):
    items: List[ClothesItem]


class FittingRequest(BaseModel):
    clothing_id: str = Field(..., description="Garment ID from /api/clothes")
    frame_width: int = Field(..., gt=0)
    frame_height: int = Field(..., gt=0)


class OverlayBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class FittingResponse(BaseModel):
    clothing_id: str
    overlay: OverlayBox
    engine: str


class CaptureRequest(BaseModel):
    image_base64: str = Field(..., description="Raw base64 payload, without data URI prefix")
    file_extension: str = Field(default="png", pattern=r"^[A-Za-z0-9]+$")


class CaptureResponse(BaseModel):
    capture_id: str
    saved_path: str
    created_at: datetime
