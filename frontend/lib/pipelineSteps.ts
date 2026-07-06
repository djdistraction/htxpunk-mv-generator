// Single source of truth for the audio-analysis loading screen's step list —
// shared between /projects/new (client-side essentia.js steps 1-3, before a
// project exists) and /projects/[id]/processing (server-side steps 4-8,
// polled via project.processing_step). Keeping one array means the two
// pages' progress bars land on the same percentages instead of drifting.
export const AUDIO_PIPELINE_STEPS = [
  'Extracting BPM',
  'Timestamping beat grid',
  'Extracting Key signature',
  'Converting to .mp3',
  'Extracting Meta Tags',
  'Isolating Vocal Stems',
  'Transcribing Lyrics',
  'Loading Results',
] as const

export function stepProgress(index: number): number {
  return Math.round(((index + 1) / AUDIO_PIPELINE_STEPS.length) * 100)
}

// Maps the backend's `processing_step` string (set by run_audio_preprocessing)
// to an index into AUDIO_PIPELINE_STEPS. Falls back to the first server-side
// step if the value is missing/unrecognized (e.g. right after upload, before
// the worker's first update lands).
export function serverStepIndex(processingStep?: string | null): number {
  const idx = AUDIO_PIPELINE_STEPS.findIndex(s => s === processingStep)
  return idx >= 0 ? idx : 3
}
