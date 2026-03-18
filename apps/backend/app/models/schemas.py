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


class PosePoint(BaseModel):
    x: int
    y: int


class PoseLandmarks(BaseModel):
    neck: PosePoint
    left_shoulder: PosePoint
    right_shoulder: PosePoint
    left_hip: PosePoint
    right_hip: PosePoint


class OverlayBox(BaseModel):
    x: int
    y: int
    width: int
    height: int
    rotation_deg: float = 0


class FittingRequest(BaseModel):
    clothing_id: str = Field(..., description="Garment ID from the frontend garment list")
    frame_width: int = Field(..., gt=0)
    frame_height: int = Field(..., gt=0)
    garment_width: int = Field(..., gt=0)
    garment_height: int = Field(..., gt=0)


class FittingResponse(BaseModel):
    clothing_id: str
    overlay: OverlayBox
    landmarks: PoseLandmarks
    engine: str
    confidence: float = Field(..., ge=0, le=1)


class TryOnRequest(BaseModel):
    clothing_id: str
    model_image_base64: str = Field(..., description="Raw base64 payload, without data URI prefix")
    garment_image_base64: str = Field(..., description="Raw base64 payload, without data URI prefix")
    frame_width: int = Field(..., gt=0)
    frame_height: int = Field(..., gt=0)
    garment_width: int = Field(..., gt=0)
    garment_height: int = Field(..., gt=0)
    manual_landmarks: PoseLandmarks | None = None


class ModelAnalyzeRequest(BaseModel):
    model_image_base64: str = Field(..., description="Raw base64 payload, without data URI prefix")
    frame_width: int = Field(..., gt=0)
    frame_height: int = Field(..., gt=0)


class ModelAnalyzeResponse(BaseModel):
    status: str
    landmarks: PoseLandmarks
    pose_engine: str
    confidence: float = Field(..., ge=0, le=1)
    warnings: list[str] = Field(default_factory=list)


class TryOnResponse(BaseModel):
    status: str
    fitting: FittingResponse
    result_image_base64: str | None = None
    pose_engine: str
    vton_engine: str
    warnings: list[str] = Field(default_factory=list)


class CaptureRequest(BaseModel):
    image_base64: str = Field(..., description="Raw base64 payload, without data URI prefix")
    file_extension: str = Field(default="png", pattern=r"^[A-Za-z0-9]+$")


class CaptureResponse(BaseModel):
    capture_id: str
    saved_path: str
    created_at: datetime
