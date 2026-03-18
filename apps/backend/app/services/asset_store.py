from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.models.schemas import GarmentAsset, ModelAsset, TryOnJob


def ensure_directory(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def create_asset_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_model_asset(asset_dir: Path, asset: ModelAsset) -> None:
    write_json(asset_dir / "meta.json", asset.model_dump(mode="json"))


def save_garment_asset(asset_dir: Path, asset: GarmentAsset) -> None:
    write_json(asset_dir / "meta.json", asset.model_dump(mode="json"))


def save_tryon_job(asset_dir: Path, job: TryOnJob) -> None:
    write_json(asset_dir / "meta.json", job.model_dump(mode="json"))


def load_model_asset(asset_dir: Path) -> ModelAsset:
    return ModelAsset.model_validate(read_json(asset_dir / "meta.json"))


def load_garment_asset(asset_dir: Path) -> GarmentAsset:
    return GarmentAsset.model_validate(read_json(asset_dir / "meta.json"))


def load_tryon_job(asset_dir: Path) -> TryOnJob:
    return TryOnJob.model_validate(read_json(asset_dir / "meta.json"))


def list_model_assets(root: Path) -> list[ModelAsset]:
    if not root.exists():
        return []
    return [load_model_asset(path) for path in sorted(root.iterdir()) if path.is_dir() and (path / "meta.json").exists()]


def list_garment_assets(root: Path) -> list[GarmentAsset]:
    if not root.exists():
        return []
    return [load_garment_asset(path) for path in sorted(root.iterdir()) if path.is_dir() and (path / "meta.json").exists()]
