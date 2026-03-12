from __future__ import annotations

from app.models.schemas import FittingRequest, OverlayBox
from app.services.fitting.base import FittingEngine


class MockFittingEngine(FittingEngine):
    """Deterministic placeholder implementation.

    This can be replaced by a real model-backed engine without changing API handlers.
    """

    @property
    def name(self) -> str:
        return "mock-v1"

    def compute_overlay(self, request: FittingRequest) -> OverlayBox:
        width = int(request.frame_width * 0.4)
        height = int(request.frame_height * 0.55)
        x = int((request.frame_width - width) / 2)
        y = int(request.frame_height * 0.15)
        return OverlayBox(x=x, y=y, width=width, height=height)
