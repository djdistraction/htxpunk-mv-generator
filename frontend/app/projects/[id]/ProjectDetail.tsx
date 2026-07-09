'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api, mediaUrl } from '@/lib/api'
import { analyzeAudioFile } from '@/lib/audioAnalysis'

type SectionStatus = 'empty' | 'locked' | 'ready' | 'running' | 'generated' | 'approved' | 'failed'

type WorkbookSection = {
  key: string
  number: number
  title: string
  purpose: string
  status: SectionStatus
  required: string[]
  output: string
  needs?: string
  warning?: string
  primaryAction?: {
    label: string
    href?: string
    run?: string
    confirm?: string
  }
  secondaryAction?: {
    label: string
    href: string
  }
}

const STAGE_LABELS: Record<string, string> = {
  audio_uploaded: 'Song uploaded',
  rhythm_key_analyzed: 'Rhythm and key analyzed',
  audio_prepared: 'Project audio prepared',
  metadata_ready: 'Metadata ready',
  vocals_ready: 'Vocal stem ready',
  uploaded: 'Uploaded',
  preprocessing_audio: 'Preprocessing audio',
  awaiting_project_info_review: 'Review extracted song info',
  info_confirmed: 'Song info approved',
  interpreting_song: 'Interpreting song',
  analyzed: 'Song analysis generated',
  treatment_pending: 'Generating treatment',
  awaiting_treatment_approval: 'Treatment ready for review',
  treatment_approved: 'Treatment approved',
  extracting_elements: 'Generating element plan',
  elements_ready: 'Element plan generated',
  generating_images: 'Generating element images',
  images_ready: 'Element images generated',
  awaiting_manifest_approval: 'Shot manifest ready for review',
  manifest_approved: 'Shot manifest approved',
  generating_manifest_images: 'Generating storyboard images',
  building_storyboard: 'Building storyboard images',
  awaiting_storyboard_approval: 'Storyboard images ready for review',
  storyboard_approved: 'Storyboard approved',
  assembling: 'Generating base video',
  complete: 'Video output generated',
  error: 'Something went wrong',
}

const STAGE_ORDER = [
  'audio_uploaded',
  'rhythm_key_analyzed',
  'audio_prepared',
  'metadata_ready',
  'vocals_ready',
  'awaiting_project_info_review',
  'info_confirmed',
  'interpreting_song',
  'analyzed',
  'treatment_pending',
  'awaiting_treatment_approval',
  'treatment_approved',
  'extracting_elements',
  'elements_ready',
  'generating_images',
  'images_ready',
  'awaiting_manifest_approval',
  'manifest_approved',
  'generating_manifest_images',
  'building_storyboard',
  'awaiting_storyboard_approval',
  'storyboard_approved',
  'assembling',
  'complete',
]

type GuidedStep = {
  key: string
  runLabel: string
}

const GUIDED_RUN_STEPS: Record<string, GuidedStep> = {
  rhythm_key: { key: 'analyze-rhythm-key', runLabel: 'Run rhythm/key analysis' },
  audio_prepare: { key: 'prepare-audio', runLabel: 'Prepare audio' },
  metadata: { key: 'read-metadata', runLabel: 'Read metadata' },
  vocals: { key: 'isolate-vocals', runLabel: 'Prepare vocal stem' },
  lyrics: { key: 'transcribe-lyrics', runLabel: 'Transcribe lyrics' },
}

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

function hasTranscript(project: any): boolean {
  return transcriptSegments(project) > 0 || Boolean(project?.transcript)
}

function countElements(project: any): number {
  const elements = project?.elements || {}
  return (
    (elements.backgrounds?.length || 0) +
    (elements.characters?.length || 0) +
    (elements.props?.length || 0)
  )
}

function statusClass(status: SectionStatus): string {
  switch (status) {
    case 'approved':
      return 'bg-green-950 text-green-300 border-green-800'
    case 'generated':
      return 'bg-blue-950 text-blue-300 border-blue-800'
    case 'ready':
      return 'bg-yellow-950 text-yellow-300 border-yellow-800'
    case 'running':
      return 'bg-purple-950 text-purple-300 border-purple-800'
    case 'failed':
      return 'bg-red-950 text-red-300 border-red-800'
    case 'locked':
      return 'bg-gray-900 text-gray-500 border-gray-800'
    default:
      return 'bg-gray-950 text-gray-400 border-gray-800'
  }
}

