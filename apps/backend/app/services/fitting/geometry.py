from __future__ import annotations

from app.models.schemas import OverlayBox, PoseLandmarks


def compute_overlay_from_landmarks(
    landmarks: PoseLandmarks,
    frame_height: int,
    garment_width: int,
    garment_height: int,
) -> OverlayBox:
    shoulder_width = landmarks.right_shoulder.x - landmarks.left_shoulder.x
    torso_height = landmarks.left_hip.y - landmarks.neck.y
    garment_ratio = garment_width / garment_height

    overlay_width = int(shoulder_width * 1.45)
    overlay_height = int(overlay_width / garment_ratio)
    minimum_height = int(torso_height * 1.15)
    overlay_height = max(overlay_height, minimum_height)
    overlay_width = int(overlay_height * garment_ratio)

    return OverlayBox(
        x=int(landmarks.neck.x - overlay_width / 2),
        y=int(landmarks.neck.y - frame_height * 0.02),
        width=overlay_width,
        height=overlay_height,
        rotation_deg=0,
    )
