# Agent Handoff

This document is the current repo handoff for Claude Code, Codex, GitHub Copilot, Cursor, and human maintainers.

Update this file when the active workflow, major branch, project direction, or next recommended work changes.

## Current date

2026-07-14

## Product model (2026-07-14 — read this)

**Shared foundation first. Lyric Video is the first deliverable. Other formats branch from the same foundation.**

- Foundation = song file + rhythm/key + timestamped lyrics + title/artist/metadata + optional brief/references.
- Foundation must be **editable** (not locked “required” fields with no inputs).
- Master **Lyric Video** end-to-end before investing in full cinematic quality.
- After lyric video exists, user can **enable Karaoke / Performance / Cinematic** without re-uploading or re-transcribing.
- See `docs/decision-log.md` entry **2026-07-14: Shared foundation first**.

APIs: `POST /api/projects/{id}/foundation`, `POST /api/projects/{id}/production-paths/add`.

## UI skin (2026-07-11)

Branch `cursor/win95-app-shell` (based on `claude/lyric-video-v1`) applies the
Claude Design Win95 utility look across the app:

- App chrome: title bar, menu bar, toolbar, status bar (`frontend/components/win95/AppShell.tsx`)
- Primitives: buttons, group boxes, progress, alerts, modal
- Project library, new project, settings, and workbook detail reskinned natively
- Workbook detail uses a left **PRODUCTION PIPELINE** sidebar (select one stage at a time)
- **Native Win95 stage pages (follow-up same day):** treatment, elements, storyboard,
  production, review, processing; manifest shell updated; remaining dark-class markup
  still softened by `.win95-content` CSS compatibility layer

### Lyric Video polish (same branch)

- Faster polling while `assembling_lyric_video` / other busy stages run
- Success banners after approve/run actions; auto-advance sidebar after approve
- Production Review handles lyric render stage, clearer approve-final UX
- Confirm-info also marks `song_file` approved so Generate lyric video unlocks without a redundant gate click
- Default new-project path is **Lyric Video**

Visual direction: sturdy Windows 95 control-panel utility, not modern AI SaaS.

### Recommended when Randall returns

1. Open PR from `cursor/win95-app-shell` → `main` (compare URL + body in `docs/pr-win95-lyric-checklist.md`).
2. Run the Lyric Video smoke checklist in that doc.
3. Merge only after pass criteria are green.
4. Next product slice after merge: Karaoke path (same module), not full cinematic rework.

## Project goal (read this first)

The app is a music video production tool that guides the user through each
step of a professional production, supporting both manual content injection
and AI automation. Five production paths, chosen once at project creation:
**Lyric Video**, **Karaoke Video**, **Performance Music Video** (AI-generated
virtual performer, or user-uploaded real footage — both in scope), **Cinematic
Music Video**, or a combination of any two. See `docs/decision-log.md`'s
"2026-07-09" entries for the full detail and the proposed composable-module
architecture. Tracked in issue #29.

Everything built before 2026-07-09 (treatment → element plan → element
images → storyboard → shot manifest → image-to-video) is the **Cinematic
Music Video** path specifically — not "the" pipeline. Issue #20's workbook
rebuild and issue #25's lyric-alignment work are foundational pieces this
larger goal depends on, not separate side quests.

## Current major branch

`main` — `guided-audio-steps` and `codex/issue-20-workbook-shell` merged and
were deleted after PR #19 and PR #22 landed.

## Current major issues

