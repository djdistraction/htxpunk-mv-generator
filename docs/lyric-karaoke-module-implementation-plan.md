# Lyric & Karaoke Module Implementation Plan

## Status

**Lyric Video v1 (build-order steps 1-4) shipped 2026-07-10.** Bug #2
(blocking server), bug #1 (align-lyrics wiring), the standalone Lyric Video
Remotion composition + backend render branch, and hiding non-applicable
workbook stages are all done, each independently verified with real
end-to-end runs (real browser via Playwright, real Remotion renders,
frame-level visual inspection) — not just type-checked or unit-tested in
isolation. Branch `claude/lyric-video-v1`.

Three real bugs were found and fixed along the way that this plan didn't
anticipate, each confirmed by reproducing the failure first:
- Local audio referenced via `file://` URI (the existing MusicVideo/
  `build_timeline()` convention) 404s against this Remotion version's asset
  server — the working form is copying into `remotion-composer/public/` and
  referencing `/public/<filename>`. **This likely also affects the existing
  Cinematic path's MusicVideo render** — not fixed here (out of scope per
  this plan's Cinematic-path boundary), but worth a follow-up.
- `<Composition>`'s `durationInFrames`/`fps` are static unless wired through
  `calculateMetadata` — a render whose `--props` specified a different
  duration silently rendered the composition's hardcoded placeholder length
  instead. Fixed for the LyricVideo composition only.
- `LyricOverlay.tsx` crashes (`interpolate()` non-monotonic input range) on
  a segment shorter than its fade-animation window — hit for real via a
  short forced-alignment segment. Fixed defensively (skip the fade below
  that length) since the Cinematic path could hit this too.

Bug #3 (UI feedback/copy fixes) is unstarted — explicitly lower priority
and lowest risk, deferred to run after Randall tests the core flow.

Still to do before this plan is fully closed: Randall's own end-to-end test
of the merged feature, then Karaoke Video (same module, word-level
highlight preset per decision-log.md's framing).

Originally drafted 2026-07-10 from a real end-to-end pipeline test run (see
`testing-notes/2026-07-10-pipeline-run.md`) plus direct backend/frontend
tracing. Anchors issue #29's Lyric-overlay module the same way
`production-workbook-implementation-plan.md` anchored issue #20 — this is
the file-by-file plan that decision-log.md's 2026-07-09 "composable
generation modules" entry said needs to exist before implementation starts.

**Note for whoever picks this up: `docs/agent-handoff.md` currently says
issue #25 (lyrics upload + aeneas forced alignment) is "not started." That's
stale — it shipped (`159f28f`, backend `/guided/align-lyrics` endpoint,
`services/lyrics_aligner.py`). Update the handoff doc as part of this work.**

## Purpose

Randall's direction: stop trying to build the full five-path system at once.
Get **Lyric Video** working end-to-end, cleanly, one stage at a time, with
each stage verified before moving to the next. Karaoke Video is next after
that (same module, different caption preset — see decision-log.md), then
scale up from there. This plan scopes Lyric Video v1 only.

Explicit non-goals for this plan: Karaoke word-level highlighting, Performance
Music Video, Cinematic Music Video changes, and anything touching Modal
(lip-sync). Randall is deliberately preserving the Modal free-tier minutes
budget (30 min) until there's an approved base video worth lip-syncing —
Modal should not be touched by this work at all.

## What today's test proved

A real run (song title + audio upload + pasted lyrics + "cinematic" path
selected by mistake, but the same components apply) surfaced three real bugs,
independent of the "lyric module doesn't exist yet" scope gap below. Fix
these regardless of production path, since Lyric Video depends on all three:

1. **`align-lyrics` is fully built on the backend and dead on the frontend.**
   `frontend/lib/api.ts` has `alignLyrics(id, lyricsText?)` wired to
   `POST /{project_id}/guided/align-lyrics`. Nothing in
   `frontend/app/projects/[id]/ProjectDetail.tsx` (`GUIDED_RUN_STEPS`,
   `isGuidedStepReady`, or the action dispatcher) ever calls it. Today, the
   UI always calls `transcribeLyrics` (Whisper) regardless of whether the
   user supplied lyrics at upload. Fix: branch on `project.user_lyrics_text`
   — if present, the guided step should be "Align Lyrics" (call
   `align-lyrics`); if absent, "Transcribe Lyrics" (call `transcribe-lyrics`
   as today). Both still require vocal isolation to have run first — aeneas
   aligns against the isolated vocal stem, not the full mix, so this doesn't
   remove the isolate-vocals dependency.

2. **Long CPU-bound guided steps block the entire backend process.**
   Confirmed directly: while `guided_isolate_vocals` was running (CPU-only
   ONNX vocal separation, several minutes for a full song), a plain
   `GET /health` request on a separate connection also hung and timed out.
   This is a single-process/blocking-call problem, not a slow-request
   problem — the whole server stops answering anything. This is what
   produced the "Project not found" / repeated 500s Randall hit; the job
   was still working, the server just couldn't respond to anything,
   including the page's own polling of project state. Almost certainly
   affects `guided_transcribe_lyrics` (Whisper) and video render the same
   way, since they're written the same way (blocking call inline in the
   `async def` handler). Fix: move these off the request thread — minimum
   viable fix is `run_in_executor` / a thread pool so the event loop stays
   responsive; better is a real job record (status: queued/running/done/
   failed) the frontend polls, so the UI can show real progress instead of
   a single long fetch that times out client-side regardless of server fix.

