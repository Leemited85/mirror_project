from __future__ import annotations

import json
import math
import mimetypes
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib import error as urllib_error
from urllib import request as urllib_request
from uuid import uuid4

from app.core.settings import Settings
from app.models.schemas import OverlayBox, PoseLandmarks, PosePoint
from app.services.image_utils import bytes_buffer
from app.services.vton.base import VtonProvider


class IdmVtonProvider(VtonProvider):
    def __init__(self, settings: Settings) -> None:
        self._base_url = (settings.idm_vton_base_url or "").rstrip("/")
        api_name = settings.idm_vton_api_name.strip() or "/tryon"
        self._api_name = api_name if api_name.startswith("/") else f"/{api_name}"
        endpoint_url = (settings.idm_vton_endpoint_url or "").strip()
        self._endpoint_url = endpoint_url or None
        self._auth_token = (settings.idm_vton_auth_token or "").strip() or None
        self._api_key = (settings.idm_vton_api_key or "").strip() or None
        self._api_key_header = (settings.idm_vton_api_key_header or "x-api-key").strip() or "x-api-key"
        self._timeout_seconds = max(settings.idm_vton_timeout_seconds, 30)
        self._auto_crop = settings.idm_vton_auto_crop
        self._denoise_steps = max(settings.idm_vton_denoise_steps, 20)
        self._seed = settings.idm_vton_seed
        self.last_job_id: str | None = None

    @property
    def name(self) -> str:
        return "idm-vton"

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
        if not self._endpoint_url and not self._base_url:
            raise RuntimeError("Set IDM_VTON_ENDPOINT_URL or IDM_VTON_BASE_URL to reach IDM-VTON.")

        garment_description = build_garment_description(garment_name, garment_category)

        with TemporaryDirectory(prefix="idm-vton-") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            human_image_path = temp_dir / "human.png"
            garment_image_path = temp_dir / "garment.png"
            mask_image_path = temp_dir / "mask.png"
            pose_image_path = temp_dir / "pose.png"

            human_image = normalize_rgb_image(model_image_bytes)
            garment_image = normalize_rgb_image(garment_image_bytes)
            mask_image = render_mask_image(landmarks, overlay, frame_width, frame_height)
            pose_image = render_pose_image(human_image, landmarks, overlay)

            human_image.save(human_image_path, format="PNG")
            garment_image.save(garment_image_path, format="PNG")
            mask_image.save(mask_image_path, format="PNG")
            pose_image.save(pose_image_path, format="PNG")

            response_bytes = self._post_tryon(
                human_image_path=human_image_path,
                garment_image_path=garment_image_path,
                mask_image_path=mask_image_path,
                pose_image_path=pose_image_path,
                garment_description=garment_description,
            )

        self.last_job_id = f"idm-vton:{self._resolved_endpoint_url}"
        warnings = [
            f"Rendered with IDM-VTON via {self._resolved_endpoint_url}.",
            f"Prompt used: {garment_description}.",
            "Pose guidance was derived from the captured frame and frontend landmarks.",
        ]
        return response_bytes, warnings

    @property
    def _resolved_endpoint_url(self) -> str:
        if self._endpoint_url:
            return self._endpoint_url
        return f"{self._base_url}{self._api_name}"

    def _post_tryon(
        self,
        human_image_path: Path,
        garment_image_path: Path,
        mask_image_path: Path,
        pose_image_path: Path,
        garment_description: str,
    ) -> bytes:
        boundary = f"----CodexBoundary{uuid4().hex}"
        body = build_multipart_body(
            boundary=boundary,
            files={
                "human_image": human_image_path,
                "garment_image": garment_image_path,
                "mask_image": mask_image_path,
                "pose_image": pose_image_path,
            },
            fields={
                "garment_description": garment_description,
                "denoise_steps": str(self._denoise_steps),
                "seed": str(self._seed),
                "auto_crop": json.dumps(self._auto_crop),
            },
        )

        headers = {
            "Accept": "image/png, image/*;q=0.9, application/octet-stream;q=0.8, application/json;q=0.7",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        }
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"
        if self._api_key:
            headers[self._api_key_header] = self._api_key

        request = urllib_request.Request(
            self._resolved_endpoint_url,
            data=body,
            headers=headers,
            method="POST",
        )

        try:
            with urllib_request.urlopen(request, timeout=self._timeout_seconds) as response:
                content_type = response.headers.get("Content-Type", "")
                payload = response.read()
        except urllib_error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"IDM-VTON request failed: HTTP {exc.code} {exc.reason}: {detail}") from exc
        except Exception as exc:
            raise RuntimeError(f"IDM-VTON request failed: {exc}") from exc

        if content_type.startswith("application/json"):
            try:
                detail = json.loads(payload.decode("utf-8"))
            except Exception:
                detail = payload.decode("utf-8", errors="replace")
            raise RuntimeError(f"IDM-VTON server returned JSON instead of an image: {detail}")

        return payload


