from __future__ import annotations

from app.models.schemas import PoseLandmarks, PosePoint
from app.services.pose.base import PoseProvider


class MockPoseProvider(PoseProvider):
    @property
    def name(self) -> str:
        return "mock-pose-v1"

    def detect(self, image_bytes: bytes, frame_width: int, frame_height: int) -> tuple[PoseLandmarks, float]:
        del image_bytes

        landmarks = PoseLandmarks(
            neck=PosePoint(x=int(frame_width * 0.5), y=int(frame_height * 0.18)),
            left_shoulder=PosePoint(x=int(frame_width * 0.34), y=int(frame_height * 0.24)),
            right_shoulder=PosePoint(x=int(frame_width * 0.66), y=int(frame_height * 0.24)),
            left_hip=PosePoint(x=int(frame_width * 0.4), y=int(frame_height * 0.62)),
            right_hip=PosePoint(x=int(frame_width * 0.6), y=int(frame_height * 0.62)),
        )
        return landmarks, 0.61
