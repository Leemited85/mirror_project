from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.settings import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name, version=settings.app_version)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)

app.mount(
    settings.static_clothes_url_prefix,
    StaticFiles(directory=settings.clothes_dir),
    name="clothes-static",
)

app.mount(
    settings.static_data_url_prefix,
    StaticFiles(directory=settings.data_root),
    name="data-static",
)
