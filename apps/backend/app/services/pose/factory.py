from __future__ import annotations

from app.core.settings import Settings
from app.services.pose.base import PoseProvider
from app.services.pose.mediapipe_provider import MediaPipePoseProvider
from app.services.pose.mock_provider import MockPoseProvider


def create_pose_provider(settings: Settings) -> PoseProvider:
    if settings.pose_provider == "mediapipe":
        return MediaPipePoseProvider(settings.mediapipe_model_asset_path)
    return MockPoseProvider()
