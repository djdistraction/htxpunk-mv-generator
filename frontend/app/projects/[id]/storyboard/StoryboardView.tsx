'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, mediaUrl } from '@/lib/api'
import {
  Win95Alert,
  Win95Button,
  Win95GroupBox,
  Win95StatusBadge,
} from '@/components/win95/Win95Primitives'

export default function StoryboardView({ id }: { id: string }) {
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [panels, setPanels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})

  const isMountedRef = useRef(true)
  const pollTimeoutIdsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

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

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      pollTimeoutIdsRef.current.forEach(clearTimeout)
      pollTimeoutIdsRef.current.clear()
    }
  }, [])

  const handleApprove = async () => {
    if (!allApproved) {
      setError('Approve every storyboard image before approving the storyboard.')
      return
    }
    setApproving(true)
    setError('')
    try {
      const panel_order = panels.map(p => p.id)
      await api.pipeline.approveStoryboard(id, { panel_order })
      router.push(`/projects/${id}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to approve storyboard.')
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

  const reviewPanel = async (panelId: string, status: 'approved' | 'rejected') => {
    const note = status === 'rejected' ? window.prompt('What needs to change for this frame?') || '' : ''
    setReviewing(panelId)
    setError('')
    try {
      await api.assets.review(id, panelId, { status, note })
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not save frame review.')
    } finally {
      setReviewing(null)
    }
  }

  const uploadPanelImage = async (panel: any, file: File) => {
    setUploading(u => ({ ...u, [panel.id]: true }))
    setError('')
    try {
      await api.pipeline.uploadShotImage(id, panel.id, file)
      if (!isMountedRef.current) return
      await load()
    } catch {
      if (!isMountedRef.current) return
      setError('Failed to upload image.')
    } finally {
      if (isMountedRef.current) {
        setUploading(u => ({ ...u, [panel.id]: false }))
      }
    }
  }

  const regeneratePanel = async (panel: any) => {
    setRegenerating(r => ({ ...r, [panel.id]: true }))
    setError('')
    try {
      await api.pipeline.regenerateImage(id, {
        asset_id: panel.id,
        new_prompt: panel.prompt || panel.label || 'shot frame',
      })
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
          setError('Failed while polling regeneration status.')
        }
      }
      pollOnce()
    } catch {
      if (!isMountedRef.current) return
      setError('Failed to start regeneration.')
      setRegenerating(r => ({ ...r, [panel.id]: false }))
    }
  }

  if (loading) return <div className="win95-empty">Loading storyboard…</div>

  const VIEWABLE_STAGES = [
    'awaiting_storyboard_approval', 'storyboard_approved', 'assembling',
    'assembling_lyric_video', 'base_video_ready', 'complete',
  ]
  const canApprove = project?.stage === 'awaiting_storyboard_approval'
  const approvedCount = panels.filter(panel => panel.asset_status === 'approved').length
  const rejectedCount = panels.filter(panel => panel.asset_status === 'rejected').length
  const allApproved = panels.length > 0 && approvedCount === panels.length

  if (!project || !VIEWABLE_STAGES.includes(project.stage)) {
    return (
      <div className="win95-page">
        <div className="win95-page-header">
          <h1 className="win95-page-title">Storyboard Review</h1>
          <Link href={`/projects/${id}`} className="win95-btn win95-btn-link">← Workbook</Link>
        </div>
        <div className="win95-empty">
          Storyboard not ready. Current stage: {project?.stage || 'unknown'}
        </div>
      </div>
    )
  }

  return (
    <div className="win95-page">
      <div className="win95-page-header">
        <div>
          <h1 className="win95-page-title">Storyboard Review</h1>
          <p className="win95-page-sub">
            {canApprove
              ? `${panels.length} frames — review each image, redo any you dislike, reorder as needed. Approval unlocks base video generation.`
              : `${panels.length} frames — storyboard locked after approval.`}
          </p>
        </div>
        <div className="win95-row">
          {canApprove && (
            <Win95Button variant="primary" onClick={handleApprove} disabled={approving || !allApproved}>
              {approving ? 'Approving…' : 'Approve storyboard'}
            </Win95Button>
          )}
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
            {approvedCount}/{panels.length}
          </div>
        </Win95GroupBox>
        <Win95GroupBox title="Rejected">
          <div className="win95-strong" style={{ fontSize: 18, color: 'var(--win-warn)' }}>
            {rejectedCount}
          </div>
        </Win95GroupBox>
        <Win95GroupBox title="Remaining">
          <div className="win95-strong" style={{ fontSize: 18 }}>
            {Math.max(panels.length - approvedCount, 0)}
          </div>
        </Win95GroupBox>
      </div>

      {panels.length === 0 ? (
        <div className="win95-empty">No storyboard panels found.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {panels.map((panel, i) => (
            <div key={panel.id} className="win95-outset" style={{ padding: 8 }}>
              <div className="win95-row" style={{ marginBottom: 4, justifyContent: 'space-between' }}>
                <span className="win95-muted">Frame {i + 1}</span>
                <Win95StatusBadge
                  status={
                    panel.asset_status === 'approved' ? 'ok' :
                    panel.asset_status === 'rejected' ? 'error' :
                    'muted'
                  }
                >
                  {panel.asset_status || 'generated'}
                </Win95StatusBadge>
              </div>
              <div className="win95-inset" style={{ aspectRatio: '16/9', position: 'relative', overflow: 'hidden', background: '#000' }}>
                {panel.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(panel.url)} alt={`Panel ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div className="win95-empty" style={{ border: 'none', color: '#aaa' }}>No image</div>
                )}
                {(regenerating[panel.id] || uploading[panel.id]) && (
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                  }}>
                    {uploading[panel.id] ? 'Uploading…' : 'Regenerating…'}
                  </div>
                )}
              </div>
              {(panel.lyric_at_this_moment || panel.lyric) && (
                <div className="win95-muted" style={{ marginTop: 4, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  “{panel.lyric_at_this_moment || panel.lyric}”
                </div>
              )}
              {panel.review_note && (
                <div style={{ fontSize: 11, color: 'var(--win-warn)', marginTop: 2 }}>{panel.review_note}</div>
              )}
              {canApprove && (
                <div className="win95-row" style={{ marginTop: 6 }}>
                  <Win95Button
                    className="win95-btn-sm"
                    onClick={() => reviewPanel(panel.id, 'approved')}
                    disabled={reviewing === panel.id || panel.asset_status === 'approved'}
                  >
                    Approve
                  </Win95Button>
                  <Win95Button
                    className="win95-btn-sm"
                    onClick={() => reviewPanel(panel.id, 'rejected')}
                    disabled={reviewing === panel.id}
                  >
                    Reject
                  </Win95Button>
                </div>
              )}
              <div className="win95-row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
                <Win95Button className="win95-btn-sm" onClick={() => movePanel(i, -1)} disabled={i === 0 || !canApprove}>↑</Win95Button>
                {canApprove && (
                  <Win95Button
                    className="win95-btn-sm"
                    onClick={() => regeneratePanel(panel)}
                    disabled={!!regenerating[panel.id] || !!uploading[panel.id]}
                  >
                    Redo
                  </Win95Button>
                )}
                {canApprove && (
                  <label className="win95-btn win95-btn-sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      disabled={!!regenerating[panel.id] || !!uploading[panel.id]}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (file) uploadPanelImage(panel, file)
                      }}
                    />
                  </label>
                )}
                <Win95Button className="win95-btn-sm" onClick={() => movePanel(i, 1)} disabled={i === panels.length - 1 || !canApprove}>↓</Win95Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
