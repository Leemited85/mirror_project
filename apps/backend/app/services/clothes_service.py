from __future__ import annotations

from pathlib import Path

from app.models.schemas import ClothesItem


def list_clothes(clothes_dir: Path, static_prefix: str) -> list[ClothesItem]:
    if not clothes_dir.exists():
        return []

    items: list[ClothesItem] = []
    for asset in sorted(p for p in clothes_dir.iterdir() if p.is_file()):
        clothing_id = asset.stem
        items.append(
            ClothesItem(
                id=clothing_id,
                name=clothing_id.replace("-", " ").title(),
                asset_url=f"{static_prefix.rstrip('/')}/{asset.name}",
            )
        )
    return items
