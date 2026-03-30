# Local development

## Backend

1. Create and activate a Python virtual environment.
2. Install dependencies:

   ```bash
   pip install -r apps/backend/requirements.txt
   ```

3. Optional pose dependency:

   ```bash
   pip install -r apps/backend/requirements-ml.txt
   ```

4. Start the API server:

   ```bash
   cd apps/backend
   python -m uvicorn app.main:app --reload
   ```

5. Open the API docs at <http://127.0.0.1:8000/docs>.

## Frontend

```bash
cd apps/frontend
npm install
npm run dev
```

The browser UI now focuses on this MVP flow:

1. Confirm the active camera and device label.
2. Select or upload a 2D garment photo.
3. Use the capture button to grab the current camera frame.
4. Run AI synthesis through the configured VTON backend such as IDM-VTON or ComfyUI.
5. Save the generated image.

## Orbbec Astra / OpenNI camera

Official Astra series references point to the OpenNI path for this camera family.

Recommended setup order:

1. Install the Orbbec ASTRA Windows driver.
2. Install the OpenNI SDK runtime so `OpenNI2.dll` is available.
3. Install the Python wrapper:

   ```bash
   pip install -r apps/backend/requirements-camera.txt
   ```

4. Set the OpenNI runtime directory if it is not in the default location:

   ```bash
   set OPENNI2_REDIST64=C:\path\to\OpenNI2\Redist
   ```

5. Start the backend and open:

   - `GET /api/camera/openni/status`
   - `GET /api/camera/openni/preview`

The frontend now polls those routes and shows backend sensor previews for:

- RGB
- Depth
- IR

Current state on this machine:

- `C:\Program Files\Orbbec\ASTRA` exists, so the ASTRA driver package is present.
- No `OpenNI2.dll` runtime folder was found yet.
- No `openni` Python package was installed yet.
- No connected USB device with Orbbec vendor id `VID_2BC5` was detected.

## Garment assets

`assets/clothes` is treated as a source folder for built-in 2D garment photos.
Supported raster formats are:

- `.png`
- `.jpg`
- `.jpeg`
- `.webp`
- `.avif`

When the frontend requests `/api/garments`, the backend now syncs those raster files into the runtime garment asset store automatically.

Notes:

- SVG samples remain fine for design references, but they are not used as built-in try-on assets.
- Uploaded garment photos go through the same background-removal and rigging placeholder flow.

## Pose and VTON providers

The backend supports two provider layers:

- `POSE_PROVIDER=mock|mediapipe`
- `VTON_PROVIDER=mock|catvton|comfyui|idm-vton`

Default development mode:

```bash
set POSE_PROVIDER=mock
set VTON_PROVIDER=mock
```

To enable MediaPipe pose detection:

```bash
set POSE_PROVIDER=mediapipe
pip install -r apps/backend/requirements-ml.txt
```

`VTON_PROVIDER=catvton` remains an integration hook for a future external inference service.

## IDM-VTON configuration

This project can call either a local or external IDM-VTON HTTP endpoint after the frontend captures the current camera frame.
The backend sends:

- the captured human image
- the selected garment image
- a generated upper-body mask
- a generated pose guidance image
- a garment description derived from the selected garment name

Reference implementation:

- <https://github.com/yisol/IDM-VTON>

Fastest external setup:

```bash
set VTON_PROVIDER=idm-vton
set IDM_VTON_ENDPOINT_URL=https://your-idm-vton-server.example.com/tryon
set IDM_VTON_TIMEOUT_SECONDS=300
```

If the external server requires auth:

```bash
set IDM_VTON_AUTH_TOKEN=your-bearer-token
```

or:

```bash
set IDM_VTON_API_KEY=your-api-key
set IDM_VTON_API_KEY_HEADER=x-api-key
```

If you prefer separate base URL and path:

```bash
set IDM_VTON_BASE_URL=https://your-idm-vton-server.example.com
set IDM_VTON_API_NAME=/tryon
```

Optional IDM-VTON settings:

```bash
set IDM_VTON_AUTO_MASK=true
set IDM_VTON_AUTO_CROP=false
set IDM_VTON_DENOISE_STEPS=30
set IDM_VTON_SEED=42
```

Notes:

- `IDM_VTON_ENDPOINT_URL` takes priority over `IDM_VTON_BASE_URL` + `IDM_VTON_API_NAME`.
- The configured endpoint is now shown by `/api/system/providers` and in the frontend status panel.
- Auto-masking is enabled by default so the captured camera frame can go straight into IDM-VTON without manual mask painting.
- The upstream repository is licensed under CC BY-NC-SA 4.0. Check that license before production or commercial use.

## ComfyUI configuration

To enable ComfyUI as the try-on backend:

```bash
set VTON_PROVIDER=comfyui
set COMFYUI_BASE_URL=http://127.0.0.1:8188
set COMFYUI_WORKFLOW_PATH=D:\path\to\your\comfyui_tryon_api.json
```

Optional settings:

```bash
set COMFYUI_TIMEOUT_SECONDS=180
set COMFYUI_POLL_INTERVAL_MS=1500
set COMFYUI_OUTPUT_NODE_ID=42
```

The provider status endpoint now reports:

- whether the ComfyUI server is reachable
- whether the workflow file exists
- whether the workflow still contains the starter template placeholder

The starter scaffold at `apps/backend/workflows/comfyui_vton_api.template.json` is not runnable as-is.
Replace the placeholder VTON node and input mappings before using it.

## Local ComfyUI diagnosis from this machine

The local portable install was found at `D:\ComfyUI_windows_portable`.

Observed behavior on this machine:

- `run_nvidia_gpu.bat` path uses the portable CUDA build.
- `torch 2.10.0+cu130` is installed in that bundle.
- `torch.cuda.is_available()` returned `False`.
- Starting ComfyUI in GPU mode crashed with a Windows access violation while entering `torch.cuda.current_device()`.
- Starting ComfyUI in CPU mode successfully opened port `8188`.

Practical implication:

- The current failure is a GPU startup problem, not a missing ComfyUI installation.
- CPU mode is a working fallback for local integration and API checks.
- GPU mode likely needs a driver/runtime combination that matches the portable CUDA build more closely.

Models are still required even when the server starts. The portable install currently has no checkpoint files in `ComfyUI\models\checkpoints`.

## Recommended next steps

1. Use CPU mode first to validate backend-to-ComfyUI wiring.
2. Add the actual checkpoint and custom nodes your workflow needs.
3. Replace the starter workflow JSON with an API export from your real ComfyUI graph.
4. After that, revisit GPU startup separately.
