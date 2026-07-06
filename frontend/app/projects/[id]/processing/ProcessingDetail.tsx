'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { AUDIO_PIPELINE_STEPS, stepProgress, serverStepIndex } from '@/lib/pipelineSteps'

// Stages that mean preprocessing has already finished (or the project moved
// on some other way) — landing here with one of these means either the
// redirect below already fired once, or the user navigated back to this URL
// after the fact. Either way, there's nothing left to watch here.
const PAST_PREPROCESSING = new Set([
  'awaiting_project_info_review', 'info_confirmed', 'interpreting_song', 'analyzed',
  'treatment_pending', 'awaiting_treatment_approval', 'treatment_approved',
  'extracting_elements', 'elements_ready', 'generating_images', 'images_ready',
  'building_storyboard', 'awaiting_storyboard_approval', 'storyboard_approved',
  'assembling', 'complete',
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

  if (loading) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading…</div>
  )
  if (!project) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">Project not found</div>
  )

  const index = serverStepIndex(project.processing_step)

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="text-5xl mb-6 animate-pulse">🎧</div>
        <p className="text-xl text-white font-medium mb-6">{AUDIO_PIPELINE_STEPS[index]}…</p>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-600 transition-all duration-500 ease-out"
            style={{ width: `${stepProgress(index)}%` }}
          />
        </div>
        <p className="text-gray-600 text-sm mt-4">
          Vocal separation and transcription are the slow part — this can take a few minutes.
        </p>
      </div>
    </div>
  )
}
