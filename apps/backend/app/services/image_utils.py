from __future__ import annotations

import base64
from io import BytesIO

from fastapi import HTTPException, status


def decode_base64_image(payload: str) -> bytes:
    try:
        image_bytes = base64.b64decode(payload, validate=True)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 image payload",
        ) from exc

    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image payload is empty",
        )

    return image_bytes


def encode_png_base64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("ascii")


def bytes_buffer(data: bytes) -> BytesIO:
    return BytesIO(data)
