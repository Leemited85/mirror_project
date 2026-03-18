from __future__ import annotations

from app.core.settings import Settings
from app.services.vton.base import VtonProvider
from app.services.vton.catvton_provider import CatVtonProvider
from app.services.vton.mock_provider import MockVtonProvider


def create_vton_provider(settings: Settings) -> VtonProvider:
    if settings.vton_provider == "catvton":
        return CatVtonProvider(settings.catvton_endpoint)
    return MockVtonProvider()
