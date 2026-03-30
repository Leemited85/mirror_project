from __future__ import annotations

from app.models.schemas import OverlayBox, PoseLandmarks
from app.services.vton.base import VtonProvider


class CatVtonProvider(VtonProvider):
    def __init__(self, endpoint: str | None) -> None:
        self._endpoint = endpoint

    @property
    def name(self) -> str:
        return "catvton"

    def compose(
        self,
        model_image_bytes: bytes,
        garment_image_bytes: bytes,
        overlay: OverlayBox,
        landmarks: PoseLandmarks,
        frame_width: int,
        frame_height: int,
        garment_name: str | None = None,
        garment_category: str | None = None,
    ) -> tuple[bytes | None, list[str]]:
        del model_image_bytes, garment_image_bytes, overlay, landmarks, frame_width, frame_height, garment_name, garment_category

        if not self._endpoint:
            raise RuntimeError("CATVTON_ENDPOINT is not configured.")

        raise RuntimeError(
            "CatVTON provider scaffold is configured but the remote invocation is not implemented yet. "
            "Connect your inference service at CATVTON_ENDPOINT and replace this provider."
        )
