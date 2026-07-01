"""
Modal serverless GPU worker — AI image-to-video + lip-sync (self-hosted models).

This code runs on **Modal's cloud GPUs**, not on the user's PC and not in the
Cloud Claude sandbox. It is deployed and invoked from a machine that has the
`modal` CLI and a Modal account (`pip install modal && modal setup`).

────────────────────────────────────────────────────────────────────────────
LAYER 1 — CONFIRMED WORKING (2026-07-01, Tesla T4, torch 2.12.1+cu130):

    modal run backend/services/modal_video_worker.py

Proved Modal + GPU work on this account. Kept below as `gpu_check` /
`check_gpu` — cheap to re-run any time as a smoke test.

LAYER 2 (this update) — image-to-video with LTX-Video:

    modal run backend/services/modal_video_worker.py::test_image_to_video \\
        --image-path path/to/a/storyboard/frame.png \\
        --prompt "a dancer moving to the beat, subtle camera push in"

  Turns ONE still into ONE short .mp4 (a few seconds), saved locally as
  layer2_test_output.mp4 — watch it before we wire this into the pipeline.

  Heavier than Layer 1: first run downloads/caches the LTX-Video weights
  (several GB) — can take 5-15 minutes. Model weights are cached in a Modal
  Volume, so subsequent runs are much faster (just generation time, ~1-3 min).
  GPU: A10G (24GB). If you hit an out-of-memory error, tell Cloud Claude —
  the fix is bumping to gpu="A100", not a code rewrite.

LAYER 3 (next): lip-sync (Wav2Lip/LivePortrait) → `apply_lipsync_remote`
LAYER 4 (next): wire into the orchestrator (run_video_generation) + assembly

We build one layer at a time and verify each on your machine before the next,
so we never stack unverified GPU code.
────────────────────────────────────────────────────────────────────────────
"""
import modal

app = modal.App("htxpunk-video-worker")

# Persists downloaded model weights across runs/containers so we don't
# re-download several GB every single invocation.
model_cache = modal.Volume.from_name("htxpunk-model-cache", create_if_missing=True)

# ── Layer 1 image: bare torch, just enough to prove GPU access ────────────
gpu_check_image = modal.Image.debian_slim(python_version="3.11").pip_install("torch")


@app.function(gpu="T4", image=gpu_check_image, timeout=300)
def gpu_check() -> dict:
    """Confirm a CUDA GPU is visible inside the Modal container."""
    import torch
    ok = torch.cuda.is_available()
    return {
        "cuda_available": ok,
        "device": torch.cuda.get_device_name(0) if ok else "none",
        "torch_version": torch.__version__,
    }


@app.local_entrypoint()
def main():
    """`modal run backend/services/modal_video_worker.py` → Layer 1 GPU check."""
    print("Deploying htxpunk-video-worker and running gpu_check on a Modal GPU…")
    result = gpu_check.remote()
    print("RESULT:", result)
    if result.get("cuda_available"):
        print("✅ Modal + GPU working.")
    else:
        print("❌ GPU not visible in the container — check the gpu= arg / Modal plan.")


# ── Layer 2 image: diffusers + LTX-Video for image-to-video ───────────────
video_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch",
        "diffusers>=0.30.0",
        "transformers",
        "accelerate",
        "sentencepiece",
        "imageio",
        "imageio-ffmpeg",
        "Pillow",
    )
)

# LTX-Video wants width/height as multiples of 32. Cap the long edge so a
# single A10G (24GB) can hold the model + activations comfortably.
_MAX_EDGE = 768


def _fit_dims(width: int, height: int) -> tuple[int, int]:
    scale = min(1.0, _MAX_EDGE / max(width, height))
    w, h = int(width * scale), int(height * scale)
    w = max(32, (w // 32) * 32)
    h = max(32, (h // 32) * 32)
    return w, h


@app.function(
    gpu="A10G",
    image=video_image,
    volumes={"/cache": model_cache},
    timeout=900,
)
def generate_video_clip_remote(
    image_bytes: bytes,
    prompt: str,
    num_frames: int = 65,
    fps: int = 24,
) -> bytes:
    """Image-to-video: one still + a text prompt -> one short .mp4 (bytes).

    num_frames=65 @ fps=24 is ~2.7s — enough to prove real motion without
    burning GPU minutes on the first test.
    """
    import io
    import os

    os.environ["HF_HOME"] = "/cache/huggingface"

    import torch
    from diffusers import LTXImageToVideoPipeline
    from diffusers.utils import export_to_video
    from PIL import Image

    pipe = LTXImageToVideoPipeline.from_pretrained(
        "Lightricks/LTX-Video", torch_dtype=torch.bfloat16
    )
    pipe.to("cuda")

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    width, height = _fit_dims(*image.size)
    image = image.resize((width, height))

    frames = pipe(
        image=image,
        prompt=prompt,
        width=width,
        height=height,
        num_frames=num_frames,
        num_inference_steps=30,
    ).frames[0]

    out_path = "/tmp/output.mp4"
    export_to_video(frames, out_path, fps=fps)
    model_cache.commit()  # persist the cached weights for next time

    with open(out_path, "rb") as f:
        return f.read()


@app.local_entrypoint()
def test_image_to_video(image_path: str, prompt: str = "cinematic motion, subtle camera movement", num_frames: int = 65):
    """Layer 2 test: turn ONE existing still into ONE short video clip.

    Usage:
        modal run backend/services/modal_video_worker.py::test_image_to_video \\
            --image-path path/to/frame.png --prompt "a dancer moving to the beat"
    """
    with open(image_path, "rb") as f:
        image_bytes = f.read()

    print(f"Sending {image_path} to Modal for image-to-video generation…")
    print("First run downloads/caches LTX-Video weights (several GB) — "
          "this can take 5-15 minutes. Later runs are much faster.")
    video_bytes = generate_video_clip_remote.remote(image_bytes, prompt, num_frames)

    out_path = "layer2_test_output.mp4"
    with open(out_path, "wb") as f:
        f.write(video_bytes)
    print(f"✅ Wrote {out_path} ({len(video_bytes)} bytes) — open it and watch the motion.")
