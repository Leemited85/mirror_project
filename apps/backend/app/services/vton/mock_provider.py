from __future__ import annotations

from app.models.schemas import OverlayBox, PoseLandmarks
from app.services.image_utils import bytes_buffer
from app.services.vton.base import VtonProvider


class MockVtonProvider(VtonProvider):
    @property
    def name(self) -> str:
        return "mock-compositor-v1"

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
        del landmarks, garment_name, garment_category

        try:
            from PIL import Image
        except ImportError as exc:
            raise RuntimeError("Mock VTON compositor requires pillow to be installed.") from exc

        model_image = Image.open(bytes_buffer(model_image_bytes)).convert("RGBA")
        garment_image = Image.open(bytes_buffer(garment_image_bytes)).convert("RGBA")

        canvas = crop_to_canvas(model_image, frame_width, frame_height)
        fitted = garment_image.resize((overlay.width, overlay.height))
        canvas.alpha_composite(fitted, (overlay.x, overlay.y))

        buffer = bytes_buffer(b"")
        canvas.save(buffer, format="PNG")
        return buffer.getvalue(), ["Using mock compositor. Replace VTON_PROVIDER to connect a real try-on model."]


def crop_to_canvas(image, width: int, height: int):
    source_ratio = image.width / image.height
    target_ratio = width / height

    if source_ratio > target_ratio:
        crop_width = int(image.height * target_ratio)
        offset_x = int((image.width - crop_width) / 2)
        crop_box = (offset_x, 0, offset_x + crop_width, image.height)
    else:
        crop_height = int(image.width / target_ratio)
        offset_y = int((image.height - crop_height) / 2)
        crop_box = (0, offset_y, image.width, offset_y + crop_height)

    return image.crop(crop_box).resize((width, height))
