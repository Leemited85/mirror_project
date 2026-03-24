# 3D Asset Schema

This project stores 3D garment conversion data in two layers:

1. `conversion job`
2. `3d asset`

## Conversion Job

Tracks a single conversion request from source files to a staged or converted asset.

- `id`
- `asset_id`
- `name`
- `category`
- `target_format`
- `status`
- `source_files[]`
- `output_asset`
- `conversion_engine`
- `warnings[]`
- `created_at`
- `updated_at`

## 3D Asset

Represents the reusable garment asset used by the preview layer.

- `id`
- `name`
- `category`
- `status`
- `source_files[]`
- `glb_url`
- `preview_image_url`
- `rig`
- `mesh_stats`
- `conversion_engine`
- `warnings[]`
- `created_at`
- `updated_at`

## Storage Layout

`apps/backend/data/3d-assets/<asset_id>/`

- `meta.json`
- `sources/<original files>`

`apps/backend/data/3d-conversion-jobs/<job_id>/`

- `meta.json`

## Current MVP Behavior

- Source files are persisted immediately.
- If a `.glb` file is already included in the request, it is exposed as `glb_url`.
- If only `.obj`, `.ma`, or other non-GLB sources are uploaded, the asset is stored as `staged`.
- Template rig metadata is generated for upper-body garments so the frontend can already bind to a predictable skeleton shape later.
