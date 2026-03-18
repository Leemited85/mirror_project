from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.settings import Settings, get_settings
from app.models.schemas import (
    CaptureRequest,
    CaptureResponse,
    ClothesResponse,
    FittingRequest,
    FittingResponse,
    HealthResponse,
    TryOnRequest,
    TryOnResponse,
)
from app.services.capture_service import save_capture
from app.services.clothes_service import list_clothes
from app.services.fitting.base import FittingEngine
from app.services.fitting.geometry import compute_overlay_from_landmarks
from app.services.fitting.mock_engine import MockFittingEngine
from app.services.image_utils import decode_base64_image, encode_png_base64
from app.services.pose import create_pose_provider
from app.services.vton import create_vton_provider

router = APIRouter()


def get_fitting_engine() -> FittingEngine:
    return MockFittingEngine()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@router.get("/api/clothes", response_model=ClothesResponse)
def clothes(settings: Settings = Depends(get_settings)) -> ClothesResponse:
    items = list_clothes(settings.clothes_dir, settings.static_clothes_url_prefix)
    return ClothesResponse(items=items)


@router.post("/api/fitting/mock", response_model=FittingResponse)
def fitting_mock(
    request: FittingRequest,
    engine: FittingEngine = Depends(get_fitting_engine),
) -> FittingResponse:
    return engine.compute_fit(request)


@router.post("/api/try-on/mock", response_model=TryOnResponse)
def try_on_mock(
    request: TryOnRequest,
    settings: Settings = Depends(get_settings),
) -> TryOnResponse:
    model_bytes = decode_base64_image(request.model_image_base64)
    garment_bytes = decode_base64_image(request.garment_image_base64)

    pose_provider = create_pose_provider(settings)
    vton_provider = create_vton_provider(settings)

    warnings: list[str] = []
    if request.manual_landmarks:
        landmarks = request.manual_landmarks
        confidence = 1.0
        warnings.append("Manual fitting landmarks supplied by the frontend.")
    else:
        landmarks, confidence = pose_provider.detect(model_bytes, request.frame_width, request.frame_height)
    overlay = compute_overlay_from_landmarks(
        landmarks=landmarks,
        frame_height=request.frame_height,
        garment_width=request.garment_width,
        garment_height=request.garment_height,
    )
    fitting = FittingResponse(
        clothing_id=request.clothing_id,
        overlay=overlay,
        landmarks=landmarks,
        engine=pose_provider.name,
        confidence=confidence,
    )

    result_bytes = None
    try:
        result_bytes, provider_warnings = vton_provider.compose(
            model_image_bytes=model_bytes,
            garment_image_bytes=garment_bytes,
            overlay=overlay,
            landmarks=landmarks,
            frame_width=request.frame_width,
            frame_height=request.frame_height,
        )
        warnings.extend(provider_warnings)
        status = "ok"
    except RuntimeError as exc:
        warnings.append(str(exc))
        status = "degraded"

    result_base64 = encode_png_base64(result_bytes) if result_bytes else None

    return TryOnResponse(
        status=status,
        fitting=fitting,
        result_image_base64=result_base64,
        pose_engine=pose_provider.name,
        vton_engine=vton_provider.name,
        warnings=warnings,
    )


@router.post("/api/capture", response_model=CaptureResponse)
def capture(
    request: CaptureRequest,
    settings: Settings = Depends(get_settings),
) -> CaptureResponse:
    return save_capture(settings.captures_dir, request.image_base64, request.file_extension)