def normalize_rgb_image(image_bytes: bytes):
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("IDM-VTON provider requires pillow to be installed.") from exc

    return Image.open(bytes_buffer(image_bytes)).convert("RGB")


def render_mask_image(landmarks: PoseLandmarks, overlay: OverlayBox, frame_width: int, frame_height: int):
    from PIL import Image, ImageDraw

    image = Image.new("L", (frame_width, frame_height), 0)
    draw = ImageDraw.Draw(image)

    shoulder_width = max(24.0, point_distance(landmarks.left_shoulder, landmarks.right_shoulder))
    hip_width = max(18.0, point_distance(landmarks.left_hip, landmarks.right_hip))
    torso_expand_x = max(18, int(shoulder_width * 0.22))
    torso_expand_y = max(12, int(shoulder_width * 0.16))
    hip_expand_x = max(14, int(hip_width * 0.28))

    torso_polygon = [
        (landmarks.left_shoulder.x - torso_expand_x, landmarks.left_shoulder.y - torso_expand_y),
        (landmarks.right_shoulder.x + torso_expand_x, landmarks.right_shoulder.y - torso_expand_y),
        (landmarks.right_hip.x + hip_expand_x, landmarks.right_hip.y + torso_expand_y),
        (landmarks.left_hip.x - hip_expand_x, landmarks.left_hip.y + torso_expand_y),
    ]
    draw.polygon(torso_polygon, fill=255)

    if landmarks.left_elbow:
        draw_limb(draw, [landmarks.left_shoulder, landmarks.left_elbow], width=max(18, int(shoulder_width * 0.18)))
    if landmarks.right_elbow:
        draw_limb(draw, [landmarks.right_shoulder, landmarks.right_elbow], width=max(18, int(shoulder_width * 0.18)))
    if landmarks.left_elbow and landmarks.left_wrist:
        draw_limb(draw, [landmarks.left_elbow, landmarks.left_wrist], width=max(14, int(shoulder_width * 0.14)))
    if landmarks.right_elbow and landmarks.right_wrist:
        draw_limb(draw, [landmarks.right_elbow, landmarks.right_wrist], width=max(14, int(shoulder_width * 0.14)))

    neck_radius = max(10, int(shoulder_width * 0.12))
    draw.ellipse(
        (
            landmarks.neck.x - neck_radius,
            landmarks.neck.y - neck_radius,
            landmarks.neck.x + neck_radius,
            landmarks.neck.y + neck_radius,
        ),
        fill=255,
    )

    # Ensure the requested overlay region remains part of the inpaint area.
    draw.rounded_rectangle(
        (
            overlay.x,
            overlay.y,
            overlay.x + overlay.width,
            overlay.y + overlay.height,
        ),
        radius=max(8, int(min(overlay.width, overlay.height) * 0.08)),
        fill=255,
    )

    return image


