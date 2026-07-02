'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, mediaUrl } from '@/lib/api'

export default function StoryboardView({ id }: { id: string }) {
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [panels, setPanels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)

  useEffect(() => {
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
    load()
  }, [id])

  const handleApprove = async () => {
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
        try {
          const assets = await api.assets.list(id)
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
          setTimeout(pollOnce, 4000)
        } catch {
          setRegenerating(r => ({ ...r, [panel.id]: false }))
          alert('Failed while polling regeneration status.')
        }
      }
      pollOnce()
    } catch {
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

  if (!project || project.stage !== 'awaiting_storyboard_approval') return (
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
              {panels.length} frames · Review each image, ↻ redo any you don't like, reorder with ← →.
              Approve only when you're ready to generate video.
            </p>
          </div>
          <button
            onClick={handleApprove}
            disabled={approving}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            {approving ? 'Starting generation…' : '✓ Approve & Generate Video'}
          </button>
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
                  {regenerating[panel.id] && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                      <span className="animate-spin text-2xl">🎨</span>
                    </div>
                  )}
                  <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                    {i + 1}
                  </div>
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
                  <div className="flex items-center justify-between mt-2">
                    <button
                      onClick={() => movePanel(i, -1)}
                      disabled={i === 0}
                      className="text-gray-500 hover:text-white disabled:opacity-20 text-sm px-1"
                      title="Move earlier"
                    >
                      ←
                    </button>
                    <button
                      onClick={() => regeneratePanel(panel)}
                      disabled={!!regenerating[panel.id]}
                      className="text-gray-500 hover:text-purple-300 disabled:opacity-30 text-xs px-2 py-0.5 rounded border border-gray-700 hover:border-purple-600 transition-colors"
                      title="Regenerate this frame"
                    >
                      ↻ redo
                    </button>
                    <button
                      onClick={() => movePanel(i, 1)}
                      disabled={i === panels.length - 1}
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
