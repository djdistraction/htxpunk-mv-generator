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
- `run.py --allow-preview-video` may be used to intentionally enable the flag for local smoke tests.
- Electron must preserve/pass `ALLOW_FALLBACK_VIDEO`; because it spawns the backend with direct environment variables, writing a `.env` alone is not enough.

Reason:

The user requested a real music video. A slideshow fallback produced an unusable result and should not be labeled complete. However, an intentional `$0` smoke test path remains useful as long as it is explicit.

## 2026-07-08: Explicit preview smoke-test path

Decision:

The local `$0` smoke-test path is allowed only when all relevant preview settings are explicit.

Required config:

```env
IMAGE_BACKEND=placeholder
VIDEO_BACKEND=ffmpeg
ALLOW_FALLBACK_VIDEO=true
```

Reason:

Placeholder images cost no external image-generation tokens and are useful for validating pipeline wiring. But placeholder images plus ffmpeg preview output should still be opt-in, not the silent behavior when a user requested a real music video.

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

## 2026-07-09: Project goal — five production paths

Decision:

The project's stated top-level goal, from Randall, verbatim:

> My goal for this project is to create an application that serves as a music
> video production tool, guiding the user through each step of a professional
> production. It should allow for both manual content injection and
> artificial intelligence automation. I'd like for there to be 5 main music
> video paths that the production can use as base points; Lyric Video,
> Karaoke Video, Performance Music Video, Cinematic Music Video, or a
> combination of any 2 of those choices. The user should be able to upload
> their song with the end result being a professional quality music video.

This supersedes any prior assumption that the app has one implicit production
style. Everything built so far (treatment → element plan → element images →
storyboard → shot manifest → image-to-video) is the **Cinematic Music Video**
path specifically, not "the" pipeline.

Reason:

No overall product goal had been written down before this. Individual
features (guided audio steps, the workbook shell, reference handling, lyric
alignment) were being built without an agreed frame for how they fit
together or what else the app needs to become.

## 2026-07-09: Production path is chosen once, at project creation

Decision:

The user selects a production path (one of the four named paths, or a
combination of two) when creating a project, alongside title and audio
upload — not mid-project.

Reason:

Randall's explicit choice. Matches how the app is already structured (one
linear guided flow per project, per issue #20) with the least disruption.
Changing paths mid-project (treating paths as toggleable layers over
already-generated assets) was considered and explicitly not chosen for now —
revisit only if Randall asks for it later.

## 2026-07-09: Performance Music Video supports both AI performer and uploaded footage

Decision:

"Performance Music Video" is not one pipeline — Randall confirmed both of the
following are in scope, user's choice per project:

- **AI-generated virtual performer**: no user footage. A consistent AI
  character, generated once, lip-synced to the vocal track for the song's
  full duration. Extends the base-video/lip-sync split work in issue #27
  almost directly — same Modal lip-sync machinery, applied continuously to
  one performer instead of split across a varied narrative cast.
- **User-uploaded real performance footage**: the user uploads real video of
  themselves (or a performer) and the app edits/syncs/cuts that footage to
  the song. This is a genuinely different capability — video ingestion,
  storage of larger user video uploads (the multi-file upload body-size fix
  from PR #23 is now load-bearing infrastructure for this, not just audio),
  shot/cut-point selection, beat-synced trimming — not an extension of the
  existing AI-image-generation stack.

Reason:

Randall's explicit choice — deliberately bigger scope than the single-mode
default that was proposed. Both modes are real product requirements, not a
future nice-to-have.

## 2026-07-09: Proposed architecture — composable generation modules, not five pipelines

Proposal (not yet implemented — flagging the intended shape before Codex/Claude
carve out implementation issues, so nobody builds five duplicate pipelines):

"A combination of any 2" only makes sense if the five paths share underlying
machinery instead of being five independent, mutually-exclusive builds. The
proposed shape is a small set of composable modules, where a project's chosen
path(s) determine which modules run:

- **Narrative/character visual generation** — the existing treatment → element
  plan → element images → storyboard → shot manifest → image-to-video stack.
  Full version for Cinematic Music Video; a lighter version (few/no character
  elements, simpler backgrounds) when only providing a backdrop for a
  Lyric/Karaoke project.
- **Lyric-overlay rendering** — new, built on issue #25's forced-alignment
  work. Lyric Video and Karaoke Video are the same module with different
  typography/precision presets (line-level display vs. word-level
  highlight-as-sung), not two separate systems.
- **Performer generation** — extends issue #27's base-video/lip-sync split,
  plus a new uploaded-footage ingestion path for the second Performance mode
  above.

A project's `production_path` selection(s) (max 2, chosen at creation per the
decision above) toggle which of these modules run and which guided-workflow
stages from issue #20 are even shown — e.g. a pure Lyric Video project should
not need the full element/character extraction machinery a Cinematic project
does.

This needs its own tracking issue and file-by-file plan before implementation
starts, the same way issue #20 anchored the workbook rebuild. See issue #29.
