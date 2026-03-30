from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib import error, request

from app.core.settings import Settings

STARTER_TEMPLATE_MARKER = "REPLACE_WITH_VTON_NODE_CLASS"


def inspect_comfyui(settings: Settings) -> dict[str, Any]:
    base_url = (settings.comfyui_base_url or "").rstrip("/")
    workflow_path = settings.comfyui_workflow_path
    workflow_exists = bool(workflow_path and workflow_path.exists())
    workflow_is_template = is_template_workflow(workflow_path) if workflow_exists else None
    reachable = probe_server(base_url) if base_url else None
    ready = bool(reachable and workflow_exists and workflow_is_template is False)

    return {
        "comfyui_reachable": reachable,
        "comfyui_workflow_exists": workflow_exists if workflow_path else None,
        "comfyui_workflow_is_template": workflow_is_template,
        "comfyui_ready": ready if base_url or workflow_path else None,
        "comfyui_message": build_message(
            base_url=base_url,
            workflow_path=workflow_path,
            reachable=reachable,
            workflow_exists=workflow_exists,
            workflow_is_template=workflow_is_template,
        ),
    }


def probe_server(base_url: str) -> bool:
    try:
        with request.urlopen(f"{base_url}/system_stats", timeout=3) as response:
            return response.status == 200
    except error.URLError:
        return False
    except TimeoutError:
        return False


def is_template_workflow(workflow_path: Path | None) -> bool | None:
    if not workflow_path:
        return None

    try:
        payload = json.loads(workflow_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    return contains_template_marker(payload)


def contains_template_marker(value: Any) -> bool:
    if isinstance(value, dict):
        return any(contains_template_marker(child) for child in value.values())
    if isinstance(value, list):
        return any(contains_template_marker(item) for item in value)
    if isinstance(value, str):
        return STARTER_TEMPLATE_MARKER in value
    return False


def build_message(
    *,
    base_url: str,
    workflow_path: Path | None,
    reachable: bool | None,
    workflow_exists: bool,
    workflow_is_template: bool | None,
) -> str | None:
    if not base_url and not workflow_path:
        return "ComfyUI is not configured. Set COMFYUI_BASE_URL and COMFYUI_WORKFLOW_PATH."
    if not base_url:
        return "Set COMFYUI_BASE_URL so the backend can reach the ComfyUI server."
    if reachable is False:
        return f"ComfyUI server is not reachable at {base_url}."
    if not workflow_path:
        return "Set COMFYUI_WORKFLOW_PATH to an API JSON workflow exported from ComfyUI."
    if not workflow_exists:
        return f"ComfyUI workflow file was not found: {workflow_path}"
    if workflow_is_template:
        return "Workflow is still using the starter template. Replace the placeholder VTON node and input mappings."
    if reachable:
        return "ComfyUI server is reachable and the workflow file looks ready."
    return None
