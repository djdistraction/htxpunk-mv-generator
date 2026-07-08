'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api, mediaUrl } from '@/lib/api'
import { analyzeAudioFile } from '@/lib/audioAnalysis'

const STAGE_LABELS: Record<string, string> = {
  audio_uploaded: 'Song uploaded',
  rhythm_key_analyzed: 'Rhythm and key analyzed',
  audio_prepared: 'Project audio prepared',
  metadata_ready: 'Metadata ready',
  vocals_ready: 'Vocal stem ready',
  uploaded: 'Uploaded',
  preprocessing_audio: 'Preprocessing audio',
  awaiting_project_info_review: 'Review extracted song info',
  info_confirmed: 'Saved. Starting analysis',
  interpreting_song: 'Interpreting song',
  analyzed: 'Analysis complete',
  treatment_pending: 'Generating creative vision',
  awaiting_treatment_approval: 'Creative vision ready',
  treatment_approved: 'Treatment approved',
  extracting_elements: 'Designing visual elements',
  elements_ready: 'Elements designed',
  generating_images: 'Generating images',
  images_ready: 'Images ready',
  awaiting_manifest_approval: 'Production plan ready for review',
  building_storyboard: 'Building storyboard',
  awaiting_storyboard_approval: 'Storyboard ready for review',
  storyboard_approved: 'Storyboard approved',
  assembling: 'Assembling video',
  complete: 'Music video ready',
  error: 'Something went wrong',
}

const APPROVAL_LINKS: Record<string, { label: string; href: string }> = {
  awaiting_project_info_review: { label: 'Review Song Info', href: 'review' },
  awaiting_treatment_approval: { label: 'Review Creative Vision', href: 'treatment' },
  awaiting_manifest_approval: { label: 'Review Production Plan', href: 'manifest' },
  awaiting_storyboard_approval: { label: 'Review Storyboard', href: 'storyboard' },
}

const STAGE_ORDER = [
  'audio_uploaded', 'rhythm_key_analyzed', 'audio_prepared', 'metadata_ready', 'vocals_ready',
  'awaiting_project_info_review', 'info_confirmed', 'interpreting_song', 'analyzed',
  'treatment_pending', 'awaiting_treatment_approval', 'treatment_approved',
  'extracting_elements', 'elements_ready', 'generating_images', 'images_ready',
  'awaiting_manifest_approval', 'building_storyboard', 'awaiting_storyboard_approval',
  'storyboard_approved', 'assembling', 'complete',
]

type GuidedStep = {
  key: string
  label: string
  description: string
  runLabel?: string
}

const GUIDED_STEPS: GuidedStep[] = [
  {
    key: 'upload-song',
    label: 'Upload Song',
    description: 'Save the original source file and create the project record.',
  },
  {
    key: 'analyze-rhythm-key',
    label: 'Analyze Rhythm & Key',
    description: 'Detect BPM, timestamp the beat grid, and identify the musical key in one pass.',
    runLabel: 'Run Analysis',
  },
  {
    key: 'prepare-audio',
    label: 'Prepare Project Audio',
    description: 'Copy an existing MP3 or convert WAV/MP4 to the canonical project MP3.',
    runLabel: 'Prepare Audio',
  },
  {
    key: 'read-metadata',
    label: 'Read Metadata Tags',
    description: 'Read title, artist, album, composer, and measured song length from the prepared MP3.',
    runLabel: 'Read Tags',
  },
  {
    key: 'isolate-vocals',
    label: 'Isolate Vocal Stem',
    description: 'Use a supplied vocal stem or generate one from the prepared project audio.',
    runLabel: 'Isolate Vocals',
  },
  {
    key: 'transcribe-lyrics',
    label: 'Transcribe & Timestamp Lyrics',
    description: 'Create the lyric transcript with timing data for later shot planning.',
    runLabel: 'Transcribe Lyrics',
  },
  {
    key: 'review-info',
    label: 'Review Song Info',
    description: 'Confirm title, artist, transcript, creative brief, references, and series settings.',
  },
]

function stageIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage)
  return idx >= 0 ? idx : -1
}

