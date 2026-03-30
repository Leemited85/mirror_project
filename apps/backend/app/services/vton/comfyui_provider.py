from __future__ import annotations

import json
import mimetypes
import time
from pathlib import Path
from typing import Any
from urllib import parse, request
from uuid import uuid4

from app.core.settings import Settings
from app.models.schemas import OverlayBox, PoseLandmarks
from app.services.comfyui_diagnostics import is_template_workflow
from app.services.image_utils import bytes_buffer
from app.services.vton.base import VtonProvider


class ComfyUiVtonProvider(VtonProvider):
    def __init__(self, settings: Settings) -> None:
        self._base_url = (settings.comfyui_base_url or "").rstrip("/")
        self._workflow_path = settings.comfyui_workflow_path
        self._timeout_seconds = settings.comfyui_timeout_seconds
        self._poll_interval_seconds = max(settings.comfyui_poll_interval_ms, 200) / 1000
        self._output_node_id = settings.comfyui_output_node_id
        self.last_job_id: str | None = None

    @property
    def name(self) -> str:
        return "comfyui"

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
        del garment_name, garment_category
        self._validate_configuration()

        model_upload = self._upload_image(self._normalize_png(model_image_bytes), "model.png")
        garment_upload = self._upload_image(self._normalize_png(garment_image_bytes), "garment.png")
        workflow = self._load_workflow(
            model_upload=model_upload,
            garment_upload=garment_upload,
            overlay=overlay,
            landmarks=landmarks,
            frame_width=frame_width,
            frame_height=frame_height,
        )

        client_id = str(uuid4())
        prompt_response = self._post_json(
            "/prompt",
            {
                "prompt": workflow,
                "client_id": client_id,
            },
        )
        prompt_id = str(prompt_response.get("prompt_id") or "")
        if not prompt_id:
            raise RuntimeError("ComfyUI prompt submission succeeded but prompt_id was missing.")

        self.last_job_id = prompt_id
        image_descriptor = self._wait_for_result(prompt_id)
        image_bytes = self._download_result(image_descriptor)
        warnings = ["ComfyUI workflow completed successfully."]
        return image_bytes, warnings

    def _validate_configuration(self) -> None:
        if not self._base_url:
            raise RuntimeError("COMFYUI_BASE_URL is not configured.")
        if not self._workflow_path:
            raise RuntimeError("COMFYUI_WORKFLOW_PATH is not configured.")
        if not self._workflow_path.exists():
            raise RuntimeError(f"ComfyUI workflow file was not found: {self._workflow_path}")
        if is_template_workflow(self._workflow_path):
            raise RuntimeError(
                "ComfyUI workflow is still using the starter template. "
                "Replace the placeholder VTON node class and input mappings first."
            )

    def _normalize_png(self, image_bytes: bytes) -> bytes:
        try:
            from PIL import Image
        except ImportError as exc:
            raise RuntimeError("ComfyUI provider requires pillow to be installed.") from exc

        image = Image.open(bytes_buffer(image_bytes)).convert("RGBA")
        output = bytes_buffer(b"")
        image.save(output, format="PNG")
        return output.getvalue()

    def _upload_image(self, image_bytes: bytes, filename: str) -> dict[str, str]:
        boundary = f"----CodexBoundary{uuid4().hex}"
        body = self._build_multipart_body(
            boundary=boundary,
            field_name="image",
            filename=filename,
            file_bytes=image_bytes,
            extra_fields={"overwrite": "true"},
        )
        response = self._open(
            "/upload/image",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        payload = json.loads(response.decode("utf-8"))
        name = payload.get("name")
        if not isinstance(name, str) or not name:
            raise RuntimeError("ComfyUI image upload did not return a file name.")

        return {
            "filename": name,
            "subfolder": str(payload.get("subfolder") or ""),
            "type": str(payload.get("type") or "input"),
        }

    def _load_workflow(
        self,
        model_upload: dict[str, str],
        garment_upload: dict[str, str],
        overlay: OverlayBox,
        landmarks: PoseLandmarks,
        frame_width: int,
        frame_height: int,
    ) -> dict[str, Any]:
        assert self._workflow_path is not None
        workflow = json.loads(self._workflow_path.read_text(encoding="utf-8"))
        replacements = {
            "{{MODEL_IMAGE}}": model_upload["filename"],
            "{{MODEL_SUBFOLDER}}": model_upload["subfolder"],
            "{{MODEL_IMAGE_TYPE}}": model_upload["type"],
            "{{GARMENT_IMAGE}}": garment_upload["filename"],
            "{{GARMENT_SUBFOLDER}}": garment_upload["subfolder"],
            "{{GARMENT_IMAGE_TYPE}}": garment_upload["type"],
            "{{FRAME_WIDTH}}": frame_width,
            "{{FRAME_HEIGHT}}": frame_height,
            "{{OVERLAY_X}}": overlay.x,
            "{{OVERLAY_Y}}": overlay.y,
            "{{OVERLAY_WIDTH}}": overlay.width,
            "{{OVERLAY_HEIGHT}}": overlay.height,
            "{{OVERLAY_ROTATION_DEG}}": overlay.rotation_deg,
            "{{LANDMARK_NECK_X}}": landmarks.neck.x,
            "{{LANDMARK_NECK_Y}}": landmarks.neck.y,
            "{{LANDMARK_LEFT_SHOULDER_X}}": landmarks.left_shoulder.x,
            "{{LANDMARK_LEFT_SHOULDER_Y}}": landmarks.left_shoulder.y,
            "{{LANDMARK_RIGHT_SHOULDER_X}}": landmarks.right_shoulder.x,
            "{{LANDMARK_RIGHT_SHOULDER_Y}}": landmarks.right_shoulder.y,
            "{{LANDMARK_LEFT_HIP_X}}": landmarks.left_hip.x,
            "{{LANDMARK_LEFT_HIP_Y}}": landmarks.left_hip.y,
            "{{LANDMARK_RIGHT_HIP_X}}": landmarks.right_hip.x,
            "{{LANDMARK_RIGHT_HIP_Y}}": landmarks.right_hip.y,
        }
        return replace_placeholders(workflow, replacements)

    def _wait_for_result(self, prompt_id: str) -> dict[str, str]:
        deadline = time.time() + self._timeout_seconds
        last_error_message: str | None = None

        while time.time() < deadline:
            payload = self._get_json(f"/history/{prompt_id}")
            history = payload.get(prompt_id)
            if isinstance(history, dict):
                if history.get("status", {}).get("status_str") == "error":
                    raise RuntimeError("ComfyUI workflow execution failed. Check the ComfyUI console for details.")

                outputs = history.get("outputs")
                image_descriptor = self._extract_output_image(outputs)
                if image_descriptor:
                    return image_descriptor

                status_messages = history.get("status", {}).get("messages") or []
                if status_messages:
                    last_error_message = str(status_messages[-1])

            time.sleep(self._poll_interval_seconds)

        suffix = f" Last status: {last_error_message}" if last_error_message else ""
        raise RuntimeError(f"ComfyUI workflow timed out after {self._timeout_seconds} seconds.{suffix}")

    def _extract_output_image(self, outputs: Any) -> dict[str, str] | None:
        if not isinstance(outputs, dict):
            return None

        node_ids = [self._output_node_id] if self._output_node_id else list(outputs.keys())
        for node_id in node_ids:
            if not node_id:
                continue
            node_output = outputs.get(node_id)
            if not isinstance(node_output, dict):
                continue
            images = node_output.get("images")
            if not isinstance(images, list) or not images:
                continue
            first_image = images[0]
            if not isinstance(first_image, dict):
                continue
            filename = first_image.get("filename")
            if not isinstance(filename, str) or not filename:
                continue
            return {
                "filename": filename,
                "subfolder": str(first_image.get("subfolder") or ""),
                "type": str(first_image.get("type") or "output"),
            }

        return None

    def _download_result(self, image_descriptor: dict[str, str]) -> bytes:
        query = parse.urlencode(image_descriptor)
        return self._open(f"/view?{query}")

    def _get_json(self, path: str) -> dict[str, Any]:
        payload = self._open(path)
        return json.loads(payload.decode("utf-8"))

    def _post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = self._open(
            path,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        return json.loads(response.decode("utf-8"))

    def _open(self, path: str, data: bytes | None = None, headers: dict[str, str] | None = None) -> bytes:
        try:
            req = request.Request(f"{self._base_url}{path}", data=data, headers=headers or {}, method="POST" if data is not None else "GET")
            with request.urlopen(req, timeout=self._timeout_seconds) as response:
                return response.read()
        except Exception as exc:  # pragma: no cover - network path
            raise RuntimeError(f"ComfyUI request failed for {path}: {exc}") from exc

    def _build_multipart_body(
        self,
        boundary: str,
        field_name: str,
        filename: str,
        file_bytes: bytes,
        extra_fields: dict[str, str],
    ) -> bytes:
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        lines: list[bytes] = []

        for key, value in extra_fields.items():
            lines.extend(
                [
                    f"--{boundary}\r\n".encode("utf-8"),
                    f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"),
                    f"{value}\r\n".encode("utf-8"),
                ]
            )

        lines.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                (
                    f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode(
                        "utf-8"
                    )
                ),
                f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"),
                file_bytes,
                b"\r\n",
                f"--{boundary}--\r\n".encode("utf-8"),
            ]
        )

        return b"".join(lines)


def replace_placeholders(value: Any, replacements: dict[str, Any]) -> Any:
    if isinstance(value, dict):
        return {key: replace_placeholders(child, replacements) for key, child in value.items()}

    if isinstance(value, list):
        return [replace_placeholders(item, replacements) for item in value]

    if isinstance(value, str):
        if value in replacements:
            return replacements[value]

        next_value = value
        for placeholder, replacement in replacements.items():
            if placeholder in next_value:
                next_value = next_value.replace(placeholder, str(replacement))
        return next_value

    return value
