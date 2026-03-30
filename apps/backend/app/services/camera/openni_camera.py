from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from threading import RLock
from typing import Any

from app.core.settings import Settings
from app.models.schemas import CameraStreamAvailability, OpenNICameraPreviewResponse, OpenNICameraStatusResponse


@dataclass
class PreparedImage:
    data_url: str
    width: int
    height: int


class OpenNICameraService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._lock = RLock()
        self._openni2: Any | None = None
        self._device: Any | None = None
        self._streams: dict[str, Any] = {}
        self._dll_directory: str | None = None
        self._last_error: str | None = None

    def get_status(self) -> OpenNICameraStatusResponse:
        with self._lock:
            package_available, import_error = self._try_import_wrapper()
            if not package_available:
                return OpenNICameraStatusResponse(
                    package_available=False,
                    sdk_loaded=False,
                    connected=False,
                    message="Python package 'openni' is not installed. Install apps/backend/requirements-camera.txt first.",
                    last_error=import_error,
                )

            initialized, init_error = self._ensure_initialized()
            if not initialized:
                return OpenNICameraStatusResponse(
                    package_available=True,
                    sdk_loaded=False,
                    connected=False,
                    dll_directory=self._dll_directory,
                    message="OpenNI SDK runtime could not be loaded. Set OPENNI2_REDIST64 to the folder containing OpenNI2.dll.",
                    last_error=init_error,
                )

            connected, device_error = self._ensure_device()
            if not connected:
                return OpenNICameraStatusResponse(
                    package_available=True,
                    sdk_loaded=True,
                    connected=False,
                    dll_directory=self._dll_directory,
                    sensors=CameraStreamAvailability(),
                    message="OpenNI SDK loaded, but no compatible Astra/OpenNI device is currently detected.",
                    last_error=device_error,
                )

            device_info = self._device.get_device_info()
            sensors = self._collect_sensor_availability()
            return OpenNICameraStatusResponse(
                package_available=True,
                sdk_loaded=True,
                connected=True,
                dll_directory=self._dll_directory,
                device_uri=decode_if_bytes(getattr(device_info, "uri", None)),
                vendor=decode_if_bytes(getattr(device_info, "vendor", None)),
                name=decode_if_bytes(getattr(device_info, "name", None)),
                sensors=sensors,
                message="OpenNI camera connected and ready.",
                last_error=self._last_error,
            )

    def reconnect(self) -> OpenNICameraStatusResponse:
        with self._lock:
            self._close_locked()
            self._last_error = None
        return self.get_status()

    def get_preview(self) -> OpenNICameraPreviewResponse:
        with self._lock:
            status = self.get_status()
            if not status.connected:
                return OpenNICameraPreviewResponse(
                    connected=False,
                    device_uri=status.device_uri,
                    captured_at=now_utc(),
                )

            prepared: dict[str, PreparedImage] = {}
            sensors = self._collect_sensor_availability()
            if sensors.color:
                prepared["color"] = self._capture_sensor_frame("color")
            if sensors.depth:
                prepared["depth"] = self._capture_sensor_frame("depth")
            if sensors.ir:
                prepared["ir"] = self._capture_sensor_frame("ir")

            return OpenNICameraPreviewResponse(
                connected=True,
                device_uri=status.device_uri,
                color_image_data_url=prepared.get("color").data_url if "color" in prepared else None,
                depth_image_data_url=prepared.get("depth").data_url if "depth" in prepared else None,
                ir_image_data_url=prepared.get("ir").data_url if "ir" in prepared else None,
                color_width=prepared.get("color").width if "color" in prepared else None,
                color_height=prepared.get("color").height if "color" in prepared else None,
                depth_width=prepared.get("depth").width if "depth" in prepared else None,
                depth_height=prepared.get("depth").height if "depth" in prepared else None,
                ir_width=prepared.get("ir").width if "ir" in prepared else None,
                ir_height=prepared.get("ir").height if "ir" in prepared else None,
                captured_at=now_utc(),
            )

    def _try_import_wrapper(self) -> tuple[bool, str | None]:
        if self._openni2 is not None:
            return True, None

        try:
            from openni import openni2
        except ImportError as exc:
            return False, str(exc)

        self._openni2 = openni2
        return True, None

    def _ensure_initialized(self) -> tuple[bool, str | None]:
        assert self._openni2 is not None
        if self._openni2.is_initialized():
            return True, None

        last_error: str | None = None
        for candidate in candidate_dll_directories(self._settings):
            try:
                self._openni2.initialize(str(candidate))
            except Exception as exc:  # pragma: no cover - depends on local SDK
                last_error = str(exc)
                continue

            self._dll_directory = str(candidate)
            return True, None

        self._last_error = last_error
        return False, last_error

    def _ensure_device(self) -> tuple[bool, str | None]:
        assert self._openni2 is not None
        if self._device is not None:
            return True, None

        try:
            uris = self._openni2.Device.enumerate_uris()
            if not uris:
                return False, "OpenNI did not enumerate any connected devices."
            self._device = self._openni2.Device.open_any()
            self._configure_device()
            return True, None
        except Exception as exc:  # pragma: no cover - depends on device
            self._last_error = str(exc)
            self._device = None
            return False, str(exc)

    def _configure_device(self) -> None:
        if self._device is None:
            return

        sensors = self._collect_sensor_availability()
        if sensors.color and sensors.depth:
            try:
                self._device.depth_color_sync = True
            except Exception:
                pass
            try:
                if self._device.is_image_registration_mode_supported(self._openni2.IMAGE_REGISTRATION_DEPTH_TO_COLOR):
                    self._device.set_image_registration_mode(self._openni2.IMAGE_REGISTRATION_DEPTH_TO_COLOR)
            except Exception:
                pass

    def _collect_sensor_availability(self) -> CameraStreamAvailability:
        if self._device is None or self._openni2 is None:
            return CameraStreamAvailability()

        return CameraStreamAvailability(
            color=bool(self._device.has_sensor(self._openni2.SENSOR_COLOR)),
            depth=bool(self._device.has_sensor(self._openni2.SENSOR_DEPTH)),
            ir=bool(self._device.has_sensor(self._openni2.SENSOR_IR)),
        )

    def _capture_sensor_frame(self, sensor_name: str) -> PreparedImage:
        stream = self._ensure_stream(sensor_name)
        frame = stream.read_frame()
        if sensor_name == "color":
            image = decode_color_frame(frame)
        elif sensor_name == "depth":
            image = decode_depth_frame(frame)
        else:
            image = decode_ir_frame(frame, self._openni2)

        return PreparedImage(
            data_url=image_to_data_url(image),
            width=image.width,
            height=image.height,
        )

    def _ensure_stream(self, sensor_name: str) -> Any:
        assert self._device is not None
        assert self._openni2 is not None

        if sensor_name in self._streams:
            return self._streams[sensor_name]

        stream_factory = {
            "color": self._device.create_color_stream,
            "depth": self._device.create_depth_stream,
            "ir": self._device.create_ir_stream,
        }[sensor_name]
        stream = stream_factory()
        if stream is None:
            raise RuntimeError(f"{sensor_name} stream is not available on this device.")

        preferred_mode = choose_video_mode(
            sensor_info=stream.get_sensor_info(),
            sensor_name=sensor_name,
            openni2=self._openni2,
            preferred_width=self._settings.openni_preferred_width,
            preferred_height=self._settings.openni_preferred_height,
            preferred_fps=self._settings.openni_preferred_fps,
        )
        if preferred_mode is not None:
            try:
                stream.set_video_mode(preferred_mode)
            except Exception:
                pass

        try:
            stream.set_mirroring_enabled(False)
        except Exception:
            pass

        stream.start()
        self._streams[sensor_name] = stream
        return stream

    def _close_locked(self) -> None:
        for stream in self._streams.values():
            try:
                stream.close()
            except Exception:
                pass
        self._streams.clear()

        if self._device is not None:
            try:
                self._device.close()
            except Exception:
                pass
            self._device = None

        if self._openni2 is not None and self._openni2.is_initialized():
            try:
                self._openni2.unload()
            except Exception:
                pass