def render_pose_image(human_image, landmarks: PoseLandmarks, overlay: OverlayBox):
    from PIL import ImageDraw

    pose_image = human_image.copy().convert("RGB")
    draw = ImageDraw.Draw(pose_image, "RGBA")

    shoulder_width = max(24.0, point_distance(landmarks.left_shoulder, landmarks.right_shoulder))
    torso_polygon = [
        (landmarks.left_shoulder.x, landmarks.left_shoulder.y),
        (landmarks.right_shoulder.x, landmarks.right_shoulder.y),
        (landmarks.right_hip.x, landmarks.right_hip.y),
        (landmarks.left_hip.x, landmarks.left_hip.y),
    ]
    draw.polygon(torso_polygon, fill=(54, 162, 235, 80))

    limb_width = max(8, int(shoulder_width * 0.12))
    draw_pose_limb(draw, landmarks.neck, landmarks.left_shoulder, limb_width, (255, 99, 132, 170))
    draw_pose_limb(draw, landmarks.neck, landmarks.right_shoulder, limb_width, (255, 159, 64, 170))
    draw_pose_limb(draw, landmarks.left_shoulder, landmarks.left_hip, limb_width, (75, 192, 192, 170))
    draw_pose_limb(draw, landmarks.right_shoulder, landmarks.right_hip, limb_width, (153, 102, 255, 170))
    draw_pose_limb(draw, landmarks.left_hip, landmarks.right_hip, limb_width, (255, 205, 86, 170))

    if landmarks.left_elbow:
        draw_pose_limb(draw, landmarks.left_shoulder, landmarks.left_elbow, limb_width, (255, 99, 132, 170))
    if landmarks.right_elbow:
        draw_pose_limb(draw, landmarks.right_shoulder, landmarks.right_elbow, limb_width, (255, 159, 64, 170))
    if landmarks.left_elbow and landmarks.left_wrist:
        draw_pose_limb(draw, landmarks.left_elbow, landmarks.left_wrist, max(6, limb_width - 2), (255, 99, 132, 150))
    if landmarks.right_elbow and landmarks.right_wrist:
        draw_pose_limb(draw, landmarks.right_elbow, landmarks.right_wrist, max(6, limb_width - 2), (255, 159, 64, 150))

    marker_radius = max(6, int(shoulder_width * 0.08))
    for point in list_pose_points(landmarks):
        draw.ellipse(
            (
                point.x - marker_radius,
                point.y - marker_radius,
                point.x + marker_radius,
                point.y + marker_radius,
            ),
            fill=(255, 255, 255, 210),
        )

    draw.rounded_rectangle(
        (
            overlay.x,
            overlay.y,
            overlay.x + overlay.width,
            overlay.y + overlay.height,
        ),
        radius=max(10, int(min(overlay.width, overlay.height) * 0.08)),
        outline=(120, 220, 120, 190),
        width=4,
    )

    return pose_image


def draw_limb(draw, points: list[PosePoint], width: int) -> None:
    draw.line([(point.x, point.y) for point in points], fill=255, width=width, joint="curve")
    radius = max(4, width // 2)
    for point in points:
        draw.ellipse((point.x - radius, point.y - radius, point.x + radius, point.y + radius), fill=255)


def draw_pose_limb(draw, start: PosePoint, end: PosePoint, width: int, color: tuple[int, int, int, int]) -> None:
    draw.line([(start.x, start.y), (end.x, end.y)], fill=color, width=width, joint="curve")


def list_pose_points(landmarks: PoseLandmarks) -> list[PosePoint]:
    points: list[PosePoint] = [
        landmarks.neck,
        landmarks.left_shoulder,
        landmarks.right_shoulder,
        landmarks.left_hip,
        landmarks.right_hip,
    ]
    optional_points = [landmarks.left_elbow, landmarks.right_elbow, landmarks.left_wrist, landmarks.right_wrist]
    points.extend(point for point in optional_points if point is not None)
    return points


def point_distance(left: PosePoint, right: PosePoint) -> float:
    return math.hypot(left.x - right.x, left.y - right.y)


def build_multipart_body(boundary: str, files: dict[str, Path], fields: dict[str, str]) -> bytes:
    lines: list[bytes] = []

    for key, value in fields.items():
        lines.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"),
                f"{value}\r\n".encode("utf-8"),
            ]
        )

    for field_name, path in files.items():
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        lines.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{field_name}"; filename="{path.name}"\r\n'.encode("utf-8"),
                f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"),
                path.read_bytes(),
                b"\r\n",
            ]
        )

    lines.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(lines)


def build_garment_description(garment_name: str | None, garment_category: str | None) -> str:
    if garment_name:
        normalized = garment_name.replace("_", " ").replace("-", " ").strip()
        if normalized:
            return normalized

    category_map = {
        "top": "upper body garment",
        "bottom": "lower body garment",
        "dress": "dress",
    }
    return category_map.get((garment_category or "").lower(), "garment")
