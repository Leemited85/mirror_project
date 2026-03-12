from __future__ import annotations

import base64
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, status

from app.models.schemas import CaptureResponse


def save_capture(captures_dir: Path, image_base64: str, extension: str) -> CaptureResponse:
    captures_dir.mkdir(parents=True, exist_ok=True)

    try:
        image_bytes = base64.b64decode(image_base64, validate=True)
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

    capture_id = uuid4().hex
    filename = f"{capture_id}.{extension.lower()}"
    path = captures_dir / filename
    path.write_bytes(image_bytes)

    created_at = datetime.now(timezone.utc)
    return CaptureResponse(
        capture_id=capture_id,
        saved_path=str(path),
        created_at=created_at,
    )
