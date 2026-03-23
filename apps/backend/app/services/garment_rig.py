from __future__ import annotations

from app.models.schemas import GarmentRig, GarmentPart, NormalizedPoint, NormalizedRect


def build_default_garment_rig(name: str, category: str) -> GarmentRig | None:
    if category != "top":
        return None

    normalized_name = name.lower()
    if "hood" in normalized_name:
        return build_hoodie_rig()
    return build_top_rig()


def build_top_rig() -> GarmentRig:
    return GarmentRig(
        anchors={
            "neck": point(0.5, 0.18),
            "left_shoulder": point(0.31, 0.24),
            "right_shoulder": point(0.69, 0.24),
            "left_hip": point(0.38, 0.78),
            "right_hip": point(0.62, 0.78),
            "left_elbow": point(0.19, 0.52),
            "right_elbow": point(0.81, 0.52),
            "left_wrist": point(0.14, 0.9),
            "right_wrist": point(0.86, 0.9),
        },
        parts=[
            GarmentPart(
                id="torso",
                role="torso",
                source_rect=rect(0.21, 0.12, 0.58, 0.84),
                pivot=point(0.5, 0.16),
                depth=10,
                scale_multiplier=1.0,
            ),
            GarmentPart(
                id="left_sleeve",
                role="left_sleeve",
                source_rect=rect(0.03, 0.18, 0.25, 0.75),
                pivot=point(0.9, 0.08),
                depth=8,
                anchor_start="left_shoulder",
                anchor_end="left_wrist",
                scale_multiplier=1.05,
                rotation_offset_deg=6,
            ),
            GarmentPart(
                id="right_sleeve",
                role="right_sleeve",
                source_rect=rect(0.72, 0.18, 0.25, 0.75),
                pivot=point(0.1, 0.08),
                depth=8,
                anchor_start="right_shoulder",
                anchor_end="right_wrist",
                scale_multiplier=1.05,
                rotation_offset_deg=-6,
            ),
        ],
    )


def build_hoodie_rig() -> GarmentRig:
    return GarmentRig(
        anchors={
            "neck": point(0.5, 0.16),
            "left_shoulder": point(0.31, 0.22),
            "right_shoulder": point(0.69, 0.22),
            "left_hip": point(0.38, 0.79),
            "right_hip": point(0.62, 0.79),
            "left_elbow": point(0.17, 0.5),
            "right_elbow": point(0.83, 0.5),
            "left_wrist": point(0.14, 0.93),
            "right_wrist": point(0.86, 0.93),
        },
        parts=[
            GarmentPart(
                id="hood",
                role="hood",
                source_rect=rect(0.28, 0.02, 0.44, 0.22),
                pivot=point(0.5, 0.82),
                depth=12,
                scale_multiplier=1.0,
            ),
            GarmentPart(
                id="torso",
                role="torso",
                source_rect=rect(0.22, 0.16, 0.56, 0.8),
                pivot=point(0.5, 0.12),
                depth=10,
                scale_multiplier=1.08,
            ),
            GarmentPart(
                id="left_sleeve",
                role="left_sleeve",
                source_rect=rect(0.02, 0.16, 0.26, 0.78),
                pivot=point(0.92, 0.08),
                depth=8,
                anchor_start="left_shoulder",
                anchor_end="left_wrist",
                scale_multiplier=1.08,
                rotation_offset_deg=8,
            ),
            GarmentPart(
                id="right_sleeve",
                role="right_sleeve",
                source_rect=rect(0.72, 0.16, 0.26, 0.78),
                pivot=point(0.08, 0.08),
                depth=8,
                anchor_start="right_shoulder",
                anchor_end="right_wrist",
                scale_multiplier=1.08,
                rotation_offset_deg=-8,
            ),
        ],
    )


def point(x: float, y: float) -> NormalizedPoint:
    return NormalizedPoint(x=x, y=y)


def rect(x: float, y: float, width: float, height: float) -> NormalizedRect:
    return NormalizedRect(x=x, y=y, width=width, height=height)
