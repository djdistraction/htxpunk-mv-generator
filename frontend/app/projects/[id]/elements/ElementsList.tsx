'use client'

import { useEffect, useState } from 'react'
import { api, mediaUrl } from '@/lib/api'

type AssetFilter = 'all' | 'background' | 'element'
type ReviewStatus = 'approved' | 'rejected'

export default function ElementsList({ id }: { id: string }) {
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AssetFilter>('all')
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [approvingSection, setApprovingSection] = useState(false)

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

  const reviewAsset = async (assetId: string, status: ReviewStatus) => {
    const note = status === 'rejected' ? window.prompt('What needs to change for this image?') || '' : ''
    setReviewing(assetId)
    try {
      await api.assets.review(id, assetId, { status, note })
      await fetchAssets()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Could not save image review.')
    } finally {
      setReviewing(null)
    }
  }

  const approveSection = async () => {
    setApprovingSection(true)
    try {
      await api.projects.approveSection(id, 'element_images')
      window.location.href = `/projects/${id}`
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Approve every element image first.')
    } finally {
      setApprovingSection(false)
    }
  }

  const filtered = assets.filter(asset =>
    filter === 'all' ? ['background', 'element'].includes(asset.asset_type) : asset.asset_type === filter
  )
  const reviewable = assets.filter(asset => ['background', 'element'].includes(asset.asset_type))
  const approvedCount = reviewable.filter(asset => asset.asset_status === 'approved').length
  const rejectedCount = reviewable.filter(asset => asset.asset_status === 'rejected').length
  const allApproved = reviewable.length > 0 && approvedCount === reviewable.length

  if (loading) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="text-center">
        <div className="animate-spin text-4xl mb-4">...</div>
        <p className="text-gray-400">Loading generated elements...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-5xl mx-auto">
        <a href={`/projects/${id}`} className="text-purple-400 text-sm hover:underline">Back to project</a>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mt-6 mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Element Images Review</h1>
            <p className="text-gray-500">
              Review backgrounds, characters, props, and motif images. Approve each image before storyboard planning.
            </p>
          </div>
          <button
            onClick={approveSection}
            disabled={!allApproved || approvingSection}
            className="px-5 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:text-gray-500 font-semibold text-sm"
          >
            {approvingSection ? 'Approving...' : 'Approve Element Images'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
            <p className="text-xs uppercase tracking-widest text-gray-600">Approved</p>
            <p className="text-xl font-semibold text-green-300">{approvedCount}/{reviewable.length}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
            <p className="text-xs uppercase tracking-widest text-gray-600">Rejected</p>
            <p className="text-xl font-semibold text-orange-300">{rejectedCount}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
            <p className="text-xs uppercase tracking-widest text-gray-600">Remaining</p>
            <p className="text-xl font-semibold text-yellow-300">{Math.max(reviewable.length - approvedCount, 0)}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {(['all', 'background', 'element'] as const).map(item => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`px-4 py-1.5 rounded-full text-sm capitalize transition-colors ${
                filter === item ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {item}
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
                      src={mediaUrl(asset.url)}
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
                      Generating...
                    </div>
                  )}
                  <span className={`absolute top-2 left-2 text-xs px-2 py-0.5 rounded ${
                    asset.asset_type === 'background' ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'
                  }`}>
                    {asset.asset_type}
                  </span>
                  <span className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded border ${
                    asset.asset_status === 'approved'
                      ? 'bg-green-950 text-green-300 border-green-800'
                      : asset.asset_status === 'rejected'
                        ? 'bg-orange-950 text-orange-300 border-orange-800'
                        : 'bg-gray-950 text-gray-300 border-gray-700'
                  }`}>
                    {asset.asset_status || 'generated'}
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-white truncate">{asset.label || 'Untitled'}</p>
                  {asset.state && <p className="text-xs text-gray-500 mt-0.5">{asset.state}</p>}
                  {asset.review_note && <p className="text-xs text-orange-300 mt-1 line-clamp-2">{asset.review_note}</p>}
                  {asset.url && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => reviewAsset(asset.id, 'approved')}
                        disabled={reviewing === asset.id || asset.asset_status === 'approved'}
                        className="text-xs px-2 py-1 rounded bg-green-800 text-green-100 hover:bg-green-700 disabled:bg-gray-800 disabled:text-gray-600"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => reviewAsset(asset.id, 'rejected')}
                        disabled={reviewing === asset.id}
                        className="text-xs px-2 py-1 rounded border border-orange-800 text-orange-300 hover:border-orange-600 disabled:border-gray-800 disabled:text-gray-600"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleRegenerate(asset.id, asset.prompt || '')}
                        disabled={regenerating === asset.id}
                        className="text-xs px-2 py-1 rounded border border-purple-800 text-purple-300 hover:border-purple-600 disabled:border-gray-800 disabled:text-gray-600"
                      >
                        {regenerating === asset.id ? 'Queued...' : 'Regenerate'}
                      </button>
                    </div>
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
