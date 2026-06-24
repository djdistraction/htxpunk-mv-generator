'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'

const STAGE_LABELS: Record<string, string> = {
  uploaded: 'Uploaded',
  analyzing: 'Analyzing audio…',
  analyzed: 'Analysis complete',
  treatment_pending: 'Generating creative vision…',
  awaiting_treatment_approval: '✋ Your creative vision is ready',
  treatment_approved: 'Treatment approved',
  extracting_elements: 'Designing visual elements…',
  elements_ready: 'Elements designed',
  generating_images: 'Generating images…',
  images_ready: 'Images ready',
  building_storyboard: 'Building storyboard…',
  awaiting_storyboard_approval: '✋ Storyboard ready for review',
  storyboard_approved: 'Storyboard approved',
  assembling: 'Assembling your video…',
  complete: '✅ Your music video is ready',
  error: '❌ Something went wrong',
}

const APPROVAL_LINKS: Record<string, { label: string; href: string }> = {
  awaiting_treatment_approval: { label: 'Review Creative Vision →', href: 'treatment' },
  awaiting_storyboard_approval: { label: 'Review Storyboard →', href: 'storyboard' },
}

const STAGE_ORDER = [
  'uploaded', 'analyzing', 'analyzed',
  'treatment_pending', 'awaiting_treatment_approval', 'treatment_approved',
  'extracting_elements', 'elements_ready',
  'generating_images', 'images_ready',
  'building_storyboard', 'awaiting_storyboard_approval', 'storyboard_approved',
  'assembling', 'complete',
]

export default function ProjectDetail({ id }: { id: string }) {
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)

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
    // Auto-refresh every 5 seconds while in progress, slower once complete
    const interval = setInterval(fetchProject, project?.stage === 'complete' || project?.stage === 'error' ? 30000 : 5000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, project?.stage])

  if (loading) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      Loading…
    </div>
  )
  if (!project) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      Project not found
    </div>
  )

  const currentIndex = STAGE_ORDER.indexOf(project.stage)
  const approval = APPROVAL_LINKS[project.stage]

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto">
        <a href="/" className="text-purple-400 text-sm hover:underline">← All projects</a>

        <div className="mt-6 mb-8">
          <h1 className="text-3xl font-bold">{project.title}</h1>
          {project.artist && <p className="text-gray-400 mt-1">{project.artist}</p>}
          <div className="mt-3 flex items-center gap-3">
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

        {/* Progress dots */}
        <div className="mb-10">
          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            {STAGE_ORDER.filter(s => s !== 'analyzed' && s !== 'elements_ready').map((stage, i, arr) => {
              const idx = STAGE_ORDER.indexOf(stage)
              const done = idx < currentIndex
              const active = stage === project.stage
              return (
                <div key={stage} className="flex items-center">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    done ? 'bg-purple-500' : active ? 'bg-yellow-400' : 'bg-gray-700'
                  }`} title={STAGE_LABELS[stage]} />
                  {i < arr.length - 1 && (
                    <div className={`w-8 h-0.5 ${done ? 'bg-purple-500' : 'bg-gray-700'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Treatment summary */}
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

        {/* Sub-page links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Treatment', href: 'treatment', stages: ['awaiting_treatment_approval'] },
            { label: 'Elements', href: 'elements', stages: ['elements_ready', 'generating_images', 'images_ready', 'building_storyboard', 'awaiting_storyboard_approval', 'storyboard_approved', 'assembling', 'complete'] },
            { label: 'Storyboard', href: 'storyboard', stages: ['awaiting_storyboard_approval', 'storyboard_approved', 'assembling', 'complete'] },
            { label: 'Production', href: 'production', stages: ['assembling', 'complete'] },
          ].map(link => {
            const enabled = link.stages.includes(project.stage)
            return enabled ? (
              <Link
                key={link.href}
                href={`/projects/${id}/${link.href}`}
                className="bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg p-4 text-center transition-colors"
              >
                <span className="text-gray-200 font-medium">{link.label}</span>
              </Link>
            ) : (
              <div
                key={link.href}
                className="bg-gray-900/40 border border-gray-800 rounded-lg p-4 text-center opacity-40 cursor-not-allowed"
              >
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
            <div className="text-red-300 text-xs space-y-1">
              <p className="font-semibold">Troubleshooting:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Check backend logs for detailed error messages</li>
                <li>Verify API keys (GROQ_API_KEY, HF_TOKEN) in .env</li>
                <li>Ensure stable internet connection</li>
                <li>Try uploading a different audio file</li>
              </ul>
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
