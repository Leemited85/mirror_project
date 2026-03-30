from __future__ import annotations

import io
import os
import sys
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from PIL import Image


def read_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class IdmVtonRuntime:
    def __init__(self) -> None:
        self.repo_root = Path(os.getenv("IDM_VTON_REPO_ROOT", "D:/IDM-VTON")).resolve()
        self.model_id = os.getenv("IDM_VTON_MODEL_ID", "yisol/IDM-VTON")
        self.device = "cuda" if self._torch_cuda_available() else "cpu"
        self.dtype_name = "float16" if self.device == "cuda" else "float32"
        self.enable_cpu_offload = read_bool("IDM_VTON_ENABLE_CPU_OFFLOAD", default=True)
        self.target_width = int(os.getenv("IDM_VTON_TARGET_WIDTH", "576"))
        self.target_height = int(os.getenv("IDM_VTON_TARGET_HEIGHT", "768"))
        self.pipe: Any | None = None
        self.tensor_transform: Any | None = None
        self.lock = threading.Lock()

    def _torch_cuda_available(self) -> bool:
        try:
            import torch
        except Exception:
            return False
        return bool(torch.cuda.is_available())

    @property
    def status(self) -> dict[str, Any]:
        return {
            "repo_root": str(self.repo_root),
            "model_id": self.model_id,
            "device": self.device,
            "dtype": self.dtype_name,
            "enable_cpu_offload": self.enable_cpu_offload,
            "target_width": self.target_width,
            "target_height": self.target_height,
            "loaded": self.pipe is not None,
        }

    def ensure_loaded(self) -> None:
        if self.pipe is not None:
            return

        with self.lock:
            if self.pipe is not None:
                return

            if not self.repo_root.exists():
                raise RuntimeError(f"IDM_VTON_REPO_ROOT was not found: {self.repo_root}")

            repo_root_str = str(self.repo_root)
            if repo_root_str not in sys.path:
                sys.path.insert(0, repo_root_str)

            import torch
            from diffusers import AutoencoderKL, DDPMScheduler
            from torchvision import transforms
            from transformers import (
                AutoTokenizer,
                CLIPImageProcessor,
                CLIPTextModel,
                CLIPTextModelWithProjection,
                CLIPVisionModelWithProjection,
            )

            from src.tryon_pipeline import StableDiffusionXLInpaintPipeline as TryonPipeline
            from src.unet_hacked_garmnet import UNet2DConditionModel as UNet2DConditionModelRef
            from src.unet_hacked_tryon import UNet2DConditionModel

            dtype = torch.float16 if self.device == "cuda" else torch.float32

            unet = UNet2DConditionModel.from_pretrained(
                self.model_id,
                subfolder="unet",
                torch_dtype=dtype,
            )
            tokenizer_one = AutoTokenizer.from_pretrained(self.model_id, subfolder="tokenizer", use_fast=False)
            tokenizer_two = AutoTokenizer.from_pretrained(self.model_id, subfolder="tokenizer_2", use_fast=False)
            noise_scheduler = DDPMScheduler.from_pretrained(self.model_id, subfolder="scheduler")
            text_encoder_one = CLIPTextModel.from_pretrained(
                self.model_id,
                subfolder="text_encoder",
                torch_dtype=dtype,
            )
            text_encoder_two = CLIPTextModelWithProjection.from_pretrained(
                self.model_id,
                subfolder="text_encoder_2",
                torch_dtype=dtype,
            )
            image_encoder = CLIPVisionModelWithProjection.from_pretrained(
                self.model_id,
                subfolder="image_encoder",
                torch_dtype=dtype,
            )
            vae = AutoencoderKL.from_pretrained(
                self.model_id,
                subfolder="vae",
                torch_dtype=dtype,
            )
            unet_encoder = UNet2DConditionModelRef.from_pretrained(
                self.model_id,
                subfolder="unet_encoder",
                torch_dtype=dtype,
            )

            for module in (unet, image_encoder, vae, text_encoder_one, text_encoder_two, unet_encoder):
                module.requires_grad_(False)
                module.eval()

            pipe = TryonPipeline.from_pretrained(
                self.model_id,
                unet=unet,
                vae=vae,
                feature_extractor=CLIPImageProcessor(),
                text_encoder=text_encoder_one,
                text_encoder_2=text_encoder_two,
                tokenizer=tokenizer_one,
                tokenizer_2=tokenizer_two,
                scheduler=noise_scheduler,
                image_encoder=image_encoder,
                torch_dtype=dtype,
            )
            pipe.unet_encoder = unet_encoder
            pipe.set_progress_bar_config(disable=True)
            pipe.enable_attention_slicing()
            pipe.enable_vae_slicing()

            if self.device == "cuda":
                torch.backends.cuda.matmul.allow_tf32 = True
                if self.enable_cpu_offload:
                    pipe.enable_model_cpu_offload()
                    pipe.unet_encoder.to("cpu")
                else:
                    pipe.to(self.device)
                    pipe.unet_encoder.to(self.device)
            else:
                pipe.to(self.device)
                pipe.unet_encoder.to(self.device)

            self.pipe = pipe
            self.tensor_transform = transforms.Compose(
                [
                    transforms.ToTensor(),
                    transforms.Normalize([0.5], [0.5]),
                ]
            )

    def run(
        self,
        human_image: Image.Image,
        garment_image: Image.Image,
        mask_image: Image.Image,
        pose_image: Image.Image,
        garment_description: str,
        denoise_steps: int,
        seed: int,
        auto_crop: bool,
    ) -> bytes:
        self.ensure_loaded()
        assert self.pipe is not None
        assert self.tensor_transform is not None

        import torch

        width = self.target_width
        height = self.target_height

        human_rgb = human_image.convert("RGB")
        mask_l = mask_image.convert("L")
        pose_rgb = pose_image.convert("RGB")

        if auto_crop:
            crop_box = centered_crop_box(human_rgb.width, human_rgb.height, width / height)
            human_rgb = human_rgb.crop(crop_box)
            mask_l = mask_l.crop(crop_box)
            pose_rgb = pose_rgb.crop(crop_box)

        human_rgb = human_rgb.resize((width, height), Image.Resampling.LANCZOS)
        mask_l = mask_l.resize((width, height), Image.Resampling.LANCZOS)
        pose_rgb = pose_rgb.resize((width, height), Image.Resampling.LANCZOS)
        garment_rgb = garment_image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)

        dtype = torch.float16 if self.device == "cuda" else torch.float32
        prompt = f"model is wearing {garment_description}"
        cloth_prompt = f"a photo of {garment_description}"
        negative_prompt = "monochrome, lowres, bad anatomy, worst quality, low quality"

        if self.device == "cuda" and self.enable_cpu_offload:
            self.pipe.unet_encoder.to(self.device)

        try:
            with torch.inference_mode():
                with torch.autocast(device_type="cuda", dtype=torch.float16) if self.device == "cuda" else nullcontext():
                    (
                        prompt_embeds,
                        negative_prompt_embeds,
                        pooled_prompt_embeds,
                        negative_pooled_prompt_embeds,
                    ) = self.pipe.encode_prompt(
                        prompt,
                        num_images_per_prompt=1,
                        do_classifier_free_guidance=True,
                        negative_prompt=negative_prompt,
                    )

                    (
                        prompt_embeds_c,
                        _,
                        _,
                        _,
                    ) = self.pipe.encode_prompt(
                        cloth_prompt,
                        num_images_per_prompt=1,
                        do_classifier_free_guidance=False,
                        negative_prompt=negative_prompt,
                    )

                    pose_tensor = self.tensor_transform(pose_rgb).unsqueeze(0).to(self.device, dtype)
                    garment_tensor = self.tensor_transform(garment_rgb).unsqueeze(0).to(self.device, dtype)
                    generator = torch.Generator(self.device).manual_seed(seed)

                    images = self.pipe(
                        prompt_embeds=prompt_embeds.to(self.device, dtype),
                        negative_prompt_embeds=negative_prompt_embeds.to(self.device, dtype),
                        pooled_prompt_embeds=pooled_prompt_embeds.to(self.device, dtype),
                        negative_pooled_prompt_embeds=negative_pooled_prompt_embeds.to(self.device, dtype),
                        num_inference_steps=max(denoise_steps, 20),
                        generator=generator,
                        strength=1.0,
                        pose_img=pose_tensor,
                        text_embeds_cloth=prompt_embeds_c.to(self.device, dtype),
                        cloth=garment_tensor,
                        mask_image=mask_l,
                        image=human_rgb,
                        height=height,
                        width=width,
                        guidance_scale=2.0,
                        ip_adapter_image=garment_rgb,
                    )[0]
        finally:
            if self.device == "cuda" and self.enable_cpu_offload:
                self.pipe.unet_encoder.to("cpu")
                torch.cuda.empty_cache()

        if not images:
            raise RuntimeError("IDM-VTON pipeline returned no images.")

        output = io.BytesIO()
        images[0].save(output, format="PNG")
        return output.getvalue()


