/**
 * Linear, single-next-action guide for pure Lyric Video projects.
 * Keeps the user on one clear step instead of a free-form multi-gate workbook.
 */

export type GuideAction = {
  label: string
  run?: string
  href?: string
  confirm?: string
}

export type GuideStepState = 'done' | 'current' | 'upcoming' | 'running' | 'failed'

export type GuideStep = {
  id: string
  number: number
  title: string
  description: string
  state: GuideStepState
  detail?: string
  action?: GuideAction
  approveKey?: string
}

function hasTranscript(project: any): boolean {
  return Array.isArray(project?.transcript?.segments) && project.transcript.segments.length > 0
}

function beatCount(project: any): number {
  return Array.isArray(project?.beat_grid) ? project.beat_grid.length : 0
}

function sectionStatus(project: any, key: string): string | undefined {
  return project?.section_statuses?.[key]?.status
}

function isApproved(project: any, key: string, legacy = false): boolean {
  const s = sectionStatus(project, key)
  if (s) return s === 'approved'
  return legacy
}

export function buildLyricLinearGuide(project: any): {
  steps: GuideStep[]
  currentIndex: number
  progress: number
  headline: string
  instruction: string
} {
  const stage = project?.stage || ''
  const hasAudio = Boolean(project?.audio_url)
  const rhythmReady = Boolean(project?.bpm || project?.musical_key || beatCount(project) > 0)
  const rhythmApproved = isApproved(project, 'rhythm_key', rhythmReady)
  const audioPrepared = Boolean(project?.converted_audio_url) || [
    'audio_prepared', 'metadata_ready', 'vocals_ready', 'awaiting_project_info_review',
    'info_confirmed', 'assembling_lyric_video', 'base_video_ready', 'complete',
  ].includes(stage) || Boolean(project?.song_length)
  const metadataReady = Boolean(project?.song_length || project?.album || project?.composer) ||
    ['metadata_ready', 'vocals_ready', 'awaiting_project_info_review', 'info_confirmed', 'assembling_lyric_video', 'base_video_ready', 'complete'].includes(stage)
  const vocalsReady = Boolean(project?.user_vocals_url) ||
    ['vocals_ready', 'awaiting_project_info_review', 'info_confirmed', 'assembling_lyric_video', 'base_video_ready', 'complete'].includes(stage)
  const lyricsReady = hasTranscript(project)
  const lyricsApproved = isApproved(project, 'lyrics', lyricsReady)
  const setupApproved = isApproved(project, 'project_setup', stage === 'info_confirmed' || stage === 'assembling_lyric_video' || stage === 'base_video_ready' || stage === 'complete')
  const awaitingReview = stage === 'awaiting_project_info_review'
  const infoConfirmed = setupApproved || stage === 'info_confirmed' || stage === 'assembling_lyric_video' || stage === 'base_video_ready' || stage === 'complete'
  const rendering = stage === 'assembling_lyric_video' || sectionStatus(project, 'final_video') === 'running'
  const videoReady = Boolean(project?.base_video_url || project?.video_url) || stage === 'base_video_ready' || stage === 'complete'
  const finalApproved = isApproved(project, 'final_video', stage === 'complete' || Boolean(project?.final_video_url))
  const failed = stage === 'error' || sectionStatus(project, 'final_video') === 'failed'
  const errorText = project?.error_message || project?.section_statuses?.final_video?.error || ''

  // --- Build ordered steps; only ONE is "current" ---
  const steps: GuideStep[] = []

  // 1. Song
  steps.push({
    id: 'song',
    number: 1,
    title: 'Song file',
    description: 'Your uploaded song is the source audio for the lyric video.',
    state: hasAudio ? 'done' : 'current',
    detail: hasAudio
      ? (project.audio_url?.split('/').pop() || 'Uploaded')
      : 'Upload a song from New Project.',
    action: hasAudio ? undefined : { label: 'New Project', href: '/projects/new' },
  })

  // 2. Rhythm
  let rhythmState: GuideStepState = 'upcoming'
  if (!hasAudio) rhythmState = 'upcoming'
  else if (rhythmApproved) rhythmState = 'done'
  else if (rhythmReady) rhythmState = 'current'
  else rhythmState = 'current'
  steps.push({
    id: 'rhythm',
    number: 2,
    title: 'Rhythm & key',
    description: 'Detect tempo (BPM) and musical key so timing is grounded in the song.',
    state: rhythmState,
    detail: rhythmReady
      ? `BPM: ${project.bpm || '—'} · Key: ${project.musical_key || '—'} · Beats: ${beatCount(project)}`
      : 'Run analysis once, then Approve.',
    action: !rhythmReady && hasAudio
      ? { label: 'Run rhythm & key analysis', run: 'analyze-rhythm-key' }
      : rhythmReady && !rhythmApproved
        ? { label: 'Approve rhythm & key', run: 'approve:rhythm_key' }
        : undefined,
    approveKey: rhythmReady && !rhythmApproved ? 'rhythm_key' : undefined,
  })

  // 3. Audio + lyrics pipeline (one step, sub-status)
  let lyricsState: GuideStepState = 'upcoming'
  let lyricsDetail = 'Runs after rhythm is approved.'
  let lyricsAction: GuideAction | undefined
  if (rhythmApproved) {
    if (lyricsApproved || (lyricsReady && infoConfirmed)) {
      lyricsState = 'done'
      lyricsDetail = `Transcript ready · ${project.transcript.segments.length} segments`
    } else if (lyricsReady) {
      lyricsState = 'done'
      lyricsDetail = `Transcript ready · ${project.transcript.segments.length} segments — continue to Confirm.`
    } else if (!audioPrepared) {
      lyricsState = 'current'
      lyricsDetail = 'Step 3a: convert the song to project audio.'
      lyricsAction = { label: 'Prepare audio', run: 'prepare-audio' }
    } else if (!metadataReady) {
      lyricsState = 'current'
      lyricsDetail = 'Step 3b: read ID3 tags / duration.'
      lyricsAction = { label: 'Read metadata', run: 'read-metadata' }
    } else if (!vocalsReady) {
      lyricsState = 'current'
      lyricsDetail = 'Step 3c: isolate vocals (often several minutes — leave this page open).'
      lyricsAction = { label: 'Prepare vocal stem', run: 'isolate-vocals' }
    } else {
      lyricsState = 'current'
      const useAlign = Boolean(project.user_lyrics_text)
      lyricsDetail = useAlign
        ? 'Step 3d: force-align your pasted lyrics to the vocal stem.'
        : 'Step 3d: transcribe lyrics with Whisper (slower / less accurate than pasted lyrics).'
      lyricsAction = useAlign
        ? { label: 'Align my lyrics', run: 'align-lyrics' }
        : { label: 'Transcribe lyrics', run: 'transcribe-lyrics' }
    }
  }
  steps.push({
    id: 'lyrics',
    number: 3,
    title: 'Audio prep & lyrics',
    description: 'Prepare project audio, optional vocal stem, then timestamped lyrics.',
    state: lyricsState,
    detail: lyricsDetail,
    action: lyricsAction,
  })

  // 4. Confirm
  let confirmState: GuideStepState = 'upcoming'
  let confirmAction: GuideAction | undefined
  if (lyricsReady || lyricsApproved) {
    if (infoConfirmed) {
      confirmState = 'done'
    } else if (awaitingReview) {
      confirmState = 'current'
      confirmAction = { label: 'Open review & confirm', href: 'review' }
    } else {
      // Lyrics exist but stage not awaiting — still send them to review if possible
      confirmState = 'current'
      confirmAction = { label: 'Open review & confirm', href: 'review' }
    }
  }
  steps.push({
    id: 'confirm',
    number: 4,
    title: 'Confirm project details',
    description: 'Check title, path (Lyric Video), and transcript. Optional: brief and references. Then Confirm & Continue.',
    state: confirmState,
    detail: infoConfirmed
      ? 'Confirmed.'
      : awaitingReview || lyricsReady
        ? 'This is the only place you edit title / artist / path — not on the locked Project Setup list.'
        : 'Unlocks after lyrics are ready.',
    action: confirmAction,
  })

  // 5. Generate
  let genState: GuideStepState = 'upcoming'
  let genAction: GuideAction | undefined
  let genDetail = 'Unlocks after you confirm project details.'
  if (failed && !videoReady) {
    genState = 'failed'
    genDetail = errorText
      ? `Render failed: ${errorText}`
      : 'Render failed. Fix the error below, then retry generation.'
    if (infoConfirmed) {
      genAction = {
        label: 'Retry generate lyric video',
        run: 'generate-lyric-video',
        confirm: 'Retry lyric video generation? Needs remotion-composer (npm install) and Node on PATH.',
      }
    }
  } else if (rendering) {
    genState = 'running'
    genDetail = 'Remotion is rendering… this can take several minutes. Stay on this page or open Production.'
    genAction = { label: 'Open Production (watch)', href: 'production' }
  } else if (videoReady) {
    genState = 'done'
    genDetail = 'Video file generated.'
  } else if (infoConfirmed) {
    genState = 'current'
    genDetail = 'Builds a timed lyric video with Remotion (no AI image cost). Requires remotion-composer npm install once.'
    genAction = {
      label: 'Generate lyric video',
      run: 'generate-lyric-video',
      confirm: 'Generate the Lyric Video from the approved transcript now?',
    }
  }
  steps.push({
    id: 'generate',
    number: 5,
    title: 'Generate lyric video',
    description: 'Render the full-length lyric video from audio + timestamps.',
    state: genState,
    detail: genDetail,
    action: genAction,
  })

  // 6. Final
  let finalState: GuideStepState = 'upcoming'
  let finalAction: GuideAction | undefined
  if (finalApproved) {
    finalState = 'done'
  } else if (videoReady) {
    finalState = 'current'
    finalAction = { label: 'Review video & approve final', href: 'production' }
  }
  steps.push({
    id: 'final',
    number: 6,
    title: 'Review & approve final',
    description: 'Watch the result, download MP4, then Approve Final to mark the project complete.',
    state: finalState,
    detail: finalApproved
      ? 'Final export approved.'
      : videoReady
        ? 'Open Production to play, download, and approve.'
        : 'Unlocks after a successful render.',
    action: finalAction,
  })

  // Ensure only one "current" — first non-done/upcoming priority
  let foundCurrent = false
  for (const step of steps) {
    if (step.state === 'running' || step.state === 'failed') {
      foundCurrent = true
      continue
    }
    if (step.state === 'current') {
      if (foundCurrent) step.state = 'upcoming'
      else foundCurrent = true
    }
  }
  if (!foundCurrent) {
    const firstUp = steps.find(s => s.state === 'upcoming')
    if (firstUp) firstUp.state = 'current'
  }

  const currentIndex = Math.max(0, steps.findIndex(s => s.state === 'current' || s.state === 'running' || s.state === 'failed'))
  const doneCount = steps.filter(s => s.state === 'done').length
  const progress = Math.round((doneCount / steps.length) * 100)
  const current = steps[currentIndex]

  let headline = `Step ${current.number} of ${steps.length}: ${current.title}`
  let instruction = current.detail || current.description
  if (finalApproved) {
    headline = 'Lyric Video complete'
    instruction = 'Final export is approved. You can download it from Production anytime.'
  } else if (rendering) {
    headline = 'Rendering lyric video…'
    instruction = 'Please wait. Remotion needs Node + remotion-composer dependencies.'
  } else if (failed && errorText) {
    headline = 'Generation failed'
    instruction = errorText
  }

  return { steps, currentIndex, progress, headline, instruction }
}
