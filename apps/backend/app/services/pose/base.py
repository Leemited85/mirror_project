from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.schemas import PoseLandmarks


class PoseProvider(ABC):
    @abstractmethod
    def detect(self, image_bytes: bytes, frame_width: int, frame_height: int) -> tuple[PoseLandmarks, float]:
        """Return detected body landmarks and confidence."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier."""
