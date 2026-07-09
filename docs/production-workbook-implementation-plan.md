# Production Workbook Implementation Plan

## Purpose

This document converts the current music-video generator into an implementation-ready production workflow.

The app should not behave like a hidden wizard that consumes the whole song, spends tokens, and returns whatever it guessed. It should behave like a production workbook: a visible, editable, gated control surface where the user can inspect, correct, approve, retry, regenerate, or stop before the next expensive stage.

The first end-to-end run proved that the technical skeleton can complete, but it also exposed the core product problem: upstream mistakes silently propagated into bad elements, repetitive storyboards, and an unusable fallback video. This plan fixes that by making every major decision visible before downstream generation runs.

## Product contract

The app should follow these rules:

1. If the user requests a real music video, do not silently downgrade to a slideshow.
2. If a real video backend is unavailable, stop before paid/API image generation.
3. Every expensive stage must have a preflight check.
4. Every major generated output must be editable before approval.
5. No downstream stage should run until the upstream dependency is approved.
6. Element images and storyboard images are first-class review gates, not hidden tabs.
7. Lip sync is optional post-processing after the base video is reviewed and approved.
8. Failed optional steps must not overwrite approved prior outputs.

## High-level workflow

The project screen should open as a mostly blank production workbook with all sections visible from the beginning.

Required sections:

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

Each section should show:

- status: empty, ready, running, failed, generated, approved, rejected, skipped
- required inputs
- generated outputs
- editable fields
- validation warnings
- token/compute cost warning where applicable
- run / retry / regenerate / approve / reject / stop controls
- last run timestamp and error message where useful

## Data model recommendations

The current single `stage` field is useful but too coarse for a workbook. Keep it as a summary, but add explicit per-section state.

Recommended project fields:

```json
{
  "workflow_mode": "guided",
  "current_section": "lyrics",
  "sections": {
    "project_setup": { "status": "approved", "approved_at": "..." },
    "song_file": { "status": "approved", "approved_at": "..." },
    "rhythm_key": { "status": "approved", "approved_at": "..." },
    "lyrics": { "status": "approved", "approved_at": "..." },
    "song_analysis": { "status": "generated" },
    "treatment": { "status": "empty" },
    "element_plan": { "status": "empty" },
    "element_images": { "status": "empty" },
    "shot_manifest": { "status": "empty" },
    "storyboard_images": { "status": "empty" },
    "base_video": { "status": "empty" },
    "lip_sync": { "status": "empty" },
    "final_export": { "status": "empty" }
  }
}
```

Recommended persistent columns or JSON fields:

- `section_statuses`
- `approved_inputs`
- `validation_warnings`
- `generation_attempts`
- `token_cost_estimates`
- `base_video_url`
- `lipsynced_video_url`
- `final_video_url`
- `render_mode` such as `real_video`, `preview_slideshow`, `image_sequence_only`
- `allow_preview_slideshow` boolean

## UI layout

Use a single project workbook page with collapsible cards.

Each card should use the same basic structure:

```text
[Section Title]      [Status Badge]
Purpose: ...
Required inputs: ...
Generated results: ...
Warnings: ...
Actions: Save | Run | Retry | Approve | Reject | Stop
```

The user should be able to see all sections from the start, even if most are empty or locked.

Locked sections should explain exactly what must be approved first.

Example:

```text
Storyboard Images
Status: Locked
Needs: Approved Shot Manifest
This step will generate 31 full-frame storyboard images. Estimated cost: ...
```

## Section specifications

### 1. Project Setup

Purpose:
Collect high-level project intent before analysis begins.

Editable fields:

- title
- artist
- series
- creative brief
- reference notes
- reference files
- desired visual style
- output goal: real music video, storyboard only, image pack, preview slideshow

Actions:

- save
- approve project setup
- return to edit

Validation:

- title required
- song file required before audio stages
- if output goal is real music video, verify real video backend before paid/API visual generation

### 2. Song File

Purpose:
Store original song and optional vocal stem.

Inputs:

- original audio file
- optional isolated vocal stem