function prettyStatus(status: SectionStatus): string {
  return status[0].toUpperCase() + status.slice(1)
}

function isGuidedStepReady(project: any, stepKey: string): boolean {
  switch (stepKey) {
    case 'analyze-rhythm-key':
      return Boolean(project.audio_url) && !project.bpm && beatCount(project) === 0
    case 'prepare-audio':
      return Boolean(project.audio_url) && !project.converted_audio_url
    case 'read-metadata':
      return Boolean(project.converted_audio_url) && !project.song_length
    case 'isolate-vocals':
      return Boolean(project.converted_audio_url) && !isAtOrAfter(project, 'vocals_ready')
    case 'transcribe-lyrics':
      return isAtOrAfter(project, 'vocals_ready') && !hasTranscript(project)
    default:
      return false
  }
}

function buildWorkbookSections(project: any): WorkbookSection[] {
  const rhythmReady = Boolean(project.bpm || project.musical_key || beatCount(project) > 0)
  const audioReady = Boolean(project.converted_audio_url || isAtOrAfter(project, 'audio_prepared'))
  const metadataReady = Boolean(project.song_length || project.composer || project.album || isAtOrAfter(project, 'metadata_ready'))
  const vocalsReady = Boolean(project.user_vocals_url || isAtOrAfter(project, 'vocals_ready'))
  const lyricsReady = hasTranscript(project)
  const infoApproved = isAtOrAfter(project, 'info_confirmed')
  const analysisReady = Boolean(project.analysis || isAtOrAfter(project, 'analyzed'))
  const treatmentReady = Boolean(project.treatment)
  const treatmentApproved = isAtOrAfter(project, 'treatment_approved')
  const elementPlanReady = countElements(project) > 0 || isAtOrAfter(project, 'elements_ready')
  const elementImagesReady = isAtOrAfter(project, 'images_ready')
  const manifestReady = isAtOrAfter(project, 'awaiting_manifest_approval') || isAtOrAfter(project, 'manifest_approved')
  const manifestApproved = isAtOrAfter(project, 'manifest_approved')
  const storyboardReady = isAtOrAfter(project, 'awaiting_storyboard_approval')
  const storyboardApproved = isAtOrAfter(project, 'storyboard_approved')
  const videoReady = Boolean(project.video_url) || project.stage === 'complete'

  return [
    {
      key: 'project_setup',
      number: 1,
      title: 'Project Setup',
      purpose: 'Confirm title, artist, creative brief, references, and series context.',
      status: infoApproved ? 'approved' : project.stage === 'awaiting_project_info_review' ? 'ready' : project.audio_url ? 'locked' : 'empty',
      required: ['title', 'artist or intentional blank', 'creative direction'],
      output: infoApproved ? 'Project setup approved.' : project.stage === 'awaiting_project_info_review' ? 'Extracted info is ready to review.' : 'Waiting for audio preparation and transcript.',
      needs: project.stage === 'awaiting_project_info_review' ? undefined : 'Lyrics and metadata ready for review',
      primaryAction: project.stage === 'awaiting_project_info_review'
        ? { label: 'Review setup', href: 'review' }
        : undefined,
    },
    {
      key: 'song_file',
      number: 2,
      title: 'Song File',
      purpose: 'Store the original song and optional vocal stem.',
      status: project.audio_url ? 'approved' : 'empty',
      required: ['original audio file', 'optional isolated vocal stem'],
      output: project.audio_url ? project.audio_url.split('/').pop() || 'Song file uploaded.' : 'No song file uploaded.',
      secondaryAction: { label: 'Replace from new-project flow', href: '/projects/new' },
    },
    {
      key: 'rhythm_key',
      number: 3,
      title: 'Rhythm / Key Analysis',
      purpose: 'Detect BPM, beat-grid timestamps, and musical key.',
      status: rhythmReady ? 'approved' : project.audio_url ? 'ready' : 'locked',
      required: ['song file'],
      output: rhythmReady ? `BPM: ${project.bpm || 'unknown'} | Key: ${project.musical_key || 'unknown'} | Beats: ${beatCount(project)}` : 'No rhythm/key result yet.',
      needs: project.audio_url ? undefined : 'Song File',
      primaryAction: isGuidedStepReady(project, 'analyze-rhythm-key')
        ? { label: GUIDED_RUN_STEPS.rhythm_key.runLabel, run: 'analyze-rhythm-key' }
        : undefined,
    },
    {
      key: 'lyrics',
      number: 4,
      title: 'Lyrics Transcription & Timestamping',
      purpose: 'Create lyric timing anchors that downstream shots must follow.',
      status: lyricsReady ? 'approved' : vocalsReady ? 'ready' : audioReady ? 'locked' : 'locked',
      required: ['prepared audio', 'vocal stem or full mix'],
      output: lyricsReady ? `Transcript ready | Segments: ${transcriptSegments(project)}` : 'No timestamped lyrics yet.',
      needs: lyricsReady || vocalsReady ? undefined : 'Prepared audio and vocal stem',
      primaryAction: isGuidedStepReady(project, 'prepare-audio')
        ? { label: GUIDED_RUN_STEPS.audio_prepare.runLabel, run: 'prepare-audio' }
        : isGuidedStepReady(project, 'read-metadata')
          ? { label: GUIDED_RUN_STEPS.metadata.runLabel, run: 'read-metadata' }
          : isGuidedStepReady(project, 'isolate-vocals')
            ? { label: GUIDED_RUN_STEPS.vocals.runLabel, run: 'isolate-vocals' }
            : isGuidedStepReady(project, 'transcribe-lyrics')
              ? { label: GUIDED_RUN_STEPS.lyrics.runLabel, run: 'transcribe-lyrics' }
              : undefined,
      secondaryAction: project.stage === 'awaiting_project_info_review'
        ? { label: 'Edit transcript', href: 'review' }
        : undefined,
    },
    {
      key: 'song_analysis',
      number: 5,
      title: 'Song Analysis',
      purpose: 'Use approved lyrics, rhythm, brief, and references to define sections, themes, emotional arc, and visual needs.',
      status: project.stage === 'interpreting_song' ? 'running' : analysisReady ? 'approved' : infoApproved ? 'ready' : 'locked',
      required: ['approved project setup', 'approved rhythm/key', 'approved timestamped lyrics'],
      output: analysisReady ? 'Song analysis generated and available for downstream creative work.' : 'No song analysis generated yet.',
      needs: infoApproved ? undefined : 'Approved Project Setup and Lyrics',
      primaryAction: project.stage === 'info_confirmed'
        ? { label: 'Run song analysis', run: 'run-song-analysis' }
        : undefined,
    },
    {
      key: 'treatment',
      number: 6,
      title: 'Treatment',
      purpose: 'Define the creative direction, visual rules, motifs, palette, and narrative structure.',
      status: project.stage === 'treatment_pending' ? 'running' : treatmentApproved ? 'approved' : treatmentReady ? 'generated' : analysisReady ? 'ready' : 'locked',
      required: ['approved song analysis', 'creative brief', 'references'],
      output: treatmentReady ? project.treatment?.logline || 'Treatment generated.' : 'No treatment generated yet.',
      needs: analysisReady ? undefined : 'Song Analysis',
      primaryAction: project.stage === 'analyzed'
        ? { label: 'Generate treatment', run: 'generate-treatment' }
        : project.stage === 'awaiting_treatment_approval'
          ? { label: 'Review treatment', href: 'treatment' }
          : undefined,
      secondaryAction: treatmentReady ? { label: 'Open treatment', href: 'treatment' } : undefined,
    },
    {
      key: 'element_plan',
      number: 7,
      title: 'Element Plan',
      purpose: 'Plan backgrounds, characters, props, motifs, and states before image tokens are spent.',
      status: project.stage === 'extracting_elements' ? 'running' : elementPlanReady ? 'approved' : treatmentApproved ? 'ready' : 'locked',
      required: ['approved song analysis', 'approved treatment'],
      output: elementPlanReady ? `${countElements(project)} planned element groups.` : 'No element plan generated yet.',
      needs: treatmentApproved ? undefined : 'Approved Treatment',
      warning: 'This step should only spend LLM tokens. It must not generate images.',
      primaryAction: project.stage === 'treatment_approved'
        ? { label: 'Generate element plan', run: 'generate-element-plan' }
        : undefined,
    },
    {
      key: 'element_images',
      number: 8,
      title: 'Element Images',
      purpose: 'Generate and review backgrounds, characters, props, and state images.',
      status: project.stage === 'generating_images' ? 'running' : elementImagesReady ? 'generated' : elementPlanReady ? 'ready' : 'locked',
      required: ['approved element plan'],
      output: elementImagesReady ? 'Element images generated. Review before storyboard planning.' : 'No element images generated yet.',
      needs: elementPlanReady ? undefined : 'Element Plan',
      warning: 'Token-cost warning: this will call the configured image backend. Stop here if the element plan is not right.',
      primaryAction: project.stage === 'elements_ready'
        ? {
            label: 'Generate element images',
            run: 'generate-element-images',
            confirm: 'Generate all planned element images now? This may spend image-generation tokens.',
          }
        : elementImagesReady
          ? { label: 'Review element images', href: 'elements' }
          : undefined,
      secondaryAction: elementImagesReady ? { label: 'Open elements', href: 'elements' } : undefined,
    },
    {
      key: 'shot_manifest',
      number: 9,
      title: 'Shot Manifest / Storyboard Plan',
      purpose: 'Create the shot-by-shot plan: timestamps, lyrics, action, camera, prompts, and negative prompts.',
      status: manifestApproved ? 'approved' : manifestReady ? 'generated' : elementImagesReady ? 'ready' : 'locked',
      required: ['approved lyrics', 'approved song analysis', 'approved treatment', 'approved elements'],
      output: manifestReady ? 'Shot manifest exists and can be reviewed.' : 'No shot manifest yet.',
      needs: elementImagesReady ? undefined : 'Element Images',
      primaryAction: manifestReady && !manifestApproved
        ? { label: 'Review shot manifest', href: 'manifest' }
        : undefined,
      secondaryAction: { label: 'Open manifest', href: 'manifest' },
    },
    {
      key: 'storyboard_images',
      number: 10,
      title: 'Storyboard Images',
      purpose: 'Generate one full-frame image per approved shot-specific prompt.',
      status: project.stage === 'generating_manifest_images' || project.stage === 'building_storyboard' ? 'running' : storyboardApproved ? 'approved' : storyboardReady ? 'generated' : (manifestApproved || elementImagesReady) ? 'ready' : 'locked',
      required: ['approved shot manifest', 'shot-specific prompts'],
      output: storyboardReady ? 'Storyboard images are ready for review.' : 'No storyboard images generated yet.',
      needs: manifestApproved ? undefined : 'Approved Shot Manifest',
      warning: 'Token-cost warning: storyboard frames must come from shot-specific prompts, not a vague treatment.',
      primaryAction: project.stage === 'manifest_approved'
        ? {
            label: 'Generate storyboard images',
            run: 'generate-manifest-images',
            confirm: 'Generate storyboard images from the approved shot manifest now? This may spend image-generation tokens.',
          }
        : project.stage === 'images_ready'
          ? {
              label: 'Build legacy storyboard',
              run: 'build-storyboard',
              confirm: 'This uses the legacy element-composite storyboard path. Continue only if you intentionally want that path.',
            }
          : project.stage === 'awaiting_storyboard_approval'
            ? { label: 'Review storyboard images', href: 'storyboard' }
            : undefined,
      secondaryAction: storyboardReady ? { label: 'Open storyboard', href: 'storyboard' } : undefined,
    },
    {
      key: 'final_video',
      number: 11,
      title: 'Final Real Video Generation',
      purpose: 'Generate a base real video, review it, optionally run lip sync, and choose the final approved export.',
      status: project.stage === 'assembling' ? 'running' : videoReady ? 'generated' : storyboardApproved ? 'ready' : 'locked',
      required: ['approved storyboard images', 'approved audio', 'real video backend'],
      output: videoReady ? 'A video output exists. Base/lip-sync/final selection will be split in the next slice.' : 'No base video generated yet.',
      needs: storyboardApproved ? undefined : 'Approved Storyboard Images',
      warning: 'Compute-cost warning: ffmpeg/Ken Burns is preview-only and should fail unless preview mode was explicitly enabled.',
      primaryAction: project.stage === 'storyboard_approved'
        ? {
            label: 'Generate base video',
            run: 'generate-base-video',
            confirm: 'Generate the base video now? This requires a real video backend unless preview slideshow mode is explicitly enabled.',
          }
        : videoReady
          ? { label: 'Open production output', href: 'production' }
          : undefined,
      secondaryAction: videoReady ? { label: 'Open production', href: 'production' } : undefined,
    },
  ]
}

