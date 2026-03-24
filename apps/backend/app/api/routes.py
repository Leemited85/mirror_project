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
    ThreeDAsset,
    ThreeDAssetListResponse,
    ThreeDConversionJob,
    ThreeDConversionJobRequest,
    ThreeDSourceFile,
    TryOnJob,
    TryOnJobRequest,
)
from app.services.asset_store import (
    create_asset_id,
    ensure_directory,
    list_garment_assets,
    list_model_assets,
    list_three_d_assets,
    load_garment_asset,
    load_model_asset,
    load_three_d_conversion_job,
    load_tryon_job,
    now_utc,
    save_garment_asset,
    save_model_asset,
    save_three_d_asset,
    save_three_d_conversion_job,
    save_tryon_job,
)
from app.services.capture_service import save_capture
from app.services.fitting.geometry import compute_overlay_from_landmarks
from app.services.garment_processing import remove_background
from app.services.garment_rig import build_default_garment_rig
from app.services.image_utils import decode_base64_image, save_image_bytes
from app.services.pose import create_pose_provider
from app.services.three_d_assets import build_default_3d_rig, build_mesh_stats, select_glb_artifact
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


@router.get("/api/3d-assets", response_model=ThreeDAssetListResponse)
def list_three_d_garments(settings: Settings = Depends(get_settings)) -> ThreeDAssetListResponse:
    return ThreeDAssetListResponse(items=list_three_d_assets(settings.three_d_assets_dir))


@router.post("/api/3d-assets/conversion-jobs", response_model=ThreeDConversionJob)
def create_three_d_conversion_job(
    request: ThreeDConversionJobRequest,
    settings: Settings = Depends(get_settings),
) -> ThreeDConversionJob:
    job_id = create_asset_id("convert3d")
    asset_id = create_asset_id("garment3d")
    timestamp = now_utc()

    asset_dir = ensure_directory(settings.three_d_assets_dir / asset_id)
    source_dir = ensure_directory(asset_dir / "sources")
    job_dir = ensure_directory(settings.three_d_conversion_jobs_dir / job_id)

    stored_source_files: list[ThreeDSourceFile] = []
    source_payloads: list[tuple[str, bytes]] = []
    for source in request.source_files:
        file_bytes = decode_base64_image(source.file_base64)
        source_path = source_dir / source.filename
        source_path.write_bytes(file_bytes)
        stored_source_files.append(
            ThreeDSourceFile(
                filename=source.filename,
                file_format=source.file_format,
                file_url=f"{settings.static_data_url_prefix}/3d-assets/{asset_id}/sources/{source.filename}",
                size_bytes=len(file_bytes),
            )
        )
        source_payloads.append((source.file_format, file_bytes))

    glb_relative_path, warnings = select_glb_artifact(request)
    asset = ThreeDAsset(
        id=asset_id,
        name=request.name or asset_id,
        category=request.category,
        status="converted" if glb_relative_path else "staged",
        source_files=stored_source_files,
        glb_url=(
            f"{settings.static_data_url_prefix}/3d-assets/{asset_id}/{glb_relative_path}"
            if glb_relative_path
            else None
        ),
        preview_image_url=None,
        rig=build_default_3d_rig(request.category, request.rig_strategy),
        mesh_stats=build_mesh_stats(source_payloads),
        conversion_engine="mock-3d-converter",
        warnings=warnings,
        created_at=timestamp,
        updated_at=timestamp,
    )
    save_three_d_asset(asset_dir, asset)

    job = ThreeDConversionJob(
        id=job_id,
        asset_id=asset_id,
        name=asset.name,
        category=request.category,
        target_format=request.target_format,
        status="succeeded",
        source_files=stored_source_files,
        output_asset=asset,
        conversion_engine="mock-3d-converter",
        warnings=warnings,
        created_at=timestamp,
        updated_at=timestamp,
    )
    save_three_d_conversion_job(job_dir, job)
    return job


@router.get("/api/3d-assets/conversion-jobs/{job_id}", response_model=ThreeDConversionJob)
def get_three_d_conversion_job(job_id: str, settings: Settings = Depends(get_settings)) -> ThreeDConversionJob:
    job_dir = settings.three_d_conversion_jobs_dir / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="3D conversion job not found")
    return load_three_d_conversion_job(job_dir)


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