class nullcontext:
    def __enter__(self):
        return None

    def __exit__(self, exc_type, exc, tb):
        return False


runtime = IdmVtonRuntime()
app = FastAPI(title="Local IDM-VTON Server", version="0.1.0")


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse(
        {
            "status": "ok",
            **runtime.status,
        }
    )


@app.post("/tryon")
async def tryon(
    human_image: UploadFile = File(...),
    garment_image: UploadFile = File(...),
    mask_image: UploadFile = File(...),
    pose_image: UploadFile = File(...),
    garment_description: str = Form("upper body garment"),
    denoise_steps: int = Form(30),
    seed: int = Form(42),
    auto_crop: bool = Form(False),
) -> Response:
    try:
        human = Image.open(io.BytesIO(await human_image.read())).convert("RGB")
        garment = Image.open(io.BytesIO(await garment_image.read())).convert("RGB")
        mask = Image.open(io.BytesIO(await mask_image.read())).convert("L")
        pose = Image.open(io.BytesIO(await pose_image.read())).convert("RGB")
        image_bytes = runtime.run(
            human_image=human,
            garment_image=garment,
            mask_image=mask,
            pose_image=pose,
            garment_description=garment_description,
            denoise_steps=denoise_steps,
            seed=seed,
            auto_crop=auto_crop,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(content=image_bytes, media_type="image/png")


def centered_crop_box(width: int, height: int, target_ratio: float) -> tuple[int, int, int, int]:
    source_ratio = width / height
    if source_ratio > target_ratio:
        crop_width = int(height * target_ratio)
        left = max(0, int((width - crop_width) / 2))
        return left, 0, left + crop_width, height

    crop_height = int(width / target_ratio)
    top = max(0, int((height - crop_height) / 2))
    return 0, top, width, top + crop_height


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("IDM_VTON_HOST", "127.0.0.1"),
        port=int(os.getenv("IDM_VTON_PORT", "7860")),
        reload=False,
    )