3. **Missing/misleading UI feedback**, lower priority but cheap to fix
   alongside the above:
   - Rhythm/Key "Approve" gives no visible confirmation — it does work
     server-side (`section_statuses.rhythm_key.status` does flip to
     `"generated"`... check whether approve should move it to
     `"approved"` specifically, may be its own small bug), but the button
     gives no toast/checkmark/state change, so it looks broken.
   - "Project Setup" section lists title/artist/production path/creative
     direction as "required inputs" with no visible input UI. These are
     actually auto-populated from the audio file's ID3 tags
     (`section_statuses.project_setup.status = "generated"`). Needs copy
     and/or UI treatment that makes clear these are auto-filled and
     editable/reviewable, not blank required fields.
   - "Song File" section copy is self-contradictory — lists "isolated vocal
     stem" as a required input alongside "original audio file," reads as
     an oxymoron. Needs a copy pass.

## Scope gap: there is no Lyric Video render path yet

This is the actual net-new build, distinct from the bug fixes above.

`production_path: "lyric"` currently only changes the label fed into the
creative-brief text for the LLM treatment generator
(`backend/workers/pipeline_worker.py: PRODUCTION_PATH_LABELS`). Every
project, regardless of path, still runs the full Cinematic stack: element
extraction → per-shot AI image generation → shot manifest → storyboard →
Ken Burns video assembly. There is no branch that skips this for a pure
Lyric Video project.

The good news: the hard part is already built and good.
`remotion-composer/src/LyricOverlay.tsx` is a working, well-built animated
caption component (fade + slide-in, proper typography, timed to
`durationInFrames`). It's just wired as a bonus layer inside `Panel`
(`MusicVideo.tsx`), which requires `panel.imageSrc` — an AI-generated
image — to exist at all. It was built as a garnish on the Cinematic
pipeline, never as a pipeline of its own.

### What Lyric Video v1 needs, concretely

1. **A minimal Remotion composition** (`remotion-composer/src/Root.tsx` +
   new component, e.g. `LyricVideo.tsx`) that takes audio + the aligned/
   transcribed segment list and renders `LyricOverlay` sequences over a
   simple background — solid color, gradient, or a single static image —
   with **zero** dependency on `Panel`, per-shot images, element
   extraction, or shot manifest. Reuses `LyricOverlay.tsx` as-is.
2. **A backend render/assembly step** that, for `production_path == "lyric"`
   (and no second combined path selected), builds the timeline data this
   composition needs directly from the approved transcript/segments —
   skipping treatment → element plan → element images → shot manifest →
   storyboard entirely. This is the actual "composable module" toggle
   decision-log.md proposed: the project's path selection should determine
   which workbook stages even run, not just which prompt text gets used.
3. **Workbook UI changes**: for a pure Lyric Video project, the guided flow
   should not show/require Treatment, Element Plan, Element Images, Shot
   Manifest, or Storyboard Images sections at all. Base Video should be the
   next gated step after Lyrics is approved. This is a real UX change, not
   just backend routing — a Lyric Video user should never see "Generate
   Element Plan" as a required step.
4. **Background choice**: decide and implement what a Lyric Video's visual
   background actually is for v1 — flat color/gradient (simplest, ship
   first), a single AI-generated background image (one Cloudflare image
   gen call, still far cheaper than per-shot generation), or a
   waveform/spectrum visualizer. Recommend starting with solid
   color/gradient (zero image-gen cost, zero new failure surface) and
   treating a background image as a v1.1 enhancement once the caption
   rendering itself is proven end-to-end.

## Suggested build order (respects "one step at a time, verify before moving on")

1. Fix bug #2 (blocking server) first — it's the one actively breaking
   testing right now and affects every path, not just Lyric Video.
   Verify: run vocal isolation, confirm `/health` stays responsive
   throughout, confirm the frontend shows real progress instead of a
   timeout/error.
2. Fix bug #1 (wire `align-lyrics`) — verify: create a project with pasted
   lyrics, confirm the guided flow calls `align-lyrics` not
   `transcribe-lyrics`, confirm the resulting transcript looks right.
3. Build the standalone Lyric Video composition (solid color/gradient
   background) — verify: a Lyric Video project can go
   upload → vocals → lyrics (aligned) → approve → base video, output a
   real video with synced captions, without ever touching element/shot/
   storyboard code paths.
4. Wire the workbook UI to hide non-applicable stages for a pure Lyric
   Video project.
5. UI feedback/copy fixes (bug #3) — can happen in parallel with any of
   the above, lowest risk.
6. Only after 1–4 are verified working end-to-end: move to Karaoke Video
   (same module, add word-level timing/highlight preset per decision-log's
   framing) and update `docs/agent-handoff.md` + this file's Status section.

## Explicitly out of scope for this plan

- Modal / lip-sync (preserve free-tier budget until there's an approved
  base video to sync)
- Karaoke word-highlight precision mode
- Performance Music Video (either AI-performer or uploaded-footage mode)
- Any change to the Cinematic Music Video path's existing behavior
- The two stale `backend/htxpunk.db` / `backend/voodoo.db` files sitting in
  `backend/` — confirmed harmless (config.py/.env correctly point at the
  canonical `~/.htxpunk-mv-generator/storage/htxpunk.db`), but worth a
  cleanup pass eventually so they don't confuse someone later.