@lru_cache(maxsize=1)
def get_openni_camera_service(settings: Settings) -> OpenNICameraService:
    return OpenNICameraService(settings)


def candidate_dll_directories(settings: Settings) -> list[Path]:
    candidates: list[Path] = []
    if settings.openni2_redist_path:
        candidates.append(settings.openni2_redist_path)

    defaults = [
        Path(r"C:\Program Files\OpenNI2\Redist"),
        Path(r"C:\Program Files (x86)\OpenNI2\Redist"),
        Path(r"C:\Program Files\Orbbec\OpenNI2\Redist"),
        Path(r"C:\Program Files\Orbbec\Astra SDK\OpenNI2\Redist"),
    ]
    candidates.extend(defaults)

    existing: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        resolved = candidate.resolve(strict=False)
        key = str(resolved).lower()
        if key in seen:
            continue
        seen.add(key)
        if (resolved / "OpenNI2.dll").exists():
            existing.append(resolved)
    return existing


def choose_video_mode(
    *,
    sensor_info: Any,
    sensor_name: str,
    openni2: Any,
    preferred_width: int,
    preferred_height: int,
    preferred_fps: int,
) -> Any | None:
    if sensor_info is None or not getattr(sensor_info, "videoModes", None):
        return None

    preferred_formats = {
        "color": [openni2.PIXEL_FORMAT_RGB888, openni2.PIXEL_FORMAT_YUYV, openni2.PIXEL_FORMAT_JPEG],
        "depth": [openni2.PIXEL_FORMAT_DEPTH_1_MM, openni2.PIXEL_FORMAT_DEPTH_100_UM],
        "ir": [openni2.PIXEL_FORMAT_GRAY8, openni2.PIXEL_FORMAT_GRAY16],
    }[sensor_name]

    ranked_modes = sorted(
        sensor_info.videoModes,
        key=lambda mode: (
            0 if mode.pixelFormat in preferred_formats else 1,
            preferred_formats.index(mode.pixelFormat) if mode.pixelFormat in preferred_formats else 99,
            abs(mode.resolutionX - preferred_width) + abs(mode.resolutionY - preferred_height),
            abs(mode.fps - preferred_fps),
        ),
    )
    return ranked_modes[0] if ranked_modes else None


