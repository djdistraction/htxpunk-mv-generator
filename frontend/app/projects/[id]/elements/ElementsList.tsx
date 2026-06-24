'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export default function ElementsList({ id }: { id: string }) {
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'background' | 'element'>('all')
  const [regenerating, setRegenerating] = useState<string | null>(null)

  const fetchAssets = async () => {
    try {
      const all = await api.assets.list(id)
      setAssets(all)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAssets()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleRegenerate = async (assetId: string, currentPrompt: string) => {
    const newPrompt = window.prompt('Edit the generation prompt:', currentPrompt)
    if (!newPrompt) return
    setRegenerating(assetId)
    try {
      await api.pipeline.regenerateImage(id, { asset_id: assetId, new_prompt: newPrompt })
      setTimeout(fetchAssets, 3000)
    } catch {
      alert('Regeneration failed.')
    } finally {
      setRegenerating(null)
    }
  }

  const filtered = assets.filter(a =>
    filter === 'all' ? ['background', 'element'].includes(a.asset_type) : a.asset_type === filter
  )

  if (loading) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading…</div>
  )

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-5xl mx-auto">
        <a href={`/projects/${id}`} className="text-purple-400 text-sm hover:underline">← Back to project</a>

        <h1 className="text-3xl font-bold mt-6 mb-2">Generated Elements</h1>
        <p className="text-gray-500 mb-6">Review backgrounds and character elements. Regenerate any that are not right.</p>

        <div className="flex gap-2 mb-6">
          {(['all', 'background', 'element'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm capitalize transition-colors ${
                filter === f ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            No {filter === 'all' ? '' : filter} assets generated yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((asset: any) => (
              <div key={asset.id} className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 group">
                <div className="aspect-square bg-gray-800 relative">
                  {asset.url ? (
                    <img
                      src={asset.url}
                      alt={asset.label || asset.asset_type}
                      className="w-full h-full object-contain"
                      style={{
                        background: asset.asset_type === 'element'
                          ? 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 0 0 / 16px 16px'
                          : '#111'
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
                      Generating…
                    </div>
                  )}
                  <span className={`absolute top-2 left-2 text-xs px-2 py-0.5 rounded ${
                    asset.asset_type === 'background' ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'
                  }`}>
                    {asset.asset_type}
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-white truncate">{asset.label || 'Untitled'}</p>
                  {asset.state && <p className="text-xs text-gray-500 mt-0.5">{asset.state}</p>}
                  {asset.url && (
                    <button
                      onClick={() => handleRegenerate(asset.id, asset.prompt || '')}
                      disabled={regenerating === asset.id}
                      className="mt-2 text-xs text-purple-400 hover:text-purple-300 disabled:text-gray-600"
                    >
                      {regenerating === asset.id ? 'Queued…' : '↻ Regenerate'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