Actions:

- upload / replace song
- upload / replace vocal stem
- approve song file

Validation:

- supported audio format
- file exists in storage
- duration can be probed
- warn if song duration is unavailable

### 3. Rhythm and Key

Purpose:
Analyze musical timing and key.

Outputs:

- BPM
- beat grid timestamps
- musical key
- beat count
- confidence where available

Actions:

- run analysis
- retry analysis
- manually edit BPM
- manually edit key
- approve rhythm/key data

Implementation notes:

- BPM and beat-grid timestamping should stay one user-facing step.
- Do not split beat-grid from BPM, because BPM is derived from timing analysis.

### 4. Lyrics and Timestamps

Purpose:
Create lyric timing data.

Outputs:

- segment-level timestamps
- word-level timestamps when available
- full lyric text
- transcription model used
- VAD status
- input source: full mix, isolated vocals, user-provided vocal stem

Actions:

- transcribe
- retry with larger model
- retry without VAD
- retry using full mix
- retry using vocal stem
- edit lyrics
- approve lyrics
- major rewrite / re-align

Minor Edit Mode:

- preserve existing timestamps
- allow punctuation, spelling, small wording fixes

Major Rewrite / Re-align Mode:

- user provides corrected lyrics
- app re-aligns corrected lyrics to audio
- timestamps are rebuilt rather than manually preserved

Validation:

- warn if transcript is very short relative to song duration
- warn if large gaps exist
- warn if many repeated or low-confidence segments appear

### 5. Song Analysis

Purpose:
Convert approved lyrics and rhythm data into creative structure.

Inputs:

- approved lyrics
- approved rhythm/key data
- creative brief
- references

Outputs:

- song sections
- emotional arc
- energy curve
- themes
- narrative interpretation
- key lyric moments
- visual opportunities
- required visual concepts

Actions:

- run analysis
- retry analysis
- edit fields manually
- approve analysis

Validation:

- every major song section should have start/end times
- no section overlaps
- analysis should cover full song duration
- key moments should reference real lyric timestamps

### 6. Treatment

Purpose:
Turn song analysis into creative direction.

Inputs:

- approved song analysis
- creative brief
- references
- series continuity

Outputs:

- logline
- visual style
- narrative structure
- recurring motifs
- color palette
- scene world rules
- negative constraints

Actions:

- generate treatment
- revise treatment
- edit treatment manually
- approve treatment

Validation:

- treatment must not contradict explicit user brief
- treatment should reference actual song analysis sections
- treatment should include concrete visual rules, not vague mood words only

### 7. Element Plan

Purpose:
Plan required assets before spending image-generation tokens.

Inputs:

- approved song analysis
- approved treatment

Outputs:

- required backgrounds
- required characters
- character states
- required props
- symbolic motifs
- style prompts
- negative prompts

Actions:

- generate element plan
- add element
- edit element
- delete element
- approve element plan

Important:

This stage should cost only LLM tokens. It must not generate images.

Validation:

- each planned element must explain why it is needed
- every planned element should connect to at least one shot, lyric moment, or treatment rule
- warn if too few backgrounds or character states are planned for the song duration

### 8. Element Images

Purpose:
Generate reusable images only after the element plan is approved.

Inputs:

- approved element plan

Outputs:

- background images
- character images
- prop images
- state variations

Actions:

- generate selected element
- generate all approved elements
- regenerate element
- edit prompt
- replace with user upload
- approve asset
- reject asset

Validation:

- enough approved backgrounds exist
- enough approved character states exist
- rejected assets are not available downstream
- warn if too many assets are visually similar

UI requirement:

This must be a visible required workbook section, not a hidden tab.

### 9. Shot Manifest

Purpose:
Create the true storyboard plan before generating storyboard images.

Inputs:

- approved lyrics
- approved song analysis
- approved treatment
- approved elements

Outputs per shot:

- shot number
- timestamp start
- timestamp end
- duration
- lyric/audio cue
- scene description
- characters used
- background used
- props used
- action
- camera direction
- mood/energy
- image prompt
- negative prompt

