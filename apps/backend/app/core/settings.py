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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    project_root = Path(__file__).resolve().parents[4]
    clothes_dir = project_root / os.getenv("CLOTHES_DIR", "assets/clothes")
    captures_dir = project_root / os.getenv("CAPTURES_DIR", "apps/backend/data/captures")

    return Settings(
        app_name=os.getenv("APP_NAME", "Virtual Fitting Mirror Backend"),
        app_version=os.getenv("APP_VERSION", "0.1.0"),
        project_root=project_root,
        clothes_dir=clothes_dir,
        captures_dir=captures_dir,
        static_clothes_url_prefix=os.getenv("STATIC_CLOTHES_URL_PREFIX", "/static/clothes"),
    )
