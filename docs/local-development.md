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
   uvicorn apps.backend.main:app --reload
   ```

4. Open the API docs at <http://127.0.0.1:8000/docs>.

## Pose and VTON providers

The backend now supports two provider layers:

- `POSE_PROVIDER=mock|mediapipe`
- `VTON_PROVIDER=mock|catvton`

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

## Placeholder garment assets

Put garment images in `assets/clothes` using the file name format:

- `shirt_blue.png`
- `jacket_black.png`

The backend uses the file name stem as the garment ID.