Actions:

- generate shot manifest
- edit shot
- add shot
- delete shot
- reorder shots
- regenerate selected shot plan
- approve manifest

Validation:

- manifest covers full song duration
- no gaps unless intentional
- no overlaps unless intentional
- shot count matches song length, lyric density, beat grid, and energy curve
- duplicate prompt detection
- repeated lyric detection
- warn if more than a small percentage of shots use the same description or same prompt skeleton

### 10. Storyboard Images

Purpose:
Generate one full-frame image per approved shot.

Inputs:

- approved shot manifest

Outputs:

- storyboard image per shot

Actions:

- generate selected shot image
- generate all missing shot images
- regenerate selected image
- replace image with upload
- approve image
- reject image

Validation:

- one approved image for every required shot
- warn if too many images are visually similar
- warn if images do not match approved shot prompt metadata
- rejected storyboard images cannot proceed to video generation

Important:

Storyboard images should be generated from shot-specific prompts, not from a generic treatment plus a small pool of elements.

### 11. Base Video

Purpose:
Generate the base video from approved storyboard images and approved shot timing.

Inputs:

- approved storyboard images
- approved shot manifest
- approved audio
- configured real video backend

Actions:

- preflight video backend
- generate base video
- review video
- approve base video
- request edits/regeneration

Validation:

- real video backend available
- final duration matches song duration within tolerance
- audio present
- all shots represented
- failed render does not mark project complete

Output:

- `base_video_url`

Important:

Ken Burns / ffmpeg slideshow must not run unless explicitly requested as preview mode.

### 12. Optional Lip Sync

Purpose:
Run optional lip sync after the user approves the base video.

Inputs:

- approved base video
- audio
- selected face/character/lip-sync target information if needed
- Modal credentials and backend availability

Actions:

- run lip sync
- review lip-synced version
- approve lip-synced version
- keep base video instead

Validation:

- base video must be approved first
- Modal credentials must be configured
- failed lip sync must not overwrite base video

Outputs:

- `lipsynced_video_url`

Important:

Lip sync is not bundled into base video generation. It is optional post-processing.

### 13. Final Export

Purpose:
Mark the final selected output.

Inputs:

- approved base video or approved lip-synced video

Actions:

- choose final version
- export/download
- open local file
- mark complete

Outputs:

- `final_video_url`
- final export metadata

Validation:

- final URL exists
- final file duration matches expected song duration
- project is not marked complete until final output is selected

## Backend API shape

Add one endpoint per workbook section rather than one monolithic pipeline action.

Recommended examples:

```text
POST /api/projects/{id}/sections/project-setup/save
POST /api/projects/{id}/sections/project-setup/approve
POST /api/projects/{id}/sections/song-file/upload
POST /api/projects/{id}/sections/song-file/approve
POST /api/projects/{id}/sections/rhythm-key/run
POST /api/projects/{id}/sections/rhythm-key/approve
POST /api/projects/{id}/sections/lyrics/transcribe
POST /api/projects/{id}/sections/lyrics/realign
POST /api/projects/{id}/sections/lyrics/approve
POST /api/projects/{id}/sections/song-analysis/run
POST /api/projects/{id}/sections/song-analysis/approve
POST /api/projects/{id}/sections/treatment/generate
POST /api/projects/{id}/sections/treatment/approve
POST /api/projects/{id}/sections/element-plan/generate
POST /api/projects/{id}/sections/element-plan/approve
POST /api/projects/{id}/sections/element-images/generate-one
POST /api/projects/{id}/sections/element-images/approve-asset
POST /api/projects/{id}/sections/shot-manifest/generate
POST /api/projects/{id}/sections/shot-manifest/approve
POST /api/projects/{id}/sections/storyboard-images/generate-one
POST /api/projects/{id}/sections/storyboard-images/approve-image
POST /api/projects/{id}/sections/base-video/preflight
POST /api/projects/{id}/sections/base-video/generate
POST /api/projects/{id}/sections/base-video/approve
POST /api/projects/{id}/sections/lip-sync/run
POST /api/projects/{id}/sections/lip-sync/approve
POST /api/projects/{id}/sections/final-export/select
```