def decode_color_frame(frame: Any):
    from PIL import Image

    raw_bytes = bytes(frame.get_buffer_as_uint8())
    return Image.frombytes("RGB", (frame.width, frame.height), raw_bytes)


def decode_depth_frame(frame: Any):
    from PIL import Image

    depth_values = list(frame.get_buffer_as_uint16())
    normalized = normalize_uint16_buffer(depth_values)
    return Image.frombytes("L", (frame.width, frame.height), bytes(normalized))


def decode_ir_frame(frame: Any, openni2: Any):
    from PIL import Image

    pixel_format = frame.videoMode.pixelFormat
    if pixel_format == openni2.PIXEL_FORMAT_GRAY8:
        return Image.frombytes("L", (frame.width, frame.height), bytes(frame.get_buffer_as_uint8()))

    ir_values = list(frame.get_buffer_as_uint16())
    normalized = normalize_uint16_buffer(ir_values)
    return Image.frombytes("L", (frame.width, frame.height), bytes(normalized))


def normalize_uint16_buffer(values: list[int]) -> bytearray:
    non_zero = [value for value in values if value > 0]
    if not non_zero:
        return bytearray(len(values))

    minimum = min(non_zero)
    maximum = max(non_zero)
    span = max(1, maximum - minimum)

    normalized = bytearray(len(values))
    for index, value in enumerate(values):
        if value <= 0:
            normalized[index] = 0
            continue
        normalized[index] = int((value - minimum) * 255 / span)
    return normalized


def image_to_data_url(image: Any) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def decode_if_bytes(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    return str(value)
