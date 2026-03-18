# Local development

## Backend

1. Create a Python virtual environment.
2. Install dependencies:

   ```bash
   pip install -r apps/backend/requirements.txt
   ```

   Optional pose-model dependency:

   ```bash
   pip install -r apps/backend/requirements-ml.txt
   ```

3. Start the API server:

   ```bash
   cd apps/backend
   python -m uvicorn app.main:app --reload
   ```

4. Open the API docs at <http://127.0.0.1:8000/docs>.

## Pose and VTON providers

The backend now supports two provider layers:

- `POSE_PROVIDER=mock|mediapipe`
- `VTON_PROVIDER=mock|catvton|comfyui`

Default development mode uses:

```bash
POSE_PROVIDER=mock
VTON_PROVIDER=mock
```

This keeps the project runnable without external models.

To enable MediaPipe pose detection:

```bash
set POSE_PROVIDER=mediapipe
pip install -r apps/backend/requirements-ml.txt
```

`VTON_PROVIDER=catvton` is scaffolded for a remote inference service. Set:

```bash
set CATVTON_ENDPOINT=http://your-inference-service
set VTON_PROVIDER=catvton
```

The current CatVTON provider is an integration hook, not a finished remote client.

To enable ComfyUI as the try-on backend:

```bash
set VTON_PROVIDER=comfyui
set COMFYUI_BASE_URL=http://127.0.0.1:8188
set COMFYUI_WORKFLOW_PATH=D:\path\to\your\comfyui_tryon_api.json
```

The workflow JSON must be an API-format export from ComfyUI. The backend replaces these placeholders before queueing the prompt:

- `{{MODEL_IMAGE}}`
- `{{GARMENT_IMAGE}}`
- `{{FRAME_WIDTH}}`
- `{{FRAME_HEIGHT}}`
- `{{OVERLAY_X}}`
- `{{OVERLAY_Y}}`
- `{{OVERLAY_WIDTH}}`
- `{{OVERLAY_HEIGHT}}`
- `{{LANDMARK_NECK_X}}`
- `{{LANDMARK_NECK_Y}}`
- `{{LANDMARK_LEFT_SHOULDER_X}}`
- `{{LANDMARK_LEFT_SHOULDER_Y}}`
- `{{LANDMARK_RIGHT_SHOULDER_X}}`
- `{{LANDMARK_RIGHT_SHOULDER_Y}}`
- `{{LANDMARK_LEFT_HIP_X}}`
- `{{LANDMARK_LEFT_HIP_Y}}`
- `{{LANDMARK_RIGHT_HIP_X}}`
- `{{LANDMARK_RIGHT_HIP_Y}}`

Optional settings:

```bash
set COMFYUI_TIMEOUT_SECONDS=180
set COMFYUI_POLL_INTERVAL_MS=1500
set COMFYUI_OUTPUT_NODE_ID=42
```

`COMFYUI_OUTPUT_NODE_ID` lets you pin the exact output node that writes the final result image.

## Placeholder garment assets

Put garment images in `assets/clothes` using the file name format:

- `shirt_blue.png`
- `jacket_black.png`

The backend uses the file name stem as the garment ID.
