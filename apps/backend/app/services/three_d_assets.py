from __future__ import annotations

from app.models.schemas import (
    NormalizedPoint,
    ThreeDConversionJobRequest,
    ThreeDMeshStats,
    ThreeDRigBone,
    ThreeDRigMetadata,
)


def build_default_3d_rig(category: str, strategy: str) -> ThreeDRigMetadata | None:
    if strategy == "none":
        return None

    torso_root = 0.5 if category == "top" else 0.56
    return ThreeDRigMetadata(
        rig_type="template-upper-body",
        skinning_status="template-skinned",
        bones=[
            ThreeDRigBone(name="root", role="root", bind_point=NormalizedPoint(x=0.5, y=0.92)),
            ThreeDRigBone(name="spine_01", parent="root", role="spine", bind_point=NormalizedPoint(x=0.5, y=0.72)),
            ThreeDRigBone(name="spine_02", parent="spine_01", role="spine", bind_point=NormalizedPoint(x=0.5, y=torso_root)),
            ThreeDRigBone(name="neck", parent="spine_02", role="neck", bind_point=NormalizedPoint(x=0.5, y=0.22)),
            ThreeDRigBone(name="shoulder_l", parent="spine_02", role="shoulder", bind_point=NormalizedPoint(x=0.33, y=0.28)),
            ThreeDRigBone(name="upperarm_l", parent="shoulder_l", role="upper_arm", bind_point=NormalizedPoint(x=0.2, y=0.42)),
            ThreeDRigBone(name="lowerarm_l", parent="upperarm_l", role="lower_arm", bind_point=NormalizedPoint(x=0.12, y=0.62)),
            ThreeDRigBone(name="shoulder_r", parent="spine_02", role="shoulder", bind_point=NormalizedPoint(x=0.67, y=0.28)),
            ThreeDRigBone(name="upperarm_r", parent="shoulder_r", role="upper_arm", bind_point=NormalizedPoint(x=0.8, y=0.42)),
            ThreeDRigBone(name="lowerarm_r", parent="upperarm_r", role="lower_arm", bind_point=NormalizedPoint(x=0.88, y=0.62)),
        ],
    )


def build_mesh_stats(files: list[tuple[str, bytes]]) -> ThreeDMeshStats:
    vertex_count = 0
    face_count = 0
    source_mesh_count = 0

    for file_format, payload in files:
        if file_format != "obj":
            continue

        source_mesh_count += 1
        for raw_line in payload.decode("utf-8", errors="ignore").splitlines():
            line = raw_line.strip()
            if line.startswith("v "):
                vertex_count += 1
            elif line.startswith("f "):
                tokens = line[2:].split()
                if len(tokens) >= 3:
                    face_count += len(tokens) - 2

    return ThreeDMeshStats(
        vertex_count=vertex_count,
        face_count=face_count,
        source_mesh_count=source_mesh_count,
    )


def select_glb_artifact(request: ThreeDConversionJobRequest) -> tuple[str | None, list[str]]:
    warnings: list[str] = []
    glb_source = next((item for item in request.source_files if item.file_format == "glb"), None)
    if glb_source:
        return f"sources/{glb_source.filename}", warnings

    warnings.append(
        "GLB conversion is scaffolded only. Source files were stored, but no binary GLB was generated in this MVP."
    )
    return None, warnings
