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
)
from app.services.capture_service import save_capture
from app.services.clothes_service import list_clothes
from app.services.fitting.base import FittingEngine
from app.services.fitting.mock_engine import MockFittingEngine

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


@router.post("/api/capture", response_model=CaptureResponse)
def capture(
    request: CaptureRequest,
    settings: Settings = Depends(get_settings),
) -> CaptureResponse:
    return save_capture(settings.captures_dir, request.image_base64, request.file_extension)
