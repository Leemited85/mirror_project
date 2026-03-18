from __future__ import annotations

from app.models.schemas import (
    FittingRequest,
    FittingResponse,
)
from app.services.fitting.base import FittingEngine
from app.services.fitting.geometry import compute_overlay_from_landmarks
from app.services.pose.mock_provider import MockPoseProvider


class MockFittingEngine(FittingEngine):
    """Body-aware placeholder implementation.

    The calculations mimic a pose-estimation result so a real detector can replace
    this class later without changing the route contract.
    """

    @property
    def name(self) -> str:
        return "mock-pose-v1"

    def compute_fit(self, request: FittingRequest) -> FittingResponse:
        landmarks, confidence = MockPoseProvider().detect(b"", request.frame_width, request.frame_height)
        overlay = compute_overlay_from_landmarks(
            landmarks=landmarks,
            frame_height=request.frame_height,
            garment_width=request.garment_width,
            garment_height=request.garment_height,
        )

        return FittingResponse(
            clothing_id=request.clothing_id,
            overlay=overlay,
            landmarks=landmarks,
            engine=self.name,
            confidence=confidence,
        )
