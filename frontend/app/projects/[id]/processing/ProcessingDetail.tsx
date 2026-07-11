'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { AUDIO_PIPELINE_STEPS, stepProgress, serverStepIndex } from '@/lib/pipelineSteps'
import { Win95Progress } from '@/components/win95/Win95Primitives'

// Stages that mean preprocessing has already finished — leave this screen.
const PAST_PREPROCESSING = new Set([
  'awaiting_project_info_review', 'info_confirmed', 'interpreting_song', 'analyzed',
  'treatment_pending', 'awaiting_treatment_approval', 'treatment_approved',
  'extracting_elements', 'elements_ready', 'generating_images', 'images_ready',
  'building_storyboard', 'awaiting_storyboard_approval', 'storyboard_approved',
  'assembling', 'assembling_lyric_video', 'base_video_ready', 'complete',
  'awaiting_manifest_approval', 'manifest_approved', 'generating_manifest_images',
])

export default function ProcessingDetail({ id }: { id: string }) {
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await api.projects.get(id)
        if (cancelled) return
        setProject(data)
        if (data.stage === 'awaiting_project_info_review') {
          router.replace(`/projects/${id}/review`)
        } else if (PAST_PREPROCESSING.has(data.stage) || data.stage === 'error') {
          router.replace(`/projects/${id}`)
        }
      } catch {
        if (!cancelled) setProject(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return <div className="win95-empty">Loading…</div>
  if (!project) {
    return (
      <div className="win95-page">
        <div className="win95-empty">Project not found</div>
        <Link href="/" className="win95-btn win95-btn-link">← Projects</Link>
      </div>
    )
  }

  const index = serverStepIndex(project.processing_step)

  return (
    <div className="win95-page" style={{ maxWidth: 480, margin: '40px auto' }}>
      <h1 className="win95-page-title" style={{ textAlign: 'center' }}>
        Processing Audio
      </h1>
      <p className="win95-page-sub" style={{ textAlign: 'center' }}>
        {AUDIO_PIPELINE_STEPS[index]}…
      </p>
      <Win95Progress value={stepProgress(index)} label={`${stepProgress(index)}%`} />
      <ol style={{ marginTop: 16, paddingLeft: 20, color: 'var(--win-muted)' }}>
        {AUDIO_PIPELINE_STEPS.map((step, i) => (
          <li
            key={step}
            style={{
              marginBottom: 4,
              fontWeight: i === index ? 700 : 400,
              color: i < index ? 'var(--win-success)' : i === index ? 'var(--win-text)' : 'var(--win-muted)',
            }}
          >
            {i < index ? '✓ ' : i === index ? '► ' : ''}{step}
          </li>
        ))}
      </ol>
      <p className="win95-muted" style={{ textAlign: 'center', marginTop: 12 }}>
        Vocal separation and transcription are the slow part — this can take a few minutes.
      </p>
      <div className="win95-row" style={{ justifyContent: 'center' }}>
        <Link href={`/projects/${id}`} className="win95-btn win95-btn-link">Open workbook</Link>
      </div>
    </div>
  )
}
