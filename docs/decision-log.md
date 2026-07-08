# Decision Log

This document records product and architecture decisions that future agents must preserve unless Randall explicitly changes direction.

Use this file to prevent Claude Code, Codex, GitHub Copilot, Cursor, or future maintainers from rediscovering old decisions and accidentally reversing them.

## 2026-07-08: Multi-agent collaboration rules

The repo may be edited by multiple coding agents and human maintainers.

Tools in use or under consideration:

- Claude Code
- Codex
- GitHub Copilot
- Cursor
- human local testing

Decision:

- All agents must follow `AGENTS.md`.
- No agent should work directly on `main`.
- Work should be issue-driven and branch-isolated.
- Agents should not edit the same branch at the same time unless Randall explicitly requests it.
- Agent handoff context should be maintained in `docs/agent-handoff.md`.

## 2026-07-08: Production workbook architecture

Decision:

The app should become a production workbook, not a hidden generator tunnel.

Every major pipeline stage should be visible from the beginning, editable, and gated by user approval before downstream stages run.

Reason:

The first end-to-end test proved the technical skeleton can complete, but upstream errors propagated into bad elements, repetitive storyboards, and unusable final output. Users need the ability to stop, edit, approve, retry, or regenerate before more tokens are spent.

Reference:

- `docs/production-workbook-implementation-plan.md`
- Issue #20

## 2026-07-08: Guided workflow over automatic workflow

Decision:

Default mode should be guided one-step-at-a-time processing.

Auto Run may be added later, but only after validation gates are reliable and the user can set explicit token/compute permissions.

Reason:

Hidden automatic progression wastes tokens and makes it hard to diagnose where bad creative decisions enter the pipeline.

## 2026-07-08: Rhythm/key analysis grouping

Decision:

BPM and beat-grid timestamping should be one user-facing step.

Reason:

BPM is derived from timing analysis. Splitting BPM from beat-grid detection would create artificial stages that do not match the actual analysis process.

User-facing stage name:

`Analyze Rhythm and Key`

## 2026-07-08: Lyrics and timestamping grouping

Decision:

Lyric transcription and lyric timestamping should be one user-facing step.

Reason:

The transcript text and timing data are coupled. Users should review the lyrics and timing together.

User-facing stage name:

`Transcribe and Timestamp Lyrics`

## 2026-07-08: Minor edits versus major lyric realignment

Decision:

Lyrics editing needs two modes:

- Minor Edit Mode: preserve existing timestamps.
- Major Rewrite / Re-align Mode: rebuild timestamps from corrected lyrics.

Reason:

Small spelling/punctuation fixes can keep timestamps. Major lyric corrections cannot reliably preserve timing by hand.

## 2026-07-08: Element plan before image generation

Decision:

The app must generate and approve an Element Plan before generating element images.

Reason:

Element images cost visual-generation tokens and directly affect storyboard quality. The user should approve which backgrounds, characters, props, motifs, and states are needed before images are generated.

## 2026-07-08: Element Images as visible gate

Decision:

Element images must be a visible required workbook section, not a hidden tab.

Reason:

The first end-to-end run generated element images, but the UI did not make it clear that they existed or should be reviewed before storyboarding. Weak element images produced weak storyboards.

## 2026-07-08: Shot manifest before storyboard images

Decision:

Storyboard images should be generated from an approved shot manifest.

The shot manifest should include per-shot:

- shot number
- timestamp start/end
- duration
- lyric/audio cue
- scene description
- characters/elements used
- action
- camera direction
- mood/energy
- image prompt
- negative prompt

Reason:

The previous storyboard generation used treatment plus a limited set of transcript segments and assets, causing repetitive output. A shot manifest gives the user a visible, editable plan before image generation.

## 2026-07-08: Storyboard Images as visible gate

Decision:

Storyboard images must be reviewed and approved before video generation.

Reason:

A bad storyboard should not be assembled into a video. The user needs to regenerate or replace individual frames before spending video-generation compute.

## 2026-07-08: Ken Burns / ffmpeg is preview-only

Decision:

Ken Burns / ffmpeg slideshow output must only run when explicitly requested as preview/slideshow mode.

It must not silently run as a fallback for real video generation.

Implementation rule:

- `VIDEO_BACKEND=ffmpeg` is blocked by default.
- It may only run if `ALLOW_FALLBACK_VIDEO=true`.

Reason:

The user requested a real music video. A slideshow fallback produced an unusable result and should not be labeled complete.

## 2026-07-08: Fail before wasting visual-generation tokens

Decision:

If real video generation is unavailable, the app should fail before calling paid/API image generation backends such as Cloudflare or Gemini.

Reason:

Generating images for a pipeline that cannot produce the requested final output wastes tokens and compute.

Placeholder image mode is allowed for local smoke tests because it costs nothing.

## 2026-07-08: Base video before optional lip sync

Decision:

Base video generation and lip sync are separate stages.

Workflow:

1. Generate base video.
2. User reviews base video.
3. User approves base video or requests changes.
4. User optionally runs Modal lip sync.
5. User reviews lip-synced output.
6. User chooses final export.

Reason:

Lip sync should not spend Modal compute on a base video the user already dislikes.

## 2026-07-08: Preserve base and lip-synced videos separately

Decision:

Store separate output URLs:

- `base_video_url`
- `lipsynced_video_url`
- `final_video_url`

Reason:

If lip sync fails, the approved base video must remain usable and must not be overwritten.

## 2026-07-08: Project completion only after final selection

Decision:

A project should not be marked complete merely because a render was produced.

Completion should happen only after the user selects or approves a final output.

Reason:

Generated output may be technically complete but creatively rejected. The app should distinguish generated from approved/final.

## 2026-07-08: Recommended agent roles

Decision:

Use agents according to their strengths:

- Claude Code: architecture review, planning, long-context analysis, file-by-file strategy.
- Codex: controlled issue implementation, PR patches, backend/frontend integration.
- GitHub Copilot: small editor-scoped code completions and boilerplate after architecture is decided.
- Cursor: local debugging, Windows launch fixes, hands-on UI/runtime validation.

Reason:

This keeps agents from stepping on each other and reduces uncontrolled rewrites.
