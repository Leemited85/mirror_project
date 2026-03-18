from __future__ import annotations

from app.models.schemas import PoseLandmarks, PosePoint
from app.services.image_utils import bytes_buffer
from app.services.pose.base import PoseProvider


class MediaPipePoseProvider(PoseProvider):
    def __init__(self, model_asset_path: str | None = None) -> None:
        self._model_asset_path = model_asset_path

    @property
    def name(self) -> str:
        return "mediapipe-pose"

    def detect(self, image_bytes: bytes, frame_width: int, frame_height: int) -> tuple[PoseLandmarks, float]:
        try:
            import mediapipe as mp
            import numpy as np
            from PIL import Image
        except ImportError as exc:
            raise RuntimeError("MediaPipe pose provider requires mediapipe and pillow to be installed.") from exc

        image = Image.open(bytes_buffer(image_bytes)).convert("RGB")
        image_array = np.array(image)

        with mp.solutions.pose.Pose(static_image_mode=True, model_complexity=1) as pose:
            result = pose.process(image=image_array)

        if not result.pose_landmarks:
            raise RuntimeError("MediaPipe could not detect a human pose from the uploaded model image.")

        landmarks = result.pose_landmarks.landmark

        def point(index: int) -> PosePoint:
            landmark = landmarks[index]
            return PosePoint(
                x=int(landmark.x * frame_width),
                y=int(landmark.y * frame_height),
            )

        fitted = PoseLandmarks(
            neck=PosePoint(
                x=int((point(11).x + point(12).x) / 2),
                y=int((point(11).y + point(12).y) / 2),
            ),
            left_shoulder=point(11),
            right_shoulder=point(12),
            left_hip=point(23),
            right_hip=point(24),
        )

        confidence = min(max((landmarks[11].visibility + landmarks[12].visibility) / 2, 0.0), 1.0)
        return fitted, confidence
