'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, mediaUrl } from '@/lib/api'
import {
  Win95Alert,
  Win95Button,
  Win95GroupBox,
  Win95StatusBadge,
} from '@/components/win95/Win95Primitives'

type AssetFilter = 'all' | 'background' | 'element'
type ReviewStatus = 'approved' | 'rejected'

export default function ElementsList({ id }: { id: string }) {
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AssetFilter>('all')
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [approvingSection, setApprovingSection] = useState(false)
  const [error, setError] = useState('')

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
    setError('')
    try {
      await api.pipeline.regenerateImage(id, { asset_id: assetId, new_prompt: newPrompt })
      setTimeout(fetchAssets, 3000)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Regeneration failed.')
    } finally {
      setRegenerating(null)
    }
  }

  const reviewAsset = async (assetId: string, status: ReviewStatus) => {
    const note = status === 'rejected' ? window.prompt('What needs to change for this image?') || '' : ''
    setReviewing(assetId)
    setError('')
    try {
      await api.assets.review(id, assetId, { status, note })
      await fetchAssets()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not save image review.')
    } finally {
      setReviewing(null)
    }
  }

  const approveSection = async () => {
    setApprovingSection(true)
    setError('')
    try {
      await api.projects.approveSection(id, 'element_images')
      window.location.href = `/projects/${id}`
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Approve every element image first.')
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

  if (loading) return <div className="win95-empty">Loading generated elements…</div>

  return (
    <div className="win95-page">
      <div className="win95-page-header">
        <div>
          <h1 className="win95-page-title">Element Images Review</h1>
          <p className="win95-page-sub">
            Approve each background / character / prop image before storyboard planning.
          </p>
        </div>
        <div className="win95-row">
          <Win95Button
            variant="primary"
            onClick={approveSection}
            disabled={!allApproved || approvingSection}
          >
            {approvingSection ? 'Approving…' : 'Approve Element Images'}
          </Win95Button>
          <Link href={`/projects/${id}`} className="win95-btn win95-btn-link">← Workbook</Link>
        </div>
      </div>

      {error && (
        <Win95Alert tone="error" title="Error" onDismiss={() => setError('')}>
          {error}
        </Win95Alert>
      )}

      <div className="win95-grid-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Win95GroupBox title="Approved">
          <div className="win95-strong" style={{ fontSize: 18, color: 'var(--win-success)' }}>
            {approvedCount}/{reviewable.length}
          </div>
        </Win95GroupBox>
        <Win95GroupBox title="Rejected">
          <div className="win95-strong" style={{ fontSize: 18, color: 'var(--win-warn)' }}>
            {rejectedCount}
          </div>
        </Win95GroupBox>
        <Win95GroupBox title="Remaining">
          <div className="win95-strong" style={{ fontSize: 18 }}>
            {Math.max(reviewable.length - approvedCount, 0)}
          </div>
        </Win95GroupBox>
      </div>

      <div className="win95-row" style={{ marginBottom: 8 }}>
        {(['all', 'background', 'element'] as const).map(item => (
          <Win95Button
            key={item}
            className={filter === item ? 'win95-btn-primary' : ''}
            onClick={() => setFilter(item)}
          >
            {item}
          </Win95Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="win95-empty">
          No {filter === 'all' ? '' : `${filter} `}assets generated yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {filtered.map((asset: any) => (
            <div key={asset.id} className="win95-outset" style={{ padding: 8 }}>
              <div className="win95-row" style={{ marginBottom: 6, justifyContent: 'space-between' }}>
                <Win95StatusBadge status="info">{asset.asset_type}</Win95StatusBadge>
                <Win95StatusBadge
                  status={
                    asset.asset_status === 'approved' ? 'ok' :
                    asset.asset_status === 'rejected' ? 'error' :
                    'muted'
                  }
                >
                  {asset.asset_status || 'generated'}
                </Win95StatusBadge>
              </div>
              <div
                className="win95-inset"
                style={{
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  background: asset.asset_type === 'element'
                    ? 'repeating-conic-gradient(#dfdfdf 0% 25%, #c0c0c0 0% 50%) 0 0 / 16px 16px'
                    : '#fff',
                }}
              >
                {asset.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl(asset.url)}
                    alt={asset.label || asset.asset_type}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <span className="win95-muted">Generating…</span>
                )}
              </div>
              <div className="win95-strong" style={{ marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {asset.label || 'Untitled'}
              </div>
              {asset.state && <div className="win95-muted">{asset.state}</div>}
              {asset.review_note && (
                <div style={{ fontSize: 11, color: 'var(--win-warn)', marginTop: 4 }}>{asset.review_note}</div>
              )}
              {asset.url && (
                <div className="win95-row" style={{ marginTop: 8 }}>
                  <Win95Button
                    className="win95-btn-sm"
                    onClick={() => reviewAsset(asset.id, 'approved')}
                    disabled={reviewing === asset.id || asset.asset_status === 'approved'}
                  >
                    Approve
                  </Win95Button>
                  <Win95Button
                    className="win95-btn-sm"
                    onClick={() => reviewAsset(asset.id, 'rejected')}
                    disabled={reviewing === asset.id}
                  >
                    Reject
                  </Win95Button>
                  <Win95Button
                    className="win95-btn-sm"
                    onClick={() => handleRegenerate(asset.id, asset.prompt || '')}
                    disabled={regenerating === asset.id}
                  >
                    {regenerating === asset.id ? 'Queued…' : 'Regen'}
                  </Win95Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
