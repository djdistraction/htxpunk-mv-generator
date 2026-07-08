# Agent Handoff

This document is the current repo handoff for Claude Code, Codex, GitHub Copilot, Cursor, and human maintainers.

Update this file when the active workflow, major branch, project direction, or next recommended work changes.

## Current date

2026-07-08

## Current major branch

`guided-audio-steps`

## Current major PR

PR #19: `Add guided step-by-step audio workflow`

Status: open

Purpose:

- Split the front audio-prep phase into guided, visible user-triggered steps.
- Prevent silent Ken Burns fallback output.
- Stop paid/API image generation when real video output is not configured.

## Current major issue

Issue #20: `Build production-workbook pipeline interface with editable gated stages`

Purpose:

- Replace hidden pipeline behavior with a visible production workbook.
- Let the user edit, approve, retry, regenerate, or stop at each major stage.
- Prevent wasted tokens by stopping before downstream work if upstream results are bad.

## Primary implementation brief

Read:

`docs/production-workbook-implementation-plan.md`

That document is the primary architecture and implementation plan for the production-workbook rebuild.

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
- `docs/production-workbook-implementation-plan.md` added.
- `AGENTS.md` added.
- `docs/agent-handoff.md` added.
- `docs/decision-log.md` added.

## Recommended next issues

Break Issue #20 into smaller implementation issues before coding the full rebuild:

1. Add workbook shell UI.
2. Add explicit section status model.
3. Stop automatic creative progression after song review.
4. Add Element Plan gate.
5. Add Element Images review gate.
6. Add Shot Manifest editor.
7. Add Storyboard Images review gate.
8. Split Base Video and Optional Lip Sync.
9. Add token/compute preflight checks.
10. Add duplicate/timeline validation warnings.

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

## Sync command for current branch

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator"
git fetch origin --prune
git switch guided-audio-steps
git pull origin guided-audio-steps
```

## Warning

Do not run destructive cleanup commands such as `git clean -fdx` unless Randall explicitly confirms that local `.env`, storage, generated project files, and logs can be deleted.
