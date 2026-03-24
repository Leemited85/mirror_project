from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_version: str
    project_root: Path
    clothes_dir: Path
    captures_dir: Path
    static_clothes_url_prefix: str
    data_root: Path
    models_dir: Path
    garments_dir: Path
    tryon_dir: Path
    three_d_assets_dir: Path
    three_d_conversion_jobs_dir: Path
    static_data_url_prefix: str
    pose_provider: str
    vton_provider: str
    mediapipe_model_asset_path: str | None
    catvton_endpoint: str | None
    comfyui_base_url: str | None
    comfyui_workflow_path: Path | None
    comfyui_timeout_seconds: int
    comfyui_poll_interval_ms: int
    comfyui_output_node_id: str | None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    project_root = Path(__file__).resolve().parents[4]
    clothes_dir = project_root / os.getenv("CLOTHES_DIR", "assets/clothes")
    captures_dir = project_root / os.getenv("CAPTURES_DIR", "apps/backend/data/captures")
    data_root = project_root / os.getenv("DATA_ROOT", "apps/backend/data")
    models_dir = data_root / "models"
    garments_dir = data_root / "garments"
    tryon_dir = data_root / "tryon"
    three_d_assets_dir = data_root / "3d-assets"
    three_d_conversion_jobs_dir = data_root / "3d-conversion-jobs"
    workflow_path_value = os.getenv("COMFYUI_WORKFLOW_PATH")
    comfyui_workflow_path = None
    if workflow_path_value:
        candidate = Path(workflow_path_value)
        comfyui_workflow_path = candidate if candidate.is_absolute() else project_root / candidate

    return Settings(
        app_name=os.getenv("APP_NAME", "Virtual Fitting Mirror Backend"),
        app_version=os.getenv("APP_VERSION", "0.1.0"),
        project_root=project_root,
        clothes_dir=clothes_dir,
        captures_dir=captures_dir,
        static_clothes_url_prefix=os.getenv("STATIC_CLOTHES_URL_PREFIX", "/static/clothes"),
        data_root=data_root,
        models_dir=models_dir,
        garments_dir=garments_dir,
        tryon_dir=tryon_dir,
        three_d_assets_dir=three_d_assets_dir,
        three_d_conversion_jobs_dir=three_d_conversion_jobs_dir,
        static_data_url_prefix=os.getenv("STATIC_DATA_URL_PREFIX", "/static/data"),
        pose_provider=os.getenv("POSE_PROVIDER", "mock"),
        vton_provider=os.getenv("VTON_PROVIDER", "mock"),
        mediapipe_model_asset_path=os.getenv("MEDIAPIPE_MODEL_ASSET_PATH"),
        catvton_endpoint=os.getenv("CATVTON_ENDPOINT"),
        comfyui_base_url=os.getenv("COMFYUI_BASE_URL"),
        comfyui_workflow_path=comfyui_workflow_path,
        comfyui_timeout_seconds=int(os.getenv("COMFYUI_TIMEOUT_SECONDS", "180")),
        comfyui_poll_interval_ms=int(os.getenv("COMFYUI_POLL_INTERVAL_MS", "1500")),
        comfyui_output_node_id=os.getenv("COMFYUI_OUTPUT_NODE_ID"),
    )


def ensure_runtime_directories(settings: Settings) -> None:
    for path in (
        settings.data_root,
        settings.models_dir,
        settings.garments_dir,
        settings.tryon_dir,
        settings.three_d_assets_dir,
        settings.three_d_conversion_jobs_dir,
        settings.captures_dir,
    ):
        path.mkdir(parents=True, exist_ok=True)
