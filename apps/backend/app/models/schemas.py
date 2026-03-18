from __future__ import annotations

from datetime import datetime
from typing import List, Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"


class ProviderStatusResponse(BaseModel):
    pose_provider: str
    vton_provider: str
    comfyui_base_url: str | None = None
    comfyui_workflow_path: str | None = None


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


class FittingResponse(BaseModel):
    clothing_id: str
    overlay: OverlayBox
    landmarks: PoseLandmarks
    engine: str
    confidence: float = Field(..., ge=0, le=1)


class ModelAnalyzeRequest(BaseModel):
    name: str | None = None
    model_image_base64: str = Field(..., description="Raw base64 payload, without data URI prefix")
    frame_width: int = Field(..., gt=0)
    frame_height: int = Field(..., gt=0)


class ModelAsset(BaseModel):
    id: str
    name: str
    original_image_url: str
    frame_width: int
    frame_height: int
    landmarks: PoseLandmarks
    pose_engine: str
    confidence: float = Field(..., ge=0, le=1)
    created_at: datetime


class ModelListResponse(BaseModel):
    items: List[ModelAsset]


class GarmentProcessRequest(BaseModel):
    name: str | None = None
    category: Literal["top", "bottom", "dress"] = "top"
    garment_image_base64: str = Field(..., description="Raw base64 payload, without data URI prefix")


class GarmentAsset(BaseModel):
    id: str
    name: str
    category: str
    original_image_url: str
    processed_image_url: str
    width: int
    height: int
    created_at: datetime


class GarmentListResponse(BaseModel):
    items: List[GarmentAsset]


class TryOnJobRequest(BaseModel):
    model_id: str
    garment_id: str
    manual_landmarks: PoseLandmarks | None = None


class TryOnJob(BaseModel):
    id: str
    model_id: str
    garment_id: str
    status: Literal["queued", "running", "succeeded", "failed"]
    fitting: FittingResponse | None = None
    result_image_url: str | None = None
    pose_engine: str
    vton_engine: str
    provider_job_id: str | None = None
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class CaptureRequest(BaseModel):
    image_base64: str = Field(..., description="Raw base64 payload, without data URI prefix")
    file_extension: str = Field(default="png", pattern=r"^[A-Za-z0-9]+$")


class CaptureResponse(BaseModel):
    capture_id: str
    saved_path: str
    created_at: datetime
