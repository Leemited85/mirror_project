# ComfyUI virtual try-on workflow notes

This repository keeps the integration surface simple, but the intended high-quality workflow is designed around ComfyUI.

## Recommended building blocks

### CatVTON or FLUX-based try-on

Use a CatVTON-style or FLUX-based workflow as the main garment transfer stage when you need the clothing shape and silhouette to stay close to the source garment photo.

### IP-Adapter

Use IP-Adapter when the garment reference image needs to strongly influence the generated clothing appearance.

Typical role:

- keep color and material cues close to the source garment
- guide style transfer from the selected garment photo

### ControlNet Depth

Use depth guidance to preserve the subject's body volume and make the garment sit more naturally on the captured person image.

Typical role:

- preserve torso volume
- reduce flat pasted-on results
- improve drape alignment across shoulder and chest areas

### SAM2 or segmentation node

Use SAM2 or another segmentation step to define the garment replacement region precisely before inpainting or try-on.

Typical role:

- isolate the person
- define clothing mask areas
- reduce background bleed and unwanted edits

## Suggested ComfyUI flow

1. Load the captured person image from the frontend.
2. Load the selected garment image.
3. Generate or refine the clothing mask with SAM2 or segmentation nodes.
4. Produce body structure guidance with depth preprocessing for ControlNet.
5. Feed the person image, garment image, and mask into the CatVTON or FLUX-based try-on stage.
6. Use IP-Adapter if the garment reference needs stronger appearance locking.
7. Run inpainting or refinement on the masked region.
8. Save the final image with a dedicated `SaveImage` output node.

## Backend placeholder mapping

The backend already injects these runtime values into the ComfyUI API JSON:

- person image filename
- garment image filename
- frame width and height
- overlay box values
- shoulder, neck, and hip landmarks

That means the backend is ready to drive a real ComfyUI graph once the exported workflow JSON is swapped in.

## What is still placeholder in this repo

- CatVTON provider is only a scaffold.
- ComfyUI workflow template is only a starter shell.
- The frontend live preview uses pose-guided 2D overlay, not a full diffusion model.
- Segmentation, depth guidance, and garment transfer quality depend entirely on the real ComfyUI graph you install.

## Practical guidance

- Build the graph directly in ComfyUI first.
- Verify it works with static images.
- Export the API JSON.
- Point `COMFYUI_WORKFLOW_PATH` at that export.
- Set `COMFYUI_OUTPUT_NODE_ID` if the graph writes multiple images.
