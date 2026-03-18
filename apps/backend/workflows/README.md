# ComfyUI workflow setup

Use an API-format workflow JSON exported from ComfyUI for `COMFYUI_WORKFLOW_PATH`.

The backend uploads:

- the analyzed model image
- the processed garment image

and replaces placeholders inside the JSON before submitting `/prompt`.

Supported placeholders:

- `{{MODEL_IMAGE}}`
- `{{MODEL_SUBFOLDER}}`
- `{{MODEL_IMAGE_TYPE}}`
- `{{GARMENT_IMAGE}}`
- `{{GARMENT_SUBFOLDER}}`
- `{{GARMENT_IMAGE_TYPE}}`
- `{{FRAME_WIDTH}}`
- `{{FRAME_HEIGHT}}`
- `{{OVERLAY_X}}`
- `{{OVERLAY_Y}}`
- `{{OVERLAY_WIDTH}}`
- `{{OVERLAY_HEIGHT}}`
- `{{OVERLAY_ROTATION_DEG}}`
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

Practical recommendation:

1. Build and test the VTON workflow directly in ComfyUI first.
2. Export the API JSON.
3. Replace hard-coded file names or scalar values with the placeholders above.
4. Point `COMFYUI_WORKFLOW_PATH` at that JSON file.

If your workflow has multiple output images, set `COMFYUI_OUTPUT_NODE_ID` to the node id of the final `SaveImage` output.
