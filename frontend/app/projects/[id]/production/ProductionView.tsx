'use client'

import { useEffect, useState } from 'react'
import { api, mediaUrl } from '@/lib/api'

const STAGE_PROGRESS: Record<string, number> = {
  assembling: 85,
  base_video_ready: 100,
  complete: 100,
}

export default function ProductionView({ id }: { id: string }) {
  const [project, setProject] = useState<any>(null)
  const [clips, setClips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [localError, setLocalError] = useState('')

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
    <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>
  )
  if (!project) return null

  const progress = STAGE_PROGRESS[project.stage] ?? 0
  const finalVideoAsset = clips.find(clip => clip.asset_type === 'final_video')
  const baseVideoUrl = project.base_video_url
    ? mediaUrl(project.base_video_url)
    : (project.video_url ? mediaUrl(project.video_url) : '')
  const finalVideoUrl = project.final_video_url
    ? mediaUrl(project.final_video_url)
    : (finalVideoAsset?.url ? mediaUrl(finalVideoAsset.url) : '')
  const reviewVideoUrl = finalVideoUrl || baseVideoUrl
  const finalApproved = project.section_statuses?.final_video?.status === 'approved' || Boolean(project.final_video_url)
  const clipList = clips.filter(clip => clip.asset_type === 'clip')
  const readyClips = clipList.filter(clip => clip.url)

  const handleDownload = async () => {
    if (!reviewVideoUrl) return
    try {
      const res = await fetch(reviewVideoUrl)
      if (!res.ok) throw new Error(`Failed to fetch video (${res.status})`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `${project.title ?? 'music-video'}.mp4`
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      alert(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const approveFinal = async () => {
    setWorking(true)
    setLocalError('')
    try {
      const updated = await api.projects.approveSection(id, 'final_video')
      setProject(updated)
    } catch (err: any) {
      setLocalError(err?.response?.data?.detail || err?.message || 'Could not approve final video.')
    } finally {
      setWorking(false)
    }
  }

  const rejectFinal = async () => {
    const note = window.prompt('What needs to change before this can be final?') || ''
    setWorking(true)
    setLocalError('')
    try {
      const updated = await api.projects.rejectSection(id, 'final_video', note)
      setProject(updated)
    } catch (err: any) {
      setLocalError(err?.response?.data?.detail || err?.message || 'Could not reject final video.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <a href={`/projects/${id}`} className="text-purple-400 text-sm hover:underline">Back to project</a>

        <h1 className="text-3xl font-bold mt-6 mb-2">Production Review</h1>
        <p className="text-gray-500 mb-8">
          {finalApproved
            ? 'Final export approved.'
            : reviewVideoUrl
              ? 'Review the generated base video before approving it as the final export.'
              : 'Rendering the base video. This may take a while depending on the configured backend.'}
        </p>

        {localError && (
          <div className="mb-6 bg-red-950/50 border border-red-800 rounded-lg p-4 text-red-200 text-sm">
            {localError}
          </div>
        )}

        {!reviewVideoUrl && (
          <div className="mb-8">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Assembling your music video...</span>
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

        {reviewVideoUrl && (
          <div className="mb-10 bg-gray-900 rounded-xl overflow-hidden border border-purple-800">
            <div className="p-4 border-b border-gray-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className={`font-semibold ${finalApproved ? 'text-green-400' : 'text-yellow-300'}`}>
                  {finalApproved ? 'Final Music Video' : 'Base Video Review'}
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                  {finalApproved ? 'This output is approved as the final export.' : 'Approve this only if it is acceptable as the final deliverable.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!finalApproved && (
                  <>
                    <button
                      onClick={rejectFinal}
                      disabled={working}
                      className="text-sm border border-orange-800 text-orange-300 hover:border-orange-600 disabled:text-gray-600 px-4 py-1.5 rounded-lg transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={approveFinal}
                      disabled={working}
                      className="text-sm bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:text-gray-500 px-4 py-1.5 rounded-lg transition-colors"
                    >
                      {working ? 'Approving...' : 'Approve Final'}
                    </button>
                  </>
                )}
                <button
                  onClick={handleDownload}
                  className="text-sm bg-purple-600 hover:bg-purple-700 px-4 py-1.5 rounded-lg transition-colors"
                >
                  Download MP4
                </button>
              </div>
            </div>
            <video
              src={reviewVideoUrl}
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
                        <div className="text-gray-500 text-2xl animate-pulse">...</div>
                        <p className="text-gray-600 text-xs mt-1">Rendering...</p>
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
            <div className="text-5xl mb-4 animate-pulse">...</div>
            <p>Assembling your video from the storyboard panels...</p>
          </div>
        )}

        <p className="text-gray-700 text-xs mt-8">Auto-refreshes every 8s</p>
      </div>
    </div>
  )
}
