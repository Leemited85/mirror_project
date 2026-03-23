from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.settings import Settings, get_settings
from app.models.schemas import (
    CaptureRequest,
    CaptureResponse,
    GarmentAsset,
    GarmentListResponse,
    GarmentProcessRequest,
    HealthResponse,
    ModelAnalyzeRequest,
    ModelAsset,
    ModelListResponse,
    ProviderStatusResponse,
    TryOnJob,
    TryOnJobRequest,
)
from app.services.asset_store import (
    create_asset_id,
    ensure_directory,
    list_garment_assets,
    list_model_assets,
    load_garment_asset,
    load_model_asset,
    load_tryon_job,
    now_utc,
    save_garment_asset,
    save_model_asset,
    save_tryon_job,
)
from app.services.capture_service import save_capture
from app.services.fitting.geometry import compute_overlay_from_landmarks
from app.services.garment_processing import remove_background
from app.services.garment_rig import build_default_garment_rig
from app.services.image_utils import decode_base64_image, save_image_bytes
from app.services.pose import create_pose_provider
from app.services.vton import create_vton_provider

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@router.get("/api/system/providers", response_model=ProviderStatusResponse)
def provider_status(settings: Settings = Depends(get_settings)) -> ProviderStatusResponse:
    return ProviderStatusResponse(
        pose_provider=settings.pose_provider,
        vton_provider=settings.vton_provider,
        comfyui_base_url=settings.comfyui_base_url,
        comfyui_workflow_path=str(settings.comfyui_workflow_path) if settings.comfyui_workflow_path else None,
    )


@router.post("/api/models/analyze", response_model=ModelAsset)
def analyze_model(
    request: ModelAnalyzeRequest,
    settings: Settings = Depends(get_settings),
) -> ModelAsset:
    model_bytes = decode_base64_image(request.model_image_base64)
    pose_provider = create_pose_provider(settings)
    landmarks, confidence = pose_provider.detect(model_bytes, request.frame_width, request.frame_height)

    asset_id = create_asset_id("model")
    asset_dir = ensure_directory(settings.models_dir / asset_id)
    original_path = asset_dir / "original.png"
    save_image_bytes(original_path, model_bytes)

    created_at = now_utc()
    asset = ModelAsset(
        id=asset_id,
        name=request.name or asset_id,
        original_image_url=f"{settings.static_data_url_prefix}/models/{asset_id}/original.png",
        frame_width=request.frame_width,
        frame_height=request.frame_height,
        landmarks=landmarks,
        pose_engine=pose_provider.name,
        confidence=confidence,
        created_at=created_at,
    )
    save_model_asset(asset_dir, asset)
    return asset


@router.get("/api/models", response_model=ModelListResponse)
def list_models(settings: Settings = Depends(get_settings)) -> ModelListResponse:
    return ModelListResponse(items=list_model_assets(settings.models_dir))


@router.post("/api/garments/process", response_model=GarmentAsset)
def process_garment(
    request: GarmentProcessRequest,
    settings: Settings = Depends(get_settings),
) -> GarmentAsset:
    garment_bytes = decode_base64_image(request.garment_image_base64)
    processed_bytes, width, height = remove_background(garment_bytes)

    asset_id = create_asset_id("garment")
    asset_dir = ensure_directory(settings.garments_dir / asset_id)
    original_path = asset_dir / "original.png"
    processed_path = asset_dir / "processed.png"
    save_image_bytes(original_path, garment_bytes)
    save_image_bytes(processed_path, processed_bytes)

    created_at = now_utc()
    asset = GarmentAsset(
        id=asset_id,
        name=request.name or asset_id,
        category=request.category,
        original_image_url=f"{settings.static_data_url_prefix}/garments/{asset_id}/original.png",
        processed_image_url=f"{settings.static_data_url_prefix}/garments/{asset_id}/processed.png",
        width=width,
        height=height,
        rig=build_default_garment_rig(request.name or asset_id, request.category),
        created_at=created_at,
    )
    save_garment_asset(asset_dir, asset)
    return asset


@router.get("/api/garments", response_model=GarmentListResponse)
def list_garments(settings: Settings = Depends(get_settings)) -> GarmentListResponse:
    return GarmentListResponse(items=list_garment_assets(settings.garments_dir))


@router.post("/api/try-on/jobs", response_model=TryOnJob)
def create_try_on_job(
    request: TryOnJobRequest,
    settings: Settings = Depends(get_settings),
) -> TryOnJob:
    model_dir = settings.models_dir / request.model_id
    garment_dir = settings.garments_dir / request.garment_id

    if not model_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model asset not found")
    if not garment_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Garment asset not found")

    model_asset = load_model_asset(model_dir)
    garment_asset = load_garment_asset(garment_dir)

    pose_provider = create_pose_provider(settings)
    vton_provider = create_vton_provider(settings)

    landmarks = request.manual_landmarks or model_asset.landmarks
    confidence = 1.0 if request.manual_landmarks else model_asset.confidence
    warnings: list[str] = []
    if request.manual_landmarks:
        warnings.append("Manual fitting landmarks supplied by the frontend.")

    overlay = compute_overlay_from_landmarks(
        landmarks=landmarks,
        frame_height=model_asset.frame_height,
        garment_width=garment_asset.width,
        garment_height=garment_asset.height,
    )

    job_id = create_asset_id("tryon")
    job_dir = ensure_directory(settings.tryon_dir / job_id)

    model_bytes = (model_dir / "original.png").read_bytes()
    garment_bytes = (garment_dir / "processed.png").read_bytes()

    result_path = None
    job_status = "running"
    try:
        result_bytes, provider_warnings = vton_provider.compose(
            model_image_bytes=model_bytes,
            garment_image_bytes=garment_bytes,
            overlay=overlay,
            landmarks=landmarks,
            frame_width=model_asset.frame_width,
            frame_height=model_asset.frame_height,
        )
        warnings.extend(provider_warnings)
        if result_bytes:
            result_path = job_dir / "result.png"
            save_image_bytes(result_path, result_bytes)
        job_status = "succeeded"
    except RuntimeError as exc:
        warnings.append(str(exc))
        job_status = "failed"

    timestamp = now_utc()
    job = TryOnJob(
        id=job_id,
        model_id=model_asset.id,
        garment_id=garment_asset.id,
        status=job_status,
        fitting={
            "clothing_id": garment_asset.id,
            "overlay": overlay,
            "landmarks": landmarks,
            "engine": pose_provider.name,
            "confidence": confidence,
        },
        result_image_url=(
            f"{settings.static_data_url_prefix}/tryon/{job_id}/result.png" if result_path else None
        ),
        pose_engine=pose_provider.name,
        vton_engine=vton_provider.name,
        provider_job_id=getattr(vton_provider, "last_job_id", None),
        warnings=warnings,
        created_at=timestamp,
        updated_at=timestamp,
    )
    save_tryon_job(job_dir, job)
    return job


@router.get("/api/try-on/jobs/{job_id}", response_model=TryOnJob)
def get_try_on_job(job_id: str, settings: Settings = Depends(get_settings)) -> TryOnJob:
    job_dir = settings.tryon_dir / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Try-on job not found")
    return load_tryon_job(job_dir)


@router.post("/api/capture", response_model=CaptureResponse)
def capture(
    request: CaptureRequest,
    settings: Settings = Depends(get_settings),
) -> CaptureResponse:
    return save_capture(settings.captures_dir, request.image_base64, request.file_extension)
