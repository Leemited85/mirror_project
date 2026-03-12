from __future__ import annotations

from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Virtual Fitting Mirror API", version="0.1.0")

REPO_ROOT = Path(__file__).resolve().parents[2]
CLOTHES_DIR = REPO_ROOT / "assets" / "clothes"
CAPTURES_DIR = REPO_ROOT / "captures"


class Garment(BaseModel):
    id: str
    name: str
    asset_path: str


class TryOnRequest(BaseModel):
    garment_id: str = Field(..., description="ID of the selected garment")


class TryOnResponse(BaseModel):
    status: str
    garment_id: str
    message: str


class CaptureResponse(BaseModel):
    file_path: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/garments", response_model=List[Garment])
def list_garments() -> List[Garment]:
    if not CLOTHES_DIR.exists():
        return []

    garments: List[Garment] = []
    for file_path in sorted(CLOTHES_DIR.iterdir()):
        if file_path.is_file():
            garments.append(
                Garment(
                    id=file_path.stem,
                    name=file_path.stem.replace("_", " ").title(),
                    asset_path=f"assets/clothes/{file_path.name}",
                )
            )
    return garments


@app.post("/api/v1/try-on", response_model=TryOnResponse)
def try_on(request: TryOnRequest) -> TryOnResponse:
    garment_asset = CLOTHES_DIR / f"{request.garment_id}.png"
    if not garment_asset.exists():
        raise HTTPException(status_code=404, detail="Garment not found")

    # Placeholder behavior; replace with real segmentation/pose/VTON pipeline later.
    return TryOnResponse(
        status="preview-ready",
        garment_id=request.garment_id,
        message="Mock overlay generated. Replace with model inference in a later iteration.",
    )


@app.post("/api/v1/capture", response_model=CaptureResponse)
def capture_frame(request: TryOnRequest) -> CaptureResponse:
    if not (CLOTHES_DIR / f"{request.garment_id}.png").exists():
        raise HTTPException(status_code=404, detail="Garment not found")

    CAPTURES_DIR.mkdir(parents=True, exist_ok=True)
    output = CAPTURES_DIR / f"capture_{request.garment_id}.txt"
    output.write_text(
        "Placeholder capture metadata. Replace with real image capture output.\n",
        encoding="utf-8",
    )
    return CaptureResponse(file_path=str(output.relative_to(REPO_ROOT)))
