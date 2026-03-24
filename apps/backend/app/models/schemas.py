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
    left_elbow: PosePoint | None = None
    right_elbow: PosePoint | None = None
    left_wrist: PosePoint | None = None
    right_wrist: PosePoint | None = None


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


class NormalizedPoint(BaseModel):
    x: float = Field(..., ge=0, le=1)
    y: float = Field(..., ge=0, le=1)


class NormalizedRect(BaseModel):
    x: float = Field(..., ge=0, le=1)
    y: float = Field(..., ge=0, le=1)
    width: float = Field(..., gt=0, le=1)
    height: float = Field(..., gt=0, le=1)


class GarmentPart(BaseModel):
    id: str
    role: Literal["torso", "left_sleeve", "right_sleeve", "hood"]
    source_rect: NormalizedRect
    pivot: NormalizedPoint
    depth: int = 0
    anchor_start: str | None = None
    anchor_end: str | None = None
    scale_multiplier: float = Field(default=1.0, gt=0)
    rotation_offset_deg: float = 0


class GarmentRig(BaseModel):
    version: str = "1.0"
    render_mode: Literal["segmented-2d"] = "segmented-2d"
    anchors: dict[str, NormalizedPoint]
    parts: list[GarmentPart]


class GarmentAsset(BaseModel):
    id: str
    name: str
    category: str
    original_image_url: str
    processed_image_url: str
    width: int
    height: int
    rig: GarmentRig | None = None
    created_at: datetime


class GarmentListResponse(BaseModel):
    items: List[GarmentAsset]


class ThreeDSourceUpload(BaseModel):
    filename: str
    file_format: Literal["obj", "ma", "fbx", "gltf", "glb"]
    file_base64: str = Field(..., description="Raw base64 payload, without data URI prefix")


class ThreeDSourceFile(BaseModel):
    filename: str
    file_format: Literal["obj", "ma", "fbx", "gltf", "glb"]
    file_url: str
    size_bytes: int = Field(..., ge=0)


class ThreeDMeshStats(BaseModel):
    vertex_count: int = Field(default=0, ge=0)
    face_count: int = Field(default=0, ge=0)
    source_mesh_count: int = Field(default=0, ge=0)


class ThreeDRigBone(BaseModel):
    name: str
    parent: str | None = None
    role: Literal["root", "spine", "neck", "shoulder", "upper_arm", "lower_arm", "hip", "cloth"]
    bind_point: NormalizedPoint


class ThreeDRigMetadata(BaseModel):
    version: str = "1.0"
    rig_type: Literal["none", "template-upper-body"] = "template-upper-body"
    skinning_status: Literal["unskinned", "template-skinned", "manual"] = "template-skinned"
    bones: list[ThreeDRigBone]


class ThreeDAsset(BaseModel):
    id: str
    name: str
    category: Literal["top", "bottom", "dress"]
    status: Literal["staged", "converted", "failed"] = "staged"
    source_files: list[ThreeDSourceFile]
    glb_url: str | None = None
    preview_image_url: str | None = None
    rig: ThreeDRigMetadata | None = None
    mesh_stats: ThreeDMeshStats | None = None
    conversion_engine: str
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ThreeDAssetListResponse(BaseModel):
    items: list[ThreeDAsset]


class ThreeDConversionJobRequest(BaseModel):
    name: str | None = None
    category: Literal["top", "bottom", "dress"] = "top"
    target_format: Literal["glb"] = "glb"
    rig_strategy: Literal["none", "template-upper-body"] = "template-upper-body"
    source_files: list[ThreeDSourceUpload] = Field(..., min_length=1)


class ThreeDConversionJob(BaseModel):
    id: str
    asset_id: str
    name: str
    category: Literal["top", "bottom", "dress"]
    target_format: Literal["glb"] = "glb"
    status: Literal["queued", "running", "succeeded", "failed"]
    source_files: list[ThreeDSourceFile]
    output_asset: ThreeDAsset | None = None
    conversion_engine: str
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


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
