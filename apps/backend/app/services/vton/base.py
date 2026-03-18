from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.schemas import OverlayBox, PoseLandmarks


class VtonProvider(ABC):
    @abstractmethod
    def compose(
        self,
        model_image_bytes: bytes,
        garment_image_bytes: bytes,
        overlay: OverlayBox,
        landmarks: PoseLandmarks,
        frame_width: int,
        frame_height: int,
    ) -> tuple[bytes | None, list[str]]:
        """Return composed PNG bytes and any warnings."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier."""
