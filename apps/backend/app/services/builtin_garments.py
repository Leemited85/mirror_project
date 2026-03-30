from __future__ import annotations

import re
from pathlib import Path

from app.core.settings import Settings
from app.models.schemas import GarmentAsset
from app.services.asset_store import ensure_directory, load_garment_asset, now_utc, save_garment_asset
from app.services.garment_processing import remove_background
from app.services.garment_rig import build_default_garment_rig
from app.services.image_utils import bytes_buffer, save_image_bytes

RASTER_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".avif"}

TOP_KEYWORDS = {"blouse", "cardigan", "coat", "hoodie", "jacket", "shirt", "sweater", "tee", "top"}
BOTTOM_KEYWORDS = {"jeans", "pants", "shorts", "skirt", "trouser"}
DRESS_KEYWORDS = {"dress", "gown"}


def sync_builtin_garments(settings: Settings) -> list[GarmentAsset]:
    if not settings.clothes_dir.exists():
        return []

    synced_assets: list[GarmentAsset] = []
    for source_path in sorted(settings.clothes_dir.iterdir()):
        if not source_path.is_file() or source_path.suffix.lower() not in RASTER_IMAGE_EXTENSIONS:
            continue

        asset_id = f"builtin_{slugify(source_path.stem)}"
        asset_dir = ensure_directory(settings.garments_dir / asset_id)
        meta_path = asset_dir / "meta.json"
        original_path = asset_dir / "original.png"
        processed_path = asset_dir / "processed.png"

        if not meta_path.exists() or not original_path.exists() or not processed_path.exists():
            source_bytes = source_path.read_bytes()
            processed_bytes, width, height = remove_background(source_bytes)
            save_image_bytes(original_path, normalize_to_png(source_bytes))
            save_image_bytes(processed_path, processed_bytes)

            display_name = prettify_name(source_path.stem)
            category = infer_category(source_path)
            asset = GarmentAsset(
                id=asset_id,
                name=display_name,
                category=category,
                original_image_url=f"{settings.static_data_url_prefix}/garments/{asset_id}/original.png",
                processed_image_url=f"{settings.static_data_url_prefix}/garments/{asset_id}/processed.png",
                width=width,
                height=height,
                rig=build_default_garment_rig(display_name, category),
                created_at=now_utc(),
            )
            save_garment_asset(asset_dir, asset)

        synced_assets.append(load_garment_asset(asset_dir))

    return synced_assets


def infer_category(source_path: Path) -> str:
    tokens = set(re.split(r"[\W_]+", source_path.stem.lower()))
    if tokens & DRESS_KEYWORDS:
        return "dress"
    if tokens & BOTTOM_KEYWORDS:
        return "bottom"
    if tokens & TOP_KEYWORDS:
        return "top"
    return "top"


def prettify_name(name: str) -> str:
    cleaned = re.sub(r"[_-]+", " ", name).strip()
    if not cleaned:
        return "Garment"
    return cleaned.title()


def slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", value.lower()).strip("_")
    return normalized or "garment"


def normalize_to_png(image_bytes: bytes) -> bytes:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Built-in garment sync requires pillow to be installed.") from exc

    image = Image.open(bytes_buffer(image_bytes)).convert("RGBA")
    output = bytes_buffer(b"")
    image.save(output, format="PNG")
    return output.getvalue()
