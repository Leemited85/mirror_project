from __future__ import annotations

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.settings import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name, version=settings.app_version)
app.include_router(router)

app.mount(
    settings.static_clothes_url_prefix,
    StaticFiles(directory=settings.clothes_dir),
    name="clothes-static",
)
