'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, mediaUrl } from '@/lib/api'

export default function StoryboardView({ id }: { id: string }) {
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [panels, setPanels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [reviewing, setReviewing] = useState<string | null>(null)

  const load = async () => {
    const [proj, assets] = await Promise.all([
      api.projects.get(id),
      api.assets.list(id),
    ])
    setProject(proj)
    const storyboardPanels = assets
      .filter((a: any) => a.asset_type === 'storyboard_panel' || a.asset_type === 'panel')
      .sort((a: any, b: any) => (a.panel_index ?? 0) - (b.panel_index ?? 0))
    setPanels(storyboardPanels)
    setLoading(false)
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleApprove = async () => {
    if (!allApproved) {
      alert('Approve every storyboard image before approving the storyboard.')
      return
    }
    setApproving(true)
    try {
      const panel_order = panels.map(p => p.id)
      await api.pipeline.approveStoryboard(id, { panel_order })
      router.push(`/projects/${id}`)
    } catch {
      alert('Failed to approve storyboard.')
      setApproving(false)
    }
  }

  const movePanel = (index: number, direction: -1 | 1) => {
    const next = [...panels]
    const swap = index + direction
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    setPanels(next)
  }

  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({})

  // Track in-flight poll timeouts so we can cancel them on unmount, and guard
  // state updates so a poll that resolves after the user has navigated away
  // doesn't call setState on an unmounted component or fire stray requests.
  const isMountedRef = useRef(true)
  const pollTimeoutIdsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      pollTimeoutIdsRef.current.forEach(clearTimeout)
      pollTimeoutIdsRef.current.clear()
    }
  }, [])

  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  const reviewPanel = async (panelId: string, status: 'approved' | 'rejected') => {
    const note = status === 'rejected' ? window.prompt('What needs to change for this frame?') || '' : ''
    setReviewing(panelId)
    try {
      await api.assets.review(id, panelId, { status, note })
      await load()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Could not save frame review.')
    } finally {
      setReviewing(null)
    }
  }

  const uploadPanelImage = async (panel: any, file: File) => {
    setUploading(u => ({ ...u, [panel.id]: true }))
    try {
      await api.pipeline.uploadShotImage(id, panel.id, file)
      if (!isMountedRef.current) return
      const assets = await api.assets.list(id)
      if (!isMountedRef.current) return
      const sb = assets
        .filter((a: any) => a.asset_type === 'storyboard_panel' || a.asset_type === 'panel')
        .sort((a: any, b: any) => (a.panel_index ?? 0) - (b.panel_index ?? 0))
      setPanels(sb)
    } catch {
      if (!isMountedRef.current) return
      alert('Failed to upload image.')
    } finally {
      if (isMountedRef.current) {
        setUploading(u => ({ ...u, [panel.id]: false }))
      }
    }
  }

  const regeneratePanel = async (panel: any) => {
    setRegenerating(r => ({ ...r, [panel.id]: true }))
    try {
      await api.pipeline.regenerateImage(id, {
        asset_id: panel.id,
        new_prompt: panel.prompt || panel.label || 'shot frame',
      })
      // Regeneration runs in the background; poll the asset list until the
      // image URL changes, then refresh so the new frame shows.
      const before = panel.url
      const started = Date.now()
      const pollOnce = async () => {
        if (!isMountedRef.current) return
        try {
          const assets = await api.assets.list(id)
          if (!isMountedRef.current) return
          const updated = assets.find((a: any) => a.id === panel.id)
          const timedOut = Date.now() - started > 90000
          if ((updated && updated.url !== before) || timedOut) {
            const sb = assets
              .filter((a: any) => a.asset_type === 'storyboard_panel' || a.asset_type === 'panel')
              .sort((a: any, b: any) => (a.panel_index ?? 0) - (b.panel_index ?? 0))
            setPanels(sb)
            setRegenerating(r => ({ ...r, [panel.id]: false }))
            return
          }
          const timeoutId = setTimeout(() => {
            pollTimeoutIdsRef.current.delete(timeoutId)
            pollOnce()
          }, 4000)
          pollTimeoutIdsRef.current.add(timeoutId)
        } catch {
          if (!isMountedRef.current) return
          setRegenerating(r => ({ ...r, [panel.id]: false }))
          alert('Failed while polling regeneration status.')
        }
      }
      pollOnce()
    } catch {
      if (!isMountedRef.current) return
      alert('Failed to start regeneration.')
      setRegenerating(r => ({ ...r, [panel.id]: false }))
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="text-center">
        <div className="animate-spin text-4xl mb-4">🎬</div>
        <p className="text-gray-400">Loading storyboard…</p>
      </div>
    </div>
  )

  const VIEWABLE_STAGES = ['awaiting_storyboard_approval', 'storyboard_approved', 'assembling', 'base_video_ready', 'complete']
  const canApprove = project?.stage === 'awaiting_storyboard_approval'
  const approvedCount = panels.filter(panel => panel.asset_status === 'approved').length
  const rejectedCount = panels.filter(panel => panel.asset_status === 'rejected').length
  const allApproved = panels.length > 0 && approvedCount === panels.length

  if (!project || !VIEWABLE_STAGES.includes(project.stage)) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <p className="text-gray-400 mb-2">Storyboard not ready for review.</p>
        <p className="text-gray-600 text-sm mb-6">
          {project?.stage ? `Current stage: ${project.stage}` : 'Project not found'}
        </p>
        <a href={`/projects/${id}`} className="text-purple-400 hover:underline text-sm">← Back to project</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <a href={`/projects/${id}`} className="text-purple-400 text-sm hover:underline">← Back to project</a>

        <div className="flex items-start justify-between mt-6 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Storyboard Review</h1>
            <p className="text-gray-500 mt-1">
              {project.stage === 'awaiting_storyboard_approval'
                ? `${panels.length} frames · Review each image, redo any you don't like, reorder as needed. Approval unlocks base video generation on the workbook page.`
                : `${panels.length} frames · Storyboard locked after approval.`}
            </p>
          </div>
          {canApprove && (
            <button
              onClick={handleApprove}
              disabled={approving || !allApproved}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              {approving ? 'Approving...' : 'Approve storyboard'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
            <p className="text-xs uppercase tracking-widest text-gray-600">Approved</p>
            <p className="text-xl font-semibold text-green-300">{approvedCount}/{panels.length}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
            <p className="text-xs uppercase tracking-widest text-gray-600">Rejected</p>
            <p className="text-xl font-semibold text-orange-300">{rejectedCount}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
            <p className="text-xs uppercase tracking-widest text-gray-600">Remaining</p>
            <p className="text-xl font-semibold text-yellow-300">{Math.max(panels.length - approvedCount, 0)}</p>
          </div>
        </div>

        {panels.length === 0 ? (
          <div className="text-center py-20 text-gray-600">No storyboard panels found.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {panels.map((panel, i) => (
              <div key={panel.id} className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
                <div className="aspect-video bg-gray-800 relative">
                  {panel.url ? (
                    <img src={mediaUrl(panel.url)} alt={`Panel ${i + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">No image</div>
                  )}
                  {(regenerating[panel.id] || uploading[panel.id]) && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <span className="animate-spin text-2xl">{uploading[panel.id] ? '⬆️' : '🎨'}</span>
                    </div>
                  )}
                  <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                    {i + 1}
                  </div>
                  <div className={`absolute bottom-1 right-1 text-xs px-1.5 py-0.5 rounded border ${
                    panel.asset_status === 'approved'
                      ? 'bg-green-950/90 text-green-300 border-green-800'
                      : panel.asset_status === 'rejected'
                        ? 'bg-orange-950/90 text-orange-300 border-orange-800'
                        : 'bg-black/80 text-gray-300 border-gray-700'
                  }`}>
                    {panel.asset_status || 'generated'}
                  </div>
                  {panel.source === 'manual' && (
                    <div className="absolute bottom-1 left-1 bg-green-900/80 text-green-300 text-xs px-1.5 py-0.5 rounded">
                      manual
                    </div>
                  )}
                  {panel.panel_type && (
                    <div className={`absolute top-1 right-1 text-xs px-1.5 py-0.5 rounded ${
                      panel.panel_type === 'open' ? 'bg-blue-900 text-blue-300' : 'bg-orange-900 text-orange-300'
                    }`}>
                      {panel.panel_type}
                    </div>
                  )}
                </div>
                <div className="p-2">
                  {(panel.lyric_at_this_moment || panel.lyric) && (
                    <p className="text-gray-400 text-xs italic truncate">&ldquo;{panel.lyric_at_this_moment || panel.lyric}&rdquo;</p>
                  )}
                  {panel.review_note && <p className="text-orange-300 text-xs mt-1 line-clamp-2">{panel.review_note}</p>}
                  {canApprove && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => reviewPanel(panel.id, 'approved')}
                        disabled={reviewing === panel.id || panel.asset_status === 'approved'}
                        className="flex-1 text-xs px-2 py-1 rounded bg-green-800 text-green-100 hover:bg-green-700 disabled:bg-gray-800 disabled:text-gray-600"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => reviewPanel(panel.id, 'rejected')}
                        disabled={reviewing === panel.id}
                        className="flex-1 text-xs px-2 py-1 rounded border border-orange-800 text-orange-300 hover:border-orange-600 disabled:border-gray-800 disabled:text-gray-600"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <button
                      onClick={() => movePanel(i, -1)}
                      disabled={i === 0 || !canApprove}
                      className="text-gray-500 hover:text-white disabled:opacity-20 text-sm px-1"
                      title="Move earlier"
                    >
                      ←
                    </button>
                    {canApprove && (
                      <button
                        onClick={() => regeneratePanel(panel)}
                        disabled={!!regenerating[panel.id] || !!uploading[panel.id]}
                        className="text-gray-500 hover:text-purple-300 disabled:opacity-30 text-xs px-2 py-0.5 rounded border border-gray-700 hover:border-purple-600 transition-colors"
                        title="Regenerate with AI"
                      >
                        ↻ redo
                      </button>
                    )}
                    {canApprove && (
                      <label
                        className="text-gray-500 hover:text-green-300 text-xs px-2 py-0.5 rounded border border-gray-700 hover:border-green-600 transition-colors cursor-pointer"
                        title="Upload your own image for this shot"
                      >
                        ⬆ upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={!!regenerating[panel.id] || !!uploading[panel.id]}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (file) uploadPanelImage(panel, file)
                          }}
                        />
                      </label>
                    )}
                    <button
                      onClick={() => movePanel(i, 1)}
                      disabled={i === panels.length - 1 || !canApprove}
                      className="text-gray-500 hover:text-white disabled:opacity-20 text-sm px-1"
                      title="Move later"
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
