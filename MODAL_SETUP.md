# Modal Video Engine — Setup & Layered Build

We're adding **AI image-to-video + lip-sync** via [Modal](https://modal.com)
serverless GPUs (`VIDEO_BACKEND=modal`). Cloud Claude can't reach Modal, so this
is deployed and verified on a machine with the `modal` CLI (Local Claude / owner).

We build in **layers**, verifying each on a real machine before the next — so we
never stack unverified GPU code.

## One-time setup

```bash
pip install modal
modal setup             # opens a browser; authorizes this machine (writes ~/.modal.toml)
                         # (older Modal versions call this `modal token new` — same thing)
```

Modal's free tier includes monthly compute credits — plenty for iterating on clips.

## Layer 1 — prove Modal + GPU work ✅ CONFIRMED

```bash
modal run backend/services/modal_video_worker.py
```

Confirmed 2026-07-01 on the owner's account: `{'cuda_available': True, 'device': 'Tesla T4', 'torch_version': '2.12.1+cu130'}`.
Safe to re-run any time as a smoke test — a few seconds of GPU time.

## Layer 2 — image-to-video (LTX-Video) — do this next

```bash
modal run backend/services/modal_video_worker.py::test_image_to_video \
    --image-path backend/storage/<project-id>/shots/shot_1.png \
    --prompt "a dancer moving to the beat, subtle camera push in"
```

Use any real generated frame — e.g. one of the shots from a `make_wow_oh_images.py`
run (`backend/storage/<project-id>/shots/shot_N.png`).

**Heavier than Layer 1** — first run downloads/caches the LTX-Video model weights
(several GB), so budget **5-15 minutes** for that run only. Weights are cached in
a Modal Volume, so every run after that is much faster (just generation time,
roughly 1-3 min). GPU: A10G (24GB).

Expected output:
```
Sending ... to Modal for image-to-video generation…
First run downloads/caches LTX-Video weights (several GB) — this can take 5-15 minutes.
✅ Wrote layer2_test_output.mp4 (... bytes) — open it and watch the motion.
```

- ✅ Open `layer2_test_output.mp4` — does it show real motion (not a static image)?
- ❌ Out-of-memory error → tell Cloud Claude; the fix is bumping `gpu="A100"`, not a rewrite.
- ❌ Any other error → paste it back verbatim.

**Report the result (and whether the clip looks right) as a `RESULT:` comment on PR #6.**

## The layered plan

| Layer | What | Verify by | Status |
|-------|------|-----------|--------|
| 1 | Modal + GPU sanity (`gpu_check`) | `modal run …` prints `cuda_available: True` | ✅ Confirmed |
| 2 | Image-to-video (`generate_video_clip_remote`, LTX-Video) | one still → one short motion clip | ⬜ Awaiting `RESULT:` |
| 3 | Lip-sync (`apply_lipsync_remote`, Wav2Lip/LivePortrait) | one talking face → mouth matches a vocal clip | ⬜ Blocked on Layer 2 |
| 4 | Pipeline wiring (`run_video_generation` in the orchestrator) + audio slicing + assembly | full WOW OH! render with lip-sync | ⬜ Blocked on Layer 3 |

Each layer is a separate push + a separate `RESULT:` check. No layer starts until
the previous one is confirmed working on a real machine.

## Config (already added)

`.env` (see `.env.example`):
```
VIDEO_BACKEND=modal        # ffmpeg (stills) | modal (AI video + lip-sync)
LIPSYNC_ENABLED=true
MODAL_TOKEN_ID=            # from `modal token new` (or leave blank; modal reads ~/.modal.toml)
MODAL_TOKEN_SECRET=
```

Tokens are gitignored via `.env` and must never be committed.