## Preflight checks

Run preflight checks before every token-expensive or compute-expensive action.

Before image generation:

- approved element plan or shot manifest exists
- real video output path is configured unless user explicitly requested images-only or preview mode
- image backend credentials exist
- estimated generation count is displayed
- user confirms generation

Before base video generation:

- approved storyboard images exist
- real video backend configured
- all shot durations cover full song
- audio exists

Before lip sync:

- base video approved
- Modal configured
- target information available

## Duplicate and quality checks

Add validators that run before storyboarding and before video generation.

Recommended warnings:

- too many repeated prompts
- too many repeated lyrics
- too many shots using same background/character state
- timeline gaps
- timeline overlaps
- total planned duration differs from song duration
- transcript too short
- generated element count too low
- insufficient approved assets
- rejected assets referenced by shot manifest

## Implementation order

Recommended order for Codex or future PRs:

### Phase 1: Workbook shell

- Build the single workbook-style project page.
- Show every section from the beginning.
- Use current data where possible.
- Add status badges and locked/ready/generated/approved states.

### Phase 2: Explicit section state

- Add `section_statuses` JSON or equivalent fields.
- Add approve/reject mechanics per section.
- Stop using one global stage as the only source of truth.

### Phase 3: Move creative stages into manual gates

- Split song analysis, treatment, element plan, image generation, storyboard planning, and storyboard image generation into separate endpoints.
- Remove automatic progression after song-info review.

### Phase 4: Element plan and asset review

- Add element planning before image generation.
- Add asset approval/rejection.
- Block storyboarding until enough assets are approved.

### Phase 5: Shot manifest first

- Replace treatment-driven storyboard generation with approved shot manifest generation.
- Generate storyboard images from shot-specific prompts.

### Phase 6: Base video and optional lip sync

- Generate base video only after storyboard approval.
- Review base video.
- Run optional Modal lip sync only after base video approval.
- Store base and lip-synced video URLs separately.

### Phase 7: Auto mode later

Only after the guided workflow works, add optional Auto Run mode with explicit user permissions and token budget controls.

## Acceptance criteria

A successful implementation should meet these criteria:

- New projects open into a visible production workbook.
- Every major stage is visible from the beginning.
- The user can manually edit or generate one stage at a time.
- The user can stop before downstream token spending.
- Song analysis directly drives element planning and shot planning.
- Element images require visible approval before storyboarding.
- Storyboard images require visible approval before video generation.
- Base video generation and lip sync are separate stages.
- Modal lip sync is optional and only runs after base video approval.
- Ken Burns/slideshow mode is never produced unless explicitly requested.
- Failed optional steps do not overwrite approved prior outputs.
- Project completion only happens after a final output is selected.

## Codex implementation prompt

Use this as a handoff prompt:

```text
Implement the production workbook architecture described in docs/production-workbook-implementation-plan.md.

Start with the workbook shell and section state. Do not attempt to solve every generation algorithm in one PR.

Primary goals for the first implementation PR:
1. Replace the hidden project pipeline UI with a single workbook-style project page showing all sections.
2. Add explicit section statuses: empty, ready, running, failed, generated, approved, rejected, skipped, locked.
3. Make every section visible from the beginning.
4. Allow each section to be edited or generated one step at a time.
5. Stop automatic creative progression after song-info review.
6. Add visible gates for Element Plan, Element Images, Shot Manifest, Storyboard Images, Base Video, Optional Lip Sync, and Final Export.
7. Add preflight checks before image generation, base video generation, and lip sync.
8. Preserve base_video_url and lipsynced_video_url separately.
9. Never run Ken Burns / ffmpeg slideshow unless the user explicitly enables preview slideshow mode.

Keep the implementation incremental and reviewable. Prefer adding a workbook shell plus explicit section state first, then moving generation stages behind those gates in follow-up commits.
```
