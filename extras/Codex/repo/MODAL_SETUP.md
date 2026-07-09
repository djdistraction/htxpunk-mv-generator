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

Use **`test_shot_clip`**, not a throwaway image — it pulls a real shot's exact
locked prompt (frozen when the still was approved) and real duration from an
already-seeded project, and registers the output as a real `video_clip` asset.
If it works, you're not left with a test file to discard — that shot is done.

```bash
modal run backend/services/modal_video_worker.py::test_shot_clip \
    --project-id <id>
```

`--project-id` is one printed by `make_wow_oh_images.py` (or any project with
generated storyboard stills). Omit `--shot-number` to auto-pick the first shot
that already has a generated still; pass `--shot-number 3` to target a specific
one.

**Heavier than Layer 1** — first run downloads/caches the LTX-Video model weights
(several GB), so budget **5-15 minutes** for that run only. Weights are cached in
a Modal Volume, so every run after that is much faster (just generation time,
roughly 1-3 min). GPU: A10G (24GB). Frame count is derived from the shot's real
duration (rounded to LTX's required 8k+1 frames), not a fixed test length.

Expected output:
```
Shot 1: "Mr_V. Mr. V slumped at a desk under a flickering fluorescent light. ..."
  source still : backend/storage/<id>/shots/shot_1.png
  target       : 6.0s -> 145 frames @ 24fps
First run downloads/caches LTX-Video weights (several GB) — this can take 5-15 minutes.
✅ Wrote real clip: backend/storage/<id>/clips/shot_1.mp4 (... bytes)
   Registered as asset ... (asset_type=video_clip) for project <id>.
```

- ✅ Open the clip — does it show real motion (not a static image)? If yes, that
  shot's clip is done — no need to regenerate it later.
- ❌ Out-of-memory error → tell Cloud Claude; the fix is bumping `gpu="A100"`, not a rewrite.
- ❌ Any other error → paste it back verbatim.

(A lower-level `test_image_to_video --image-path ... --prompt ...` entrypoint
still exists for testing an arbitrary image outside any project, if ever needed.)

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