function isAtOrAfter(project: any, stage: string): boolean {
  const current = stageIndex(project.stage)
  const target = stageIndex(stage)
  return current >= 0 && target >= 0 && current >= target
}

function beatCount(project: any): number {
  return Array.isArray(project?.beat_grid) ? project.beat_grid.length : 0
}

function transcriptSegments(project: any): number {
  return Array.isArray(project?.transcript?.segments) ? project.transcript.segments.length : 0
}

function stepComplete(project: any, key: string): boolean {
  switch (key) {
    case 'upload-song':
      return Boolean(project.audio_url)
    case 'analyze-rhythm-key':
      return Boolean(project.bpm || project.musical_key || beatCount(project) > 0 || isAtOrAfter(project, 'rhythm_key_analyzed'))
    case 'prepare-audio':
      return Boolean(project.converted_audio_url || isAtOrAfter(project, 'audio_prepared'))
    case 'read-metadata':
      return Boolean(project.song_length || project.composer || project.album || isAtOrAfter(project, 'metadata_ready'))
    case 'isolate-vocals':
      return Boolean(isAtOrAfter(project, 'vocals_ready'))
    case 'transcribe-lyrics':
      return Boolean(project.transcript || isAtOrAfter(project, 'awaiting_project_info_review'))
    case 'review-info':
      return isAtOrAfter(project, 'info_confirmed') || isAtOrAfter(project, 'awaiting_project_info_review')
    default:
      return false
  }
}

function stepResult(project: any, key: string): string {
  switch (key) {
    case 'upload-song':
      return project.audio_url ? project.audio_url.split('/').pop() || 'Audio saved' : 'No audio uploaded yet.'
    case 'analyze-rhythm-key':
      if (!stepComplete(project, key)) return 'Waiting to run.'
      return `BPM: ${project.bpm || 'unknown'} · Key: ${project.musical_key || 'unknown'} · Beats: ${beatCount(project)}`
    case 'prepare-audio':
      if (!stepComplete(project, key)) return 'Waiting to run.'
      return project.processing_step?.includes('MP3') || project.processing_step?.includes('converted')
        ? project.processing_step
        : 'Project MP3 ready.'
    case 'read-metadata':
      if (!stepComplete(project, key)) return 'Waiting to run.'
      return `Length: ${project.song_length || 'unknown'} · Composer: ${project.composer || 'none'} · Album: ${project.album || 'none'}`
    case 'isolate-vocals':
      if (!stepComplete(project, key)) return 'Waiting to run.'
      return project.user_vocals_url ? 'User-provided vocal stem available.' : 'Generated vocal stem available.'
    case 'transcribe-lyrics':
      if (!stepComplete(project, key)) return 'Waiting to run.'
      return `Transcript ready · Segments: ${transcriptSegments(project)}`
    case 'review-info':
      return project.stage === 'awaiting_project_info_review'
        ? 'Ready for review.'
        : isAtOrAfter(project, 'info_confirmed')
          ? 'Song info confirmed.'
          : 'Waiting for transcript.'
    default:
      return ''
  }
}

