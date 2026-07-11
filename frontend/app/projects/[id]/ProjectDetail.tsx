'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api, mediaUrl } from '@/lib/api'
import { analyzeAudioFile } from '@/lib/audioAnalysis'
import {
  Win95Alert,
  Win95Button,
  Win95GroupBox,
  Win95Progress,
  Win95StatusBadge,
} from '@/components/win95/Win95Primitives'

type SectionStatus = 'empty' | 'locked' | 'ready' | 'running' | 'generated' | 'approved' | 'rejected' | 'failed' | 'skipped'

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
  canApprove?: boolean
  canReject?: boolean
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

const PRODUCTION_PATH_LABELS: Record<string, string> = {
  lyric: 'Lyric Video',
  karaoke: 'Karaoke Video',
  performance: 'Performance Music Video',
  cinematic: 'Cinematic Music Video',
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
  assembling_lyric_video: 'Generating lyric video',
  base_video_ready: 'Base video ready for review',
  complete: 'Final video approved',
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
  'base_video_ready',
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
  lyrics_align: { key: 'align-lyrics', runLabel: 'Align provided lyrics' },
}

// Projects created with pasted/uploaded lyrics (user_lyrics_text) should be
// forced-aligned against the vocal stem instead of transcribed with
// Whisper — more accurate since the exact words are already known. Both
// produce the same transcript shape, so everything downstream is unaffected
// by which one ran.
function lyricsGuidedStep(project: any): GuidedStep {
  return project?.user_lyrics_text ? GUIDED_RUN_STEPS.lyrics_align : GUIDED_RUN_STEPS.lyrics
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

// Lyric Video v1: a pure (non-hybrid) lyric path skips treatment/element
// plan/element images/shot manifest/storyboard entirely and renders
// directly from approved lyrics — see
// docs/lyric-karaoke-module-implementation-plan.md.
function isPureLyricPath(project: any): boolean {
  const paths = Array.isArray(project?.production_paths) ? project.production_paths : []
  return paths.length === 1 && paths[0] === 'lyric'
}

function productionPathSummary(project: any): string {
  const paths = Array.isArray(project?.production_paths) ? project.production_paths : []
  if (paths.length === 0) return 'No production path selected.'
  const labels = paths.map((path: string) => PRODUCTION_PATH_LABELS[path] || path)
  return labels.length === 1 ? labels[0] : `Hybrid: ${labels.join(' + ')}`
}

function statusTone(status: SectionStatus): 'ok' | 'warn' | 'error' | 'info' | 'muted' | 'running' {
  switch (status) {
    case 'approved':
      return 'ok'
    case 'generated':
    case 'ready':
      return 'warn'
    case 'running':
      return 'running'
    case 'failed':
    case 'rejected':
      return 'error'
    case 'locked':
    case 'empty':
    case 'skipped':
    default:
      return 'muted'
  }
}

function prettyStatus(status: SectionStatus): string {
  return status[0].toUpperCase() + status.slice(1)
}

function explicitSectionStatus(project: any, key: string): SectionStatus | undefined {
  const raw = project?.section_statuses?.[key]?.status
  const allowed: SectionStatus[] = ['empty', 'locked', 'ready', 'running', 'generated', 'approved', 'rejected', 'failed', 'skipped']
  return allowed.includes(raw) ? raw : undefined
}

function workbookStatus(project: any, key: string, inferred: SectionStatus): SectionStatus {
  return explicitSectionStatus(project, key) || inferred
}

function workbookApproved(project: any, key: string, legacyApproved: boolean): boolean {
  const explicit = explicitSectionStatus(project, key)
  return explicit ? explicit === 'approved' : legacyApproved
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
    case 'align-lyrics':
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
  const infoApproved = workbookApproved(project, 'project_setup', isAtOrAfter(project, 'info_confirmed'))
  const songFileApproved = workbookApproved(project, 'song_file', Boolean(project.audio_url))
  const rhythmApproved = workbookApproved(project, 'rhythm_key', rhythmReady)
  const lyricsApproved = workbookApproved(project, 'lyrics', lyricsReady)
  const analysisReady = Boolean(project.analysis || isAtOrAfter(project, 'analyzed'))
  const analysisApproved = workbookApproved(project, 'song_analysis', analysisReady)
  const treatmentReady = Boolean(project.treatment)
  const treatmentApproved = workbookApproved(project, 'treatment', isAtOrAfter(project, 'treatment_approved'))
  const elementPlanReady = countElements(project) > 0 || isAtOrAfter(project, 'elements_ready')
  const elementPlanApproved = workbookApproved(project, 'element_plan', elementPlanReady)
  const elementImagesReady = isAtOrAfter(project, 'images_ready')
  const elementImagesApproved = workbookApproved(project, 'element_images', elementImagesReady)
  const manifestReady = isAtOrAfter(project, 'awaiting_manifest_approval') || isAtOrAfter(project, 'manifest_approved')
  const manifestApproved = workbookApproved(project, 'shot_manifest', isAtOrAfter(project, 'manifest_approved'))
  const storyboardReady = isAtOrAfter(project, 'awaiting_storyboard_approval')
  const storyboardApproved = workbookApproved(project, 'storyboard_images', isAtOrAfter(project, 'storyboard_approved'))
  const baseVideoReady = Boolean(project.base_video_url || project.video_url) || project.stage === 'base_video_ready' || project.stage === 'complete'
  const finalVideoApproved = workbookApproved(project, 'final_video', Boolean(project.final_video_url) || project.stage === 'complete')

  const sections: WorkbookSection[] = [
    {
      key: 'project_setup',
      number: 1,
      title: 'Project Setup',
      purpose: 'Confirm title, artist, creative brief, references, and series context.',
      status: workbookStatus(project, 'project_setup', infoApproved ? 'approved' : project.stage === 'awaiting_project_info_review' ? 'ready' : project.audio_url ? 'locked' : 'empty'),
      required: ['title', 'production path', 'artist or intentional blank', 'creative direction'],
      output: `${productionPathSummary(project)} | ${
        infoApproved ? 'Project setup approved.' : project.stage === 'awaiting_project_info_review' ? 'Extracted info is ready to review.' : 'Waiting for audio preparation and transcript.'
      }`,
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
      status: workbookStatus(project, 'song_file', project.audio_url ? 'approved' : 'empty'),
      required: ['original audio file', 'optional isolated vocal stem'],
      output: project.audio_url ? project.audio_url.split('/').pop() || 'Song file uploaded.' : 'No song file uploaded.',
      canApprove: Boolean(project.audio_url) && !songFileApproved,
      canReject: Boolean(project.audio_url) && !songFileApproved,
      secondaryAction: { label: 'Replace from new-project flow', href: '/projects/new' },
    },
    {
      key: 'rhythm_key',
      number: 3,
      title: 'Rhythm / Key Analysis',
      purpose: 'Detect BPM, beat-grid timestamps, and musical key.',
      status: workbookStatus(project, 'rhythm_key', rhythmReady ? 'approved' : project.audio_url ? 'ready' : 'locked'),
      required: ['song file'],
      output: rhythmReady ? `BPM: ${project.bpm || 'unknown'} | Key: ${project.musical_key || 'unknown'} | Beats: ${beatCount(project)}` : 'No rhythm/key result yet.',
      needs: project.audio_url ? undefined : 'Song File',
      canApprove: rhythmReady && !rhythmApproved,
      canReject: rhythmReady && !rhythmApproved,
      primaryAction: isGuidedStepReady(project, 'analyze-rhythm-key')
        ? { label: GUIDED_RUN_STEPS.rhythm_key.runLabel, run: 'analyze-rhythm-key' }
        : undefined,
    },
    {
      key: 'lyrics',
      number: 4,
      title: 'Lyrics Transcription & Timestamping',
      purpose: 'Create lyric timing anchors that downstream shots must follow.',
      status: workbookStatus(project, 'lyrics', lyricsReady ? 'approved' : vocalsReady ? 'ready' : audioReady ? 'locked' : 'locked'),
      required: ['prepared audio', 'vocal stem or full mix'],
      output: lyricsReady ? `Transcript ready | Segments: ${transcriptSegments(project)}` : 'No timestamped lyrics yet.',
      needs: lyricsReady || vocalsReady ? undefined : 'Prepared audio and vocal stem',
      canApprove: lyricsReady && !lyricsApproved,
      canReject: lyricsReady && !lyricsApproved,
      primaryAction: isGuidedStepReady(project, 'prepare-audio')
        ? { label: GUIDED_RUN_STEPS.audio_prepare.runLabel, run: 'prepare-audio' }
        : isGuidedStepReady(project, 'read-metadata')
          ? { label: GUIDED_RUN_STEPS.metadata.runLabel, run: 'read-metadata' }
          : isGuidedStepReady(project, 'isolate-vocals')
            ? { label: GUIDED_RUN_STEPS.vocals.runLabel, run: 'isolate-vocals' }
            : isGuidedStepReady(project, lyricsGuidedStep(project).key)
              ? { label: lyricsGuidedStep(project).runLabel, run: lyricsGuidedStep(project).key }
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
      status: workbookStatus(project, 'song_analysis', project.stage === 'interpreting_song' ? 'running' : analysisReady ? 'approved' : (infoApproved && songFileApproved && rhythmApproved && lyricsApproved) ? 'ready' : 'locked'),
      required: ['approved project setup', 'approved rhythm/key', 'approved timestamped lyrics'],
      output: analysisReady ? 'Song analysis generated and available for downstream creative work.' : 'No song analysis generated yet.',
      needs: (infoApproved && songFileApproved && rhythmApproved && lyricsApproved) ? undefined : 'Approved Project Setup, Song File, Rhythm/Key, and Lyrics',
      canApprove: analysisReady && !analysisApproved,
      canReject: analysisReady && !analysisApproved,
      primaryAction: project.stage === 'info_confirmed' && infoApproved && songFileApproved && rhythmApproved && lyricsApproved
        ? { label: 'Run song analysis', run: 'run-song-analysis' }
        : undefined,
    },
    {
      key: 'treatment',
      number: 6,
      title: 'Treatment',
      purpose: 'Define the creative direction, visual rules, motifs, palette, and narrative structure.',
      status: workbookStatus(project, 'treatment', project.stage === 'treatment_pending' ? 'running' : treatmentApproved ? 'approved' : treatmentReady ? 'generated' : analysisApproved ? 'ready' : 'locked'),
      required: ['approved song analysis', 'creative brief', 'references'],
      output: treatmentReady ? project.treatment?.logline || 'Treatment generated.' : 'No treatment generated yet.',
      needs: analysisApproved ? undefined : 'Approved Song Analysis',
      primaryAction: project.stage === 'analyzed' && analysisApproved
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
      status: workbookStatus(project, 'element_plan', project.stage === 'extracting_elements' ? 'running' : elementPlanReady ? 'approved' : treatmentApproved ? 'ready' : 'locked'),
      required: ['approved song analysis', 'approved treatment'],
      output: elementPlanReady ? `${countElements(project)} planned element groups.` : 'No element plan generated yet.',
      needs: treatmentApproved ? undefined : 'Approved Treatment',
      warning: 'This step should only spend LLM tokens. It must not generate images.',
      canApprove: elementPlanReady && !elementPlanApproved,
      canReject: elementPlanReady && !elementPlanApproved,
      primaryAction: project.stage === 'treatment_approved'
        ? { label: 'Generate element plan', run: 'generate-element-plan' }
        : undefined,
    },
    {
      key: 'element_images',
      number: 8,
      title: 'Element Images',
      purpose: 'Generate and review backgrounds, characters, props, and state images.',
      status: workbookStatus(project, 'element_images', project.stage === 'generating_images' ? 'running' : elementImagesReady ? 'generated' : elementPlanApproved ? 'ready' : 'locked'),
      required: ['approved element plan'],
      output: elementImagesReady ? 'Element images generated. Review before storyboard planning.' : 'No element images generated yet.',
      needs: elementPlanApproved ? undefined : 'Approved Element Plan',
      warning: 'Token-cost warning: this will call the configured image backend. Stop here if the element plan is not right.',
      canApprove: elementImagesReady && !elementImagesApproved,
      canReject: elementImagesReady && !elementImagesApproved,
      primaryAction: project.stage === 'elements_ready' && elementPlanApproved
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
      status: workbookStatus(project, 'shot_manifest', manifestApproved ? 'approved' : manifestReady ? 'generated' : elementImagesApproved ? 'ready' : 'locked'),
      required: ['approved lyrics', 'approved song analysis', 'approved treatment', 'approved elements'],
      output: manifestReady ? 'Shot manifest exists and can be reviewed.' : 'No shot manifest yet.',
      needs: elementImagesApproved ? undefined : 'Approved Element Images',
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
      status: workbookStatus(project, 'storyboard_images', project.stage === 'generating_manifest_images' || project.stage === 'building_storyboard' ? 'running' : storyboardApproved ? 'approved' : storyboardReady ? 'generated' : (manifestApproved || elementImagesApproved) ? 'ready' : 'locked'),
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
        : project.stage === 'images_ready' && elementImagesApproved
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
    isPureLyricPath(project)
      ? {
          key: 'final_video',
          number: 11,
          title: 'Final Real Video Generation',
          purpose: 'Generate the Lyric Video directly from approved lyrics, review it, then choose the final approved export.',
          status: workbookStatus(
            project,
            'final_video',
            project.stage === 'assembling_lyric_video'
              ? 'running'
              : finalVideoApproved
                ? 'approved'
                : baseVideoReady
                  ? 'generated'
                  : (infoApproved && songFileApproved && rhythmApproved && lyricsApproved)
                    ? 'ready'
                    : 'locked'
          ),
          required: ['approved lyrics', 'approved project setup', 'approved rhythm/key'],
          output: finalVideoApproved
            ? 'Final video approved for export.'
            : project.stage === 'assembling_lyric_video'
              ? 'Lyric video render is running (Remotion). This can take a few minutes — keep this page open.'
              : baseVideoReady
                ? 'Lyric video generated. Open Production Review, watch it, then Approve Final.'
                : 'No lyric video generated yet.',
          needs: (infoApproved && songFileApproved && rhythmApproved && lyricsApproved)
            ? undefined
            : 'Approved Project Setup, Song File, Rhythm/Key, and Lyrics',
          canApprove: baseVideoReady && !finalVideoApproved,
          canReject: baseVideoReady && !finalVideoApproved,
          primaryAction:
            project.stage === 'assembling_lyric_video'
              ? { label: 'Watch render progress', href: 'production' }
              : project.stage === 'info_confirmed' && infoApproved && songFileApproved && rhythmApproved && lyricsApproved
                ? {
                    label: 'Generate lyric video',
                    run: 'generate-lyric-video',
                    confirm: 'Generate the Lyric Video from the approved transcript now? This uses Remotion (no image-generation tokens).',
                  }
                : baseVideoReady
                  ? { label: 'Open production output', href: 'production' }
                  : undefined,
          secondaryAction: (baseVideoReady || project.stage === 'assembling_lyric_video')
            ? { label: 'Open production', href: 'production' }
            : undefined,
        }
      : {
          key: 'final_video',
          number: 11,
          title: 'Final Real Video Generation',
          purpose: 'Generate a base real video, review it, optionally run lip sync, and choose the final approved export.',
          status: workbookStatus(
            project,
            'final_video',
            project.stage === 'assembling'
              ? 'running'
              : finalVideoApproved
                ? 'approved'
                : baseVideoReady
                  ? 'generated'
                  : storyboardApproved
                    ? 'ready'
                    : 'locked'
          ),
          required: ['approved storyboard images', 'approved audio', 'real video backend'],
          output: finalVideoApproved
            ? 'Final video approved for export.'
            : project.stage === 'assembling'
              ? 'Base video render is running. Open Production Review for progress.'
              : baseVideoReady
                ? 'Base video generated. Review it before final approval.'
                : 'No base video generated yet.',
          needs: storyboardApproved ? undefined : 'Approved Storyboard Images',
          warning: 'Compute-cost warning: ffmpeg/Ken Burns is preview-only and should fail unless preview mode was explicitly enabled.',
          canApprove: baseVideoReady && !finalVideoApproved,
          canReject: baseVideoReady && !finalVideoApproved,
          primaryAction:
            project.stage === 'assembling'
              ? { label: 'Watch render progress', href: 'production' }
              : project.stage === 'storyboard_approved'
                ? {
                    label: 'Generate base video',
                    run: 'generate-base-video',
                    confirm: 'Generate the base video now? This requires a real video backend unless preview slideshow mode is explicitly enabled.',
                  }
                : baseVideoReady
                  ? { label: 'Open production output', href: 'production' }
                  : undefined,
          secondaryAction: (baseVideoReady || project.stage === 'assembling')
            ? { label: 'Open production', href: 'production' }
            : undefined,
        },
  ]

  // A pure Lyric Video project has no song analysis, treatment, elements,
  // shot manifest, or storyboard — Base Video is the next gated step
  // straight after Lyrics is approved. Hiding these rather than just
  // leaving them "Locked" forever avoids a Lyric Video user ever seeing
  // "Generate Element Plan" as something they're expected to do.
  const HIDDEN_FOR_PURE_LYRIC = new Set([
    'song_analysis', 'treatment', 'element_plan', 'element_images', 'shot_manifest', 'storyboard_images',
  ])
  const visible = isPureLyricPath(project) ? sections.filter(s => !HIDDEN_FOR_PURE_LYRIC.has(s.key)) : sections
  return visible.map((section, i) => ({ ...section, number: i + 1 }))
}

export default function ProjectDetail({ id }: { id: string }) {
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [localError, setLocalError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [activeSection, setActiveSection] = useState<string | null>(null)

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
    const busy =
      project?.stage === 'assembling' ||
      project?.stage === 'assembling_lyric_video' ||
      project?.stage === 'generating_images' ||
      project?.stage === 'generating_manifest_images' ||
      project?.stage === 'building_storyboard' ||
      project?.stage === 'treatment_pending' ||
      project?.stage === 'extracting_elements'
    const interval = setInterval(
      fetchProject,
      project?.stage === 'complete' || project?.stage === 'error' ? 30000 : busy ? 3000 : 5000
    )
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, project?.stage])

  const sections = useMemo(() => project ? buildWorkbookSections(project) : [], [project])

  // Prefer the first section that still needs work; keep user selection sticky when valid.
  useEffect(() => {
    if (!sections.length) return
    if (activeSection && sections.some(s => s.key === activeSection)) return
    const focus =
      sections.find(s => ['ready', 'running', 'generated', 'failed', 'rejected'].includes(s.status)) ||
      sections.find(s => s.status !== 'approved') ||
      sections[0]
    setActiveSection(focus.key)
  }, [sections, activeSection])

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
    setSuccessMsg('')
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
      } else if (action === 'align-lyrics') {
        await refreshFromResponse(await api.projects.alignLyrics(id))
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
      } else if (action === 'generate-lyric-video') {
        await refreshFromResponse(await api.pipeline.generateLyricVideo(id))
        setSuccessMsg('Lyric video generation started. Open Production Review to watch progress.')
        setActiveSection('final_video')
      }
      if (action !== 'generate-lyric-video') {
        setSuccessMsg(`Step finished: ${action}`)
      }
    } catch (err: any) {
      setLocalError(err?.response?.data?.detail || err?.message || 'Action failed.')
      await fetchProject()
    } finally {
      setRunningAction(null)
    }
  }

  const approveSection = async (sectionKey: string) => {
    if (runningAction) return
    setLocalError('')
    setSuccessMsg('')
    setRunningAction(`approve-${sectionKey}`)
    try {
      await refreshFromResponse(await api.projects.approveSection(id, sectionKey))
      setSuccessMsg(`Approved: ${sectionKey.replace(/_/g, ' ')}`)
      // Advance sidebar to the next incomplete section after a successful approve.
      setActiveSection(null)
    } catch (err: any) {
      setLocalError(err?.response?.data?.detail || err?.message || 'Approval failed.')
      await fetchProject()
    } finally {
      setRunningAction(null)
    }
  }

  const rejectSection = async (sectionKey: string) => {
    if (runningAction) return
    const note = window.prompt('What needs to change before this section is approved?') || ''
    setLocalError('')
    setSuccessMsg('')
    setRunningAction(`reject-${sectionKey}`)
    try {
      await refreshFromResponse(await api.projects.rejectSection(id, sectionKey, note))
      setSuccessMsg(`Rejected: ${sectionKey.replace(/_/g, ' ')} — fix and re-run when ready.`)
    } catch (err: any) {
      setLocalError(err?.response?.data?.detail || err?.message || 'Rejection failed.')
      await fetchProject()
    } finally {
      setRunningAction(null)
    }
  }

  if (loading) {
    return <div className="win95-empty">Loading project workbook…</div>
  }

  if (!project) {
    return (
      <div className="win95-page">
        <div className="win95-empty">Project not found.</div>
        <Link href="/" className="win95-btn win95-btn-link">← Back to projects</Link>
      </div>
    )
  }

  const completedCount = sections.filter(section => ['approved', 'generated'].includes(section.status)).length
  const progress = sections.length ? Math.round((completedCount / sections.length) * 100) : 0
  const current = sections.find(s => s.key === activeSection) || sections[0]

  return (
    <div className="win95-page">
      <div className="win95-page-header">
        <div>
          <h1 className="win95-page-title">{project.title || 'Untitled Project'}</h1>
          <p className="win95-page-sub">
            {project.artist ? `${project.artist} · ` : ''}
            {productionPathSummary(project)} · stage: {STAGE_LABELS[project.stage] || project.stage}
          </p>
        </div>
        <div className="win95-row">
          <Win95StatusBadge
            status={
              project.stage === 'complete' ? 'ok' :
              project.stage === 'error' ? 'error' :
              project.stage?.includes('awaiting') ? 'warn' :
              'running'
            }
          >
            {STAGE_LABELS[project.stage] || project.stage}
          </Win95StatusBadge>
          <Link href="/" className="win95-btn win95-btn-link">Projects</Link>
        </div>
      </div>

      <Win95Progress
        value={progress}
        label={`Workbook completion — ${completedCount}/${sections.length} sections have output or approval`}
      />

      {localError && (
        <Win95Alert tone="error" title="Action failed" onDismiss={() => setLocalError('')}>
          {localError}
        </Win95Alert>
      )}

      {successMsg && (
        <Win95Alert tone="success" title="OK" onDismiss={() => setSuccessMsg('')}>
          {successMsg}
        </Win95Alert>
      )}

      {project.stage === 'assembling_lyric_video' && (
        <Win95Alert tone="info" title="Lyric video rendering">
          Remotion is building your lyric video from the approved transcript. Progress is on the Production page.
          {' '}
          <Link href={`/projects/${id}/production`} className="win95-btn win95-btn-link win95-btn-sm" style={{ display: 'inline-flex', marginLeft: 8 }}>
            Open Production
          </Link>
        </Win95Alert>
      )}

      {project.stage === 'error' && project.error_message && (
        <Win95Alert tone="error" title="Pipeline Error">
          <div style={{ marginBottom: 8, fontFamily: 'var(--win-mono)', whiteSpace: 'pre-wrap' }}>
            {project.error_message}
          </div>
          <Win95Button
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
          >
            {runningAction === 'retry' ? 'Retrying…' : 'Retry failed step'}
          </Win95Button>
        </Win95Alert>
      )}

      <div className="win95-workbook">
        <aside className="win95-sidebar">
          <div className="win95-sidebar-title">PRODUCTION PIPELINE</div>
          {sections.map(section => (
            <button
              key={section.key}
              type="button"
              className={`win95-sidebar-step ${current?.key === section.key ? 'is-active' : ''}`}
              onClick={() => setActiveSection(section.key)}
            >
              <span className="win95-sidebar-step-name">
                {section.number}. {section.title}
              </span>
              <span className="win95-sidebar-step-status">
                {prettyStatus(section.status)}
              </span>
            </button>
          ))}
          <div className="win95-sidebar-foot">
            Project ID:<br />{project.id}
          </div>
        </aside>

        <div className="win95-main-pane">
          {current ? (
            <WorkbookCard
              section={current}
              projectId={id}
              runningAction={runningAction}
              onRun={runAction}
              onApprove={approveSection}
              onReject={rejectSection}
            />
          ) : (
            <div className="win95-empty">Select a pipeline stage from the left.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function WorkbookCard({
  section,
  projectId,
  runningAction,
  onRun,
  onApprove,
  onReject,
}: {
  section: WorkbookSection
  projectId: string
  runningAction: string | null
  onRun: (action: string, confirmMessage?: string) => void
  onApprove: (sectionKey: string) => void
  onReject: (sectionKey: string) => void
}) {
  const actionRunning = section.primaryAction?.run && runningAction === section.primaryAction.run
  const approving = runningAction === `approve-${section.key}`
  const rejecting = runningAction === `reject-${section.key}`
  const locked = section.status === 'locked' || section.status === 'empty'

  return (
    <div>
      <div className="win95-row" style={{ marginBottom: 6, justifyContent: 'space-between' }}>
        <h2 className="win95-section-title" style={{ margin: 0 }}>
          {section.number.toString().padStart(2, '0')}. {section.title}
        </h2>
        <Win95StatusBadge status={statusTone(section.status)}>
          {prettyStatus(section.status)}
        </Win95StatusBadge>
      </div>
      <p className="win95-section-desc">{section.purpose}</p>

      {locked && (
        <div className="win95-empty" style={{ marginBottom: 12 }}>
          {section.needs
            ? `Locked until prerequisites are met: ${section.needs}`
            : 'This stage is locked. Complete and approve earlier stages first.'}
        </div>
      )}

      {(section.primaryAction || section.secondaryAction || section.canApprove || section.canReject) && (
        <div className="win95-row" style={{ marginBottom: 12 }}>
          {section.primaryAction?.href && (
            <Link
              href={`/projects/${projectId}/${section.primaryAction.href}`}
              className="win95-btn win95-btn-link win95-btn-primary"
            >
              {section.primaryAction.label}
            </Link>
          )}
          {section.primaryAction?.run && (
            <Win95Button
              variant="primary"
              onClick={() => onRun(section.primaryAction!.run!, section.primaryAction!.confirm)}
              disabled={Boolean(runningAction)}
            >
              {actionRunning ? 'Starting…' : section.primaryAction.label}
            </Win95Button>
          )}
          {section.canApprove && (
            <Win95Button
              onClick={() => onApprove(section.key)}
              disabled={Boolean(runningAction)}
            >
              {approving ? 'Approving…' : 'Approve'}
            </Win95Button>
          )}
          {section.canReject && (
            <Win95Button
              onClick={() => onReject(section.key)}
              disabled={Boolean(runningAction)}
            >
              {rejecting ? 'Rejecting…' : 'Reject'}
            </Win95Button>
          )}
          {section.secondaryAction && section.secondaryAction.href !== section.primaryAction?.href && (
            <Link
              href={
                section.secondaryAction.href.startsWith('/')
                  ? section.secondaryAction.href
                  : `/projects/${projectId}/${section.secondaryAction.href}`
              }
              className="win95-btn win95-btn-link"
            >
              {section.secondaryAction.label}
            </Link>
          )}
          {runningAction && !actionRunning && !approving && !rejecting && (
            <span className="win95-muted">Busy: {runningAction}…</span>
          )}
        </div>
      )}

      {section.warning && (
        <Win95Alert tone="warn" title="Cost / quality warning">
          {section.warning}
        </Win95Alert>
      )}

      <div className="win95-grid-2">
        <Win95GroupBox title="Required Inputs">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {section.required.map(item => (
              <li key={item} style={{ marginBottom: 4 }}>{item}</li>
            ))}
          </ul>
        </Win95GroupBox>
        <Win95GroupBox title="Generated Output">
          <p style={{ margin: 0, wordBreak: 'break-word' }}>{section.output}</p>
          {section.needs && (
            <p style={{ margin: '8px 0 0', color: 'var(--win-warn)' }}>
              Needs: {section.needs}
            </p>
          )}
        </Win95GroupBox>
      </div>
    </div>
  )
}