export default function ProjectDetail({ id }: { id: string }) {
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [localError, setLocalError] = useState('')

  const fetchProject = async () => {
    try {
      const data = await api.projects.get(id)
      setProject(data)
    } catch {
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

  const sections = useMemo(() => project ? buildWorkbookSections(project) : [], [project])

  const refreshFromResponse = async (data: any) => {
    if (data?.project) {
      setProject(data.project)
    } else if (data?.id) {
      setProject(data)
    } else {
      await fetchProject()
    }
  }

  const runAction = async (action: string, confirmMessage?: string) => {
    if (!project || runningAction) return
    if (confirmMessage && !window.confirm(confirmMessage)) return
    setLocalError('')
    setRunningAction(action)
    try {
      if (action === 'analyze-rhythm-key') {
        const response = await fetch(mediaUrl(project.audio_url))
        if (!response.ok) throw new Error(`Could not load source audio (${response.status})`)
        const blob = await response.blob()
        const filename = project.audio_url?.split('/').pop() || 'source-audio.mp3'
        const file = new File([blob], filename, { type: blob.type || 'audio/mpeg' })
        const result = await analyzeAudioFile(file)
        if (!result) throw new Error('Browser rhythm/key analysis did not return a result.')
        await refreshFromResponse(await api.projects.saveRhythmKey(id, {
          bpm: result.bpm,
          musical_key: result.musicalKey,
          beat_grid: result.beatGrid,
        }))
      } else if (action === 'prepare-audio') {
        await refreshFromResponse(await api.projects.prepareAudio(id))
      } else if (action === 'read-metadata') {
        await refreshFromResponse(await api.projects.readMetadata(id))
      } else if (action === 'isolate-vocals') {
        await refreshFromResponse(await api.projects.isolateVocals(id))
      } else if (action === 'transcribe-lyrics') {
        await refreshFromResponse(await api.projects.transcribeLyrics(id))
      } else if (action === 'run-song-analysis') {
        await refreshFromResponse(await api.pipeline.runSongAnalysis(id))
      } else if (action === 'generate-treatment') {
        await refreshFromResponse(await api.pipeline.generateTreatment(id))
      } else if (action === 'generate-element-plan') {
        await refreshFromResponse(await api.pipeline.generateElementPlan(id))
      } else if (action === 'generate-element-images') {
        await refreshFromResponse(await api.pipeline.generateElementImages(id))
      } else if (action === 'build-storyboard') {
        await refreshFromResponse(await api.pipeline.buildStoryboard(id))
      } else if (action === 'generate-manifest-images') {
        await refreshFromResponse(await api.pipeline.generateManifestImages(id))
      } else if (action === 'generate-base-video') {
        await refreshFromResponse(await api.pipeline.generateBaseVideo(id))
      }
    } catch (err: any) {
      setLocalError(err?.response?.data?.detail || err?.message || 'Action failed.')
      await fetchProject()
    } finally {
      setRunningAction(null)
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

  const completedCount = sections.filter(section => ['approved', 'generated'].includes(section.status)).length
  const progress = Math.round((completedCount / sections.length) * 100)

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <a href="/" className="text-purple-400 text-sm hover:underline">Back to all projects</a>

        <div className="mt-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Production Workbook</p>
              <h1 className="text-3xl md:text-4xl font-bold">{project.title || 'Untitled Project'}</h1>
              {project.artist && <p className="text-gray-400 mt-1">{project.artist}</p>}
            </div>
            <div className="lg:text-right">
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${
                project.stage === 'complete' ? 'bg-green-950 text-green-300 border-green-800' :
                project.stage === 'error' ? 'bg-red-950 text-red-300 border-red-800' :
                project.stage.includes('awaiting') ? 'bg-yellow-950 text-yellow-300 border-yellow-800' :
                'bg-purple-950 text-purple-300 border-purple-800'
              }`}>
                {STAGE_LABELS[project.stage] || project.stage}
              </span>
              <p className="text-gray-600 text-xs mt-2">Auto-refreshes every 5s</p>
            </div>
          </div>

          <div className="mt-6 bg-gray-950 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-400">Workbook completion</span>
              <span className="text-gray-500">{completedCount}/{sections.length} sections have output or approval</span>
            </div>
            <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
              <div className="h-full bg-purple-600" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {localError && (
          <div className="mb-6 bg-red-950/50 border border-red-800 rounded-lg p-4">
            <h2 className="text-red-300 font-semibold mb-1">Action failed</h2>
            <p className="text-red-200 text-sm font-mono whitespace-pre-wrap break-words">{localError}</p>
          </div>
        )}

        {project.stage === 'error' && project.error_message && (
          <div className="mb-6 bg-red-950/50 border border-red-800 rounded-lg p-4">
            <h2 className="text-red-300 font-semibold mb-1">Pipeline Error</h2>
            <p className="text-red-200 text-sm font-mono whitespace-pre-wrap break-words">{project.error_message}</p>
            <button
              onClick={async () => {
                setRunningAction('retry')
                try {
                  await refreshFromResponse(await api.projects.retry(id))
                } catch (err: any) {
                  setLocalError(err?.response?.data?.detail || err?.message || 'Retry failed.')
                } finally {
                  setRunningAction(null)
                }
              }}
              disabled={runningAction === 'retry'}
              className="mt-3 px-4 py-2 rounded-lg bg-red-800 hover:bg-red-700 disabled:bg-gray-800 text-sm font-semibold"
            >
              {runningAction === 'retry' ? 'Retrying...' : 'Retry failed step'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-6">
          <div className="space-y-4">
            {sections.map(section => (
              <WorkbookCard
                key={section.key}
                section={section}
                projectId={id}
                runningAction={runningAction}
                onRun={runAction}
              />
            ))}
          </div>

          <aside className="xl:sticky xl:top-6 h-fit bg-gray-950 border border-gray-800 rounded-lg p-4">
            <h2 className="font-semibold mb-3">Gates</h2>
            <div className="space-y-2">
              {sections.map(section => (
                <a
                  key={section.key}
                  href={`#${section.key}`}
                  className="flex items-center justify-between gap-3 text-sm py-1.5 text-gray-400 hover:text-white"
                >
                  <span className="truncate">{section.number}. {section.title}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusClass(section.status)}`}>
                    {prettyStatus(section.status)}
                  </span>
                </a>
              ))}
            </div>
          </aside>
        </div>

        <p className="text-gray-700 text-xs mt-8">
          Project ID: {project.id}
        </p>
      </div>
    </div>
  )
}

function WorkbookCard({
  section,
  projectId,
  runningAction,
  onRun,
}: {
  section: WorkbookSection
  projectId: string
  runningAction: string | null
  onRun: (action: string, confirmMessage?: string) => void
}) {
  const actionRunning = section.primaryAction?.run && runningAction === section.primaryAction.run

  return (
    <section id={section.key} className="bg-gray-950 border border-gray-800 rounded-lg p-5 scroll-mt-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="text-gray-500 text-sm tabular-nums">{section.number.toString().padStart(2, '0')}</span>
            <h2 className="text-xl font-semibold text-white">{section.title}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${statusClass(section.status)}`}>
              {prettyStatus(section.status)}
            </span>
          </div>
          <p className="text-gray-400 text-sm leading-relaxed">{section.purpose}</p>
        </div>

        {(section.primaryAction || section.secondaryAction) && (
          <div className="flex flex-wrap gap-2 md:justify-end">
            {section.primaryAction?.href && (
              <Link
                href={`/projects/${projectId}/${section.primaryAction.href}`}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-semibold transition-colors"
              >
                {section.primaryAction.label}
              </Link>
            )}
            {section.primaryAction?.run && (
              <button
                onClick={() => onRun(section.primaryAction!.run!, section.primaryAction!.confirm)}
                disabled={Boolean(runningAction)}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 disabled:text-gray-500 text-sm font-semibold transition-colors"
              >
                {actionRunning ? 'Starting...' : section.primaryAction.label}
              </button>
            )}
            {section.secondaryAction && section.secondaryAction.href !== section.primaryAction?.href && (
              <Link
                href={section.secondaryAction.href.startsWith('/') ? section.secondaryAction.href : `/projects/${projectId}/${section.secondaryAction.href}`}
                className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 text-sm transition-colors"
              >
                {section.secondaryAction.label}
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <h3 className="text-xs uppercase tracking-widest text-gray-600 mb-2">Required Inputs</h3>
          <ul className="space-y-1">
            {section.required.map(item => (
              <li key={item} className="text-sm text-gray-400">{item}</li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-2">
          <h3 className="text-xs uppercase tracking-widest text-gray-600 mb-2">Generated Output</h3>
          <p className="text-sm text-gray-300 break-words">{section.output}</p>
          {section.needs && (
            <p className="mt-2 text-sm text-yellow-300">Needs: {section.needs}</p>
          )}
          {section.warning && (
            <p className="mt-2 text-sm text-amber-300">{section.warning}</p>
          )}
        </div>
      </div>
    </section>
  )
}
