'use client'

import { useEffect, useState } from 'react'
import { api, mediaUrl } from '@/lib/api'

const STAGE_PROGRESS: Record<string, number> = {
  assembling: 85,
  complete: 100,
}

export default function ProductionView({ id }: { id: string }) {
  const [project, setProject] = useState<any>(null)
  const [clips, setClips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    const [proj, assets] = await Promise.all([
      api.projects.get(id),
      api.assets.list(id),
    ])
    setProject(proj)
    setClips(assets.filter((a: any) => a.asset_type === 'clip' || a.asset_type === 'final_video'))
  }

  useEffect(() => {
    fetchData().finally(() => setLoading(false))
    const interval = setInterval(fetchData, 8000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading…</div>
  )
  if (!project) return null

  const progress = STAGE_PROGRESS[project.stage] ?? 0
  const finalVideo = clips.find(c => c.asset_type === 'final_video')
  // The ffmpeg backend stores the video URL on the project itself, not as an asset.
  // Support both: project.video_url (primary path) and a final_video asset (future path).
  const finalVideoUrl = project.video_url
    ? mediaUrl(project.video_url)
    : (finalVideo?.url ? mediaUrl(finalVideo.url) : '')
  const clipList = clips.filter(c => c.asset_type === 'clip')
  const readyClips = clipList.filter(c => c.url)

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <a href={`/projects/${id}`} className="text-purple-400 text-sm hover:underline">← Back to project</a>

        <h1 className="text-3xl font-bold mt-6 mb-2">Production</h1>
        <p className="text-gray-500 mb-8">
          {project.stage === 'complete' ? 'Your music video is ready.' : 'Sit tight — this takes 15–25 minutes.'}
        </p>

        {project.stage !== 'complete' && (
          <div className="mb-8">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Assembling your music video…</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {finalVideoUrl && (
          <div className="mb-10 bg-gray-900 rounded-xl overflow-hidden border border-purple-800">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-semibold text-green-400">✅ Final Music Video</h2>
              <a
                href={finalVideoUrl}
                download
                className="text-sm bg-purple-600 hover:bg-purple-700 px-4 py-1.5 rounded-lg transition-colors"
              >
                Download MP4
              </a>
            </div>
            <video
              src={finalVideoUrl}
              controls
              className="w-full"
              style={{ maxHeight: '480px', background: '#000' }}
            />
          </div>
        )}

        {clipList.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">
              Generated Clips ({readyClips.length}/{clipList.length})
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {clipList.map((clip: any, i: number) => (
                <div key={clip.id} className="bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
                  {clip.url ? (
                    <video src={mediaUrl(clip.url)} controls muted className="w-full aspect-video object-cover" />
                  ) : (
                    <div className="aspect-video bg-gray-800 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-gray-500 text-2xl animate-pulse">⚙</div>
                        <p className="text-gray-600 text-xs mt-1">Rendering…</p>
                      </div>
                    </div>
                  )}
                  <div className="px-3 py-2">
                    <p className="text-xs text-gray-500">Clip {i + 1}</p>
                    {clip.scene_description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{clip.scene_description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {project.stage === 'assembling' && clips.length === 0 && (
          <div className="text-center py-16 text-gray-600">
            <div className="text-5xl mb-4 animate-pulse">🎬</div>
            <p>Assembling your video from the storyboard panels…</p>
          </div>
        )}

        <p className="text-gray-700 text-xs mt-8">Auto-refreshes every 8s</p>
      </div>
    </div>
  )
}
