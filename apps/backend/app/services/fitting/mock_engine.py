from __future__ import annotations

from app.models.schemas import (
    FittingRequest,
    FittingResponse,
    OverlayBox,
    PoseLandmarks,
    PosePoint,
)
from app.services.fitting.base import FittingEngine


class MockFittingEngine(FittingEngine):
    """Body-aware placeholder implementation.

    The calculations mimic a pose-estimation result so a real detector can replace
    this class later without changing the route contract.
    """

    @property
    def name(self) -> str:
        return "mock-pose-v1"

    def compute_fit(self, request: FittingRequest) -> FittingResponse:
        frame_width = request.frame_width
        frame_height = request.frame_height

        neck = PosePoint(x=int(frame_width * 0.5), y=int(frame_height * 0.18))
        left_shoulder = PosePoint(x=int(frame_width * 0.34), y=int(frame_height * 0.24))
        right_shoulder = PosePoint(x=int(frame_width * 0.66), y=int(frame_height * 0.24))
        left_hip = PosePoint(x=int(frame_width * 0.4), y=int(frame_height * 0.62))
        right_hip = PosePoint(x=int(frame_width * 0.6), y=int(frame_height * 0.62))

        shoulder_width = right_shoulder.x - left_shoulder.x
        torso_height = left_hip.y - neck.y
        garment_ratio = request.garment_width / request.garment_height

        overlay_width = int(shoulder_width * 1.45)
        overlay_height = int(overlay_width / garment_ratio)
        minimum_height = int(torso_height * 1.15)
        overlay_height = max(overlay_height, minimum_height)
        overlay_width = int(overlay_height * garment_ratio)

        overlay = OverlayBox(
            x=int(neck.x - overlay_width / 2),
            y=int(neck.y - frame_height * 0.02),
            width=overlay_width,
            height=overlay_height,
            rotation_deg=0,
        )

        return FittingResponse(
            clothing_id=request.clothing_id,
            overlay=overlay,
            landmarks=PoseLandmarks(
                neck=neck,
                left_shoulder=left_shoulder,
                right_shoulder=right_shoulder,
                left_hip=left_hip,
                right_hip=right_hip,
            ),
            engine=self.name,
            confidence=0.61,
        )