export default function ProjectDetail({ id }: { id: string }) {
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [runningStep, setRunningStep] = useState<string | null>(null)
  const [localError, setLocalError] = useState('')

  const fetchProject = async () => {
    try {
      const data = await api.projects.get(id)
      setProject(data)
    } catch (err) {
      setProject(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProject()
    const interval = setInterval(fetchProject, project?.stage === 'complete' || project?.stage === 'error' ? 30000 : 5000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, project?.stage])

  const currentGuidedStep = useMemo(() => {
    if (!project) return null
    return GUIDED_STEPS.find(step => !stepComplete(project, step.key)) || null
  }, [project])

  const refreshFromResponse = async (data: any) => {
    if (data?.project) {
      setProject(data.project)
    } else if (data?.id) {
      setProject(data)
    } else {
      await fetchProject()
    }
  }

  const runGuidedStep = async (stepKey: string) => {
    if (!project || runningStep) return
    setLocalError('')
    setRunningStep(stepKey)
    try {
      if (stepKey === 'analyze-rhythm-key') {
        const response = await fetch(mediaUrl(project.audio_url))
        if (!response.ok) throw new Error(`Could not load source audio (${response.status})`)
        const blob = await response.blob()
        const filename = project.audio_url?.split('/').pop() || 'source-audio.mp3'
        const file = new File([blob], filename, { type: blob.type || 'audio/mpeg' })
        const result = await analyzeAudioFile(file)
        if (!result) throw new Error('Browser rhythm/key analysis did not return a result.')
        const data = await api.projects.saveRhythmKey(id, {
          bpm: result.bpm,
          musical_key: result.musicalKey,
          beat_grid: result.beatGrid,
        })
        await refreshFromResponse(data)
      } else if (stepKey === 'prepare-audio') {
        await refreshFromResponse(await api.projects.prepareAudio(id))
      } else if (stepKey === 'read-metadata') {
        await refreshFromResponse(await api.projects.readMetadata(id))
      } else if (stepKey === 'isolate-vocals') {
        await refreshFromResponse(await api.projects.isolateVocals(id))
      } else if (stepKey === 'transcribe-lyrics') {
        await refreshFromResponse(await api.projects.transcribeLyrics(id))
      }
    } catch (err: any) {
      setLocalError(err?.response?.data?.detail || err?.message || 'Step failed.')
      await fetchProject()
    } finally {
      setRunningStep(null)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      Loading...
    </div>
  )
  if (!project) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      Project not found
    </div>
  )

  const currentIndex = stageIndex(project.stage)
  const approval = APPROVAL_LINKS[project.stage]
  const completedGuided = GUIDED_STEPS.filter(step => stepComplete(project, step.key)).length
  const overallProgress = Math.round((completedGuided / GUIDED_STEPS.length) * 100)

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <a href="/" className="text-purple-400 text-sm hover:underline">← All projects</a>

        <div className="mt-6 mb-8">
          <h1 className="text-3xl font-bold">{project.title}</h1>
          {project.artist && <p className="text-gray-400 mt-1">{project.artist}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              project.stage === 'complete' ? 'bg-green-900 text-green-300' :
              project.stage === 'error' ? 'bg-red-900 text-red-300' :
              project.stage.includes('awaiting') ? 'bg-yellow-900 text-yellow-300' :
              'bg-purple-900 text-purple-300'
            }`}>
              {STAGE_LABELS[project.stage] || project.stage}
            </span>
            {approval && (
              <Link
                href={`/projects/${id}/${approval.href}`}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-1 rounded-full text-sm font-semibold transition-colors"
              >
                {approval.label}
              </Link>
            )}
          </div>
        </div>

        <div className="mb-8 bg-gray-900 rounded-xl p-5 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Guided Production Steps</h2>
            <span className="text-sm text-gray-500">{completedGuided}/{GUIDED_STEPS.length} complete</span>
          </div>
          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-5">
            <div className="h-full bg-purple-600" style={{ width: `${overallProgress}%` }} />
          </div>

          <div className="space-y-3">
            {GUIDED_STEPS.map((step, index) => {
              const complete = stepComplete(project, step.key)
              const current = currentGuidedStep?.key === step.key
              const running = runningStep === step.key
              const failed = current && Boolean(project.error_message || localError)
              const canRun = current && step.runLabel && !runningStep
              return (
                <div key={step.key} className={`border rounded-lg p-4 ${current ? 'border-yellow-600 bg-yellow-900/10' : 'border-gray-800 bg-black/20'}`}>
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-xs text-gray-500 w-6">{index + 1}.</span>
                        <h3 className="font-semibold text-gray-100">{step.label}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          running ? 'bg-blue-900 text-blue-300' :
                          failed ? 'bg-red-900 text-red-300' :
                          complete ? 'bg-green-900 text-green-300' :
                          current ? 'bg-yellow-900 text-yellow-300' :
                          'bg-gray-800 text-gray-500'
                        }`}>
                          {running ? 'Running' : failed ? 'Failed' : complete ? 'Complete' : current ? 'Ready' : 'Pending'}
                        </span>
                      </div>
                      <p className="text-gray-500 text-sm mb-2">{step.description}</p>
                      <p className="text-gray-300 text-sm font-mono break-words">{stepResult(project, step.key)}</p>
                      {failed && (
                        <p className="text-red-300 text-sm font-mono whitespace-pre-wrap break-words mt-2">
                          {localError || project.error_message}
                        </p>
                      )}
                    </div>

                    <div className="flex-shrink-0">
                      {step.key === 'review-info' && project.stage === 'awaiting_project_info_review' ? (
                        <Link href={`/projects/${id}/review`} className="inline-block bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                          Review Song Info
                        </Link>
                      ) : canRun ? (
                        <button
                          onClick={() => runGuidedStep(step.key)}
                          disabled={Boolean(runningStep)}
                          className="px-4 py-2 rounded-lg border border-gray-700 text-gray-200 hover:border-yellow-600 transition disabled:opacity-50"
                        >
                          {step.runLabel}
                        </button>
                      ) : running ? (
                        <button disabled className="px-4 py-2 rounded-lg border border-gray-700 text-gray-500 opacity-70">
                          Working...
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Legacy/automatic pipeline progress after song-info review */}
        {currentIndex >= stageIndex('info_confirmed') && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold mb-3">Creative Generation Pipeline</h2>
            <div className="flex items-center gap-0 overflow-x-auto pb-2">
              {STAGE_ORDER.filter(s => !['audio_uploaded', 'rhythm_key_analyzed', 'audio_prepared', 'metadata_ready', 'vocals_ready'].includes(s)).map((stage, i, arr) => {
                const idx = STAGE_ORDER.indexOf(stage)
                const done = idx < currentIndex
                const active = stage === project.stage
                return (
                  <div key={stage} className="flex items-center">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${done ? 'bg-purple-500' : active ? 'bg-yellow-400' : 'bg-gray-700'}`} title={STAGE_LABELS[stage]} />
                    {i < arr.length - 1 && <div className={`w-8 h-0.5 ${done ? 'bg-purple-500' : 'bg-gray-700'}`} />}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {project.treatment && (
          <div className="mb-6 bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h2 className="text-lg font-semibold mb-3">Visual Treatment</h2>
            <p className="text-gray-300 text-sm mb-3 italic">"{project.treatment.logline}"</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Style</span>
                <p className="text-gray-200">{project.treatment.visual_style}</p>
              </div>
              <div>
                <span className="text-gray-500">Color Palette</span>
                <p className="text-gray-200">{project.treatment.color_palette?.join(', ')}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Treatment', href: 'treatment', stages: ['awaiting_treatment_approval'] },
            { label: 'Manifest', href: 'manifest', stages: ['awaiting_manifest_approval'] },
            { label: 'Elements', href: 'elements', stages: ['elements_ready', 'generating_images', 'images_ready', 'building_storyboard', 'awaiting_storyboard_approval', 'storyboard_approved', 'assembling', 'complete'] },
            { label: 'Storyboard', href: 'storyboard', stages: ['awaiting_storyboard_approval', 'storyboard_approved', 'assembling', 'complete'] },
            { label: 'Production', href: 'production', stages: ['assembling', 'complete'] },
          ].map(link => {
            const enabled = link.stages.includes(project.stage)
            return enabled ? (
              <Link key={link.href} href={`/projects/${id}/${link.href}`} className="bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg p-4 text-center transition-colors">
                <span className="text-gray-200 font-medium">{link.label}</span>
              </Link>
            ) : (
              <div key={link.href} className="bg-gray-900/40 border border-gray-800 rounded-lg p-4 text-center opacity-40 cursor-not-allowed">
                <span className="text-gray-500 font-medium">{link.label}</span>
              </div>
            )
          })}
        </div>

        {project.stage === 'error' && project.error_message && (
          <div className="mt-6 bg-red-900/30 border border-red-700 rounded-lg p-4 space-y-3">
            <div>
              <h3 className="text-red-300 font-semibold mb-1">Pipeline Error</h3>
              <p className="text-red-400 text-sm font-mono whitespace-pre-wrap break-words">{project.error_message}</p>
            </div>
          </div>
        )}

        <p className="text-gray-600 text-xs mt-8">
          Project ID: {project.id} · Auto-refreshes every 5s
        </p>
      </div>
    </div>
  )
}