- Issue #20: `Build production-workbook pipeline interface with editable gated stages` — Phase 1 (workbook shell, explicit one-step actions) shipped via PR #22. PR #31 (Codex, `codex/issue-20-workbook-shell`) adds the rest of the list from PR #22's "still open" note: persisted workbook section statuses with approve/reject controls, per-asset (element/storyboard image) approve/reject gates, an editable shot-manifest workflow (import, add, edit, delete, preflight), and a base-video/final-export split (`base_video_url` stored separately, final approval selects `final_video_url`). Still open after #31: duplicate/timeline validation, token preflight checks, and the lip-sync half of the base/lip-sync split (see #27).
- Issue #29: `Five production paths` — PR #31 implements the core of this: a production-path chooser (Lyric, Karaoke, Performance, Cinematic, or a hybrid of any two) at project creation, persisted and editable during Project Setup review, included in the creative context driving song analysis and downstream planning. The composable-module architecture proposed in `docs/decision-log.md` still needs validating against how the different paths actually render/assemble differently, not just how they're selected.
- Issue #24: reference images/text were structurally invisible past the treatment stage. Part A (thread `reference_notes` through the whole pipeline) shipped in PR #28. Part B (vision-model captioning) not started.
- Issue #25: lyrics upload + `aeneas` forced alignment. Shipped (`159f28f`, PR #34; install/Python-3.12+/Windows-compiler fixes in PR #35). Backend (`services/lyrics_aligner.py`, `POST /guided/align-lyrics`) is done and tested. Still open: the guided frontend flow doesn't call it yet — `ProjectDetail.tsx` always dispatches Whisper transcription regardless of `project.user_lyrics_text`. See `docs/lyric-karaoke-module-implementation-plan.md`.
- Randall's direction (2026-07-10): stop building all five paths at once. Get **Lyric Video** working end-to-end first (one stage at a time, each verified before the next), then Karaoke, then scale up. Modal/lip-sync is explicitly out of scope until there's an approved base video — preserving the 30-min free-tier budget. See `docs/lyric-karaoke-module-implementation-plan.md` for the active build order; treat it as the current priority over other issue work below until it's done.
- Issue #26: double-dispatch race in the workbook's manual worker endpoints (found in review on #22, merged unaddressed, fixed separately in PR #26, merged).
- Issue #27 (assigned to Codex, in progress): split base video generation from optional lip-sync into separate approval-gated stages. PR #31 splits base video from final export; the optional-lip-sync-as-its-own-gate half is still in progress — Codex was mid-way through it (`Add optional lip sync review gate`) when the July 15 unavailability window started.

## Codex unavailable until 2026-07-15

Claude Code is driving repo work directly until then, including finishing PR #31's remaining scope. Do not assume Codex will pick up new work before that date.

## Primary implementation brief

Read:

`docs/production-workbook-implementation-plan.md` for the workbook rebuild (issue #20).

`docs/decision-log.md`'s 2026-07-09 entries for the five-production-paths goal (issue #29) — no separate implementation-plan doc exists yet for this; write one before starting implementation, the same way `production-workbook-implementation-plan.md` anchored issue #20.

## Collaboration rules

Read:

`AGENTS.md`

That file defines the required multi-agent workflow for Claude Code, Codex, GitHub Copilot, Cursor, and human maintainers.

## Current product direction

The app should become a production workbook, not a hidden generator tunnel.

The user should see every major stage from the beginning:

1. Project Setup
2. Song File
3. Rhythm and Key
4. Lyrics and Timestamps
5. Song Analysis
6. Treatment
7. Element Plan
8. Element Images
9. Shot Manifest
10. Storyboard Images
11. Base Video
12. Optional Lip Sync
13. Final Export

Every stage should be visible, editable, and approved before downstream stages run.

## Current non-negotiable decisions

- Do not work directly on `main`.
- Do not have multiple agents edit the same branch at the same time.
- Do not silently produce Ken Burns / ffmpeg slideshow output.
- Ken Burns / ffmpeg slideshow output is preview-only and must be explicitly requested.
- Do not spend image/video tokens when real video backend is unavailable.
- Lip sync is optional post-processing after base video approval.
- Store base video and lip-synced video separately.
- Failed optional steps must not overwrite approved prior outputs.
- Element images must be a visible approval gate before storyboarding.
- Storyboard images must be a visible approval gate before video generation.
- Project completion should only happen after a final output is selected.

## Current known test result

A first end-to-end run completed and produced a video file, proving the basic skeleton works.

Observed problems:

- Lyrics transcription quality was poor.
- Major lyric edits were difficult because timestamps were hard to preserve.
- Element images were generated, but the Elements tab was hidden and not presented as a required workflow gate.
- Generated background/character assets were low quality.
- Storyboard generation repeated a small number of concepts.
- Final output used the ffmpeg/Ken Burns fallback path.
- Song was 3:17, but output was 1:50 because slideshow panels used fixed duration.
- The app should have pushed back earlier instead of producing an unusable fake video.

## Work already added to PR #19

- Guided audio steps for upload/audio-prep/transcription.
- MP3 uploads are copied instead of re-encoded, with clearer messaging.
- `ffmpeg`/Ken Burns preview rendering is blocked unless `ALLOW_FALLBACK_VIDEO=true`.
- If preview mode is explicitly enabled, slideshow duration is distributed across audio duration instead of truncating.
- Cloudflare/Gemini image generation is blocked if real video generation is unavailable, unless preview mode is explicitly enabled.
- `run.py` now writes `ALLOW_FALLBACK_VIDEO=false` by default and preserves the flag in `.env`.
- `run.py --allow-preview-video` explicitly enables `$0` Ken Burns preview mode for local smoke tests.
- `electron-app/main.js` now includes `allowFallbackVideo` in saved config, generated app-data `.env`, and the environment passed to the spawned backend process.
- `.env.example` now documents that `ffmpeg` is preview-only and `ALLOW_FALLBACK_VIDEO` defaults to false.
- `docs/production-workbook-implementation-plan.md` added.
- `AGENTS.md` added.
- `docs/agent-handoff.md` added.
- `docs/decision-log.md` added.

## Collaboration note: Claude Code review of PR #19

Claude Code reviewed the current branch and correctly identified a real gap: the backend had gained `ALLOW_FALLBACK_VIDEO`, but the launcher/Electron paths did not yet surface or preserve that flag.

My opinion of that analysis:

- Correct on the main technical concern.
- Correct that `run.py` did not write `ALLOW_FALLBACK_VIDEO` before this follow-up patch.
- Correct that Electron needed special attention because it both writes an app-data `.env` and passes environment variables directly when spawning Uvicorn.
- Correct that the strict fallback block should not accidentally kill the deliberate `$0` placeholder smoke-test path.
- I would not remove the fallback-blocking behavior from PR #19. The product rule belongs with this guided workflow work because both changes enforce the same principle: stop clearly instead of silently continuing toward bad downstream output.
- The right compromise is now implemented: fallback slideshow mode remains disabled by default, but can be intentionally enabled for smoke tests.

Important nuance for future agents:

- `IMAGE_BACKEND=placeholder` alone means free placeholder images.
- `VIDEO_BACKEND=ffmpeg` alone does **not** mean preview video is allowed.
- A complete explicit smoke-test preview requires:

```env
IMAGE_BACKEND=placeholder
VIDEO_BACKEND=ffmpeg
ALLOW_FALLBACK_VIDEO=true
```

CLI shortcut for local browser-mode smoke tests:

```powershell
py run.py --no-install --allow-preview-video
```

## Recommended next issues

Issue #20 breakdown, updated status:

1. Add workbook shell UI. — done (PR #22).
2. Add explicit section status model. — not started.
3. Stop automatic creative progression after song review. — done (PR #22).
4. Add Element Plan gate. — done (PR #22, part of the manual-action shell).
5. Add Element Images review gate. — done (PR #22).
6. Add Shot Manifest editor. — not started (manifests are still import/seed-only, no LLM-generated manifest editor exists yet).
7. Add Storyboard Images review gate. — done (PR #22).
8. Split Base Video and Optional Lip Sync. — not started, tracked as issue #27 (assigned to Codex).
9. Add token/compute preflight checks. — not started.
10. Add duplicate/timeline validation warnings. — not started.

Plus, new as of 2026-07-09: issue #29 (five production paths) needs its own
file-by-file plan before any of it is implemented.

## Recommended next agent workflow

### Claude Code

Ask Claude Code to plan first:

```text
Read AGENTS.md, docs/agent-handoff.md, docs/decision-log.md, and docs/production-workbook-implementation-plan.md.

Do not write code yet.

Create a file-by-file implementation plan for Phase 1 and Phase 2 only:
- workbook shell
- explicit section state

Identify risks, files likely touched, and what should not be changed.
```

### Codex

Ask Codex to implement a narrow first PR:

```text
Read AGENTS.md and docs/production-workbook-implementation-plan.md.

Implement only Phase 1: workbook shell.
Do not change generation algorithms.
Do not change video backend behavior.
Do not move pipeline stages yet.

Goal:
Show every workbook section on the project page with status badges and locked/ready/generated/approved states using existing project data where possible.

Keep the PR narrow.
```

### GitHub Copilot

Use GitHub Copilot for small, local editor-scoped changes only after the architecture and issue scope are clear.

Good Copilot tasks:

- extract a UI component
- add TypeScript types
- wire a status badge
- add a small helper function
- clean up local styling
- add tests for an already-decided behavior

Do not use Copilot for unchecked project-wide rewrites.

### Cursor

Use Cursor for local debugging and verification on Windows.

Good Cursor tasks:

- run the app locally
- inspect terminal errors
- fix path/import issues
- verify UI sections render
- test that generated project storage remains intact

## Local test command

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator"
py run.py --no-install
```

## Explicit local preview smoke-test command

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator"
py run.py --no-install --allow-preview-video
```

Use this only when the user/developer intentionally wants `$0` placeholder/ffmpeg preview behavior.

## Sync command for current branch

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator"
git fetch origin --prune
git switch main
git pull origin main
```

## Warning

Do not run destructive cleanup commands such as `git clean -fdx` unless Randall explicitly confirms that local `.env`, storage, generated project files, and logs can be deleted.
