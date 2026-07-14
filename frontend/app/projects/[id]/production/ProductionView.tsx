'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, mediaUrl } from '@/lib/api'
import {
  Win95Alert,
  Win95Button,
  Win95GroupBox,
  Win95Progress,
  Win95StatusBadge,
} from '@/components/win95/Win95Primitives'

const STAGE_PROGRESS: Record<string, number> = {
  assembling: 70,
  assembling_lyric_video: 70,
  base_video_ready: 100,
  complete: 100,
}

export default function ProductionView({ id }: { id: string }) {
  const [project, setProject] = useState<any>(null)
  const [clips, setClips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [localError, setLocalError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

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
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return <div className="win95-empty">Loading production output…</div>
  if (!project) return <div className="win95-empty">Project not found.</div>

  const progress = STAGE_PROGRESS[project.stage] ?? (project.video_url || project.base_video_url ? 100 : 25)
  const finalVideoAsset = clips.find(clip => clip.asset_type === 'final_video')
  const baseVideoUrl = project.base_video_url
    ? mediaUrl(project.base_video_url)
    : (project.video_url ? mediaUrl(project.video_url) : '')
  const finalVideoUrl = project.final_video_url
    ? mediaUrl(project.final_video_url)
    : (finalVideoAsset?.url ? mediaUrl(finalVideoAsset.url) : '')
  const reviewVideoUrl = finalVideoUrl || baseVideoUrl
  const finalApproved = project.section_statuses?.final_video?.status === 'approved'
    || project.stage === 'complete'
    || Boolean(project.final_video_url)
  const isRendering = project.stage === 'assembling' || project.stage === 'assembling_lyric_video'
  const isLyric = Array.isArray(project.production_paths)
    && project.production_paths.length === 1
    && project.production_paths[0] === 'lyric'
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
    setSuccessMsg('')
    try {
      const updated = await api.projects.approveSection(id, 'final_video')
      setProject(updated)
      setSuccessMsg('Final export approved. This project is complete.')
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
    setSuccessMsg('')
    try {
      const updated = await api.projects.rejectSection(id, 'final_video', note)
      setProject(updated)
      setSuccessMsg('Final export rejected. Fix upstream stages, then regenerate.')
    } catch (err: any) {
      setLocalError(err?.response?.data?.detail || err?.message || 'Could not reject final video.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="win95-page">
      <div className="win95-page-header">
        <div>
          <h1 className="win95-page-title">Production Review</h1>
          <p className="win95-page-sub">
            {isLyric ? 'Lyric Video output' : 'Base / final video output'} for{' '}
            <strong>{project.title || 'Untitled'}</strong>
            {project.artist ? ` — ${project.artist}` : ''}
          </p>
        </div>
        <div className="win95-row">
          <Win95StatusBadge
            status={
              finalApproved ? 'ok' :
              isRendering ? 'running' :
              reviewVideoUrl ? 'warn' :
              'muted'
            }
          >
            {finalApproved ? 'Final approved' :
              isRendering ? 'Rendering…' :
              reviewVideoUrl ? 'Ready for review' :
              'Waiting'}
          </Win95StatusBadge>
          <Link href={`/projects/${id}`} className="win95-btn win95-btn-link">← Workbook</Link>
        </div>
      </div>

      {localError && (
        <Win95Alert tone="error" title="Action failed" onDismiss={() => setLocalError('')}>
          {localError}
        </Win95Alert>
      )}
      {successMsg && (
        <Win95Alert tone="success" title="Saved" onDismiss={() => setSuccessMsg('')}>
          {successMsg}
        </Win95Alert>
      )}
      {project.stage === 'error' && project.error_message && (
        <Win95Alert tone="error" title="Render / pipeline error">
          <div style={{ fontFamily: 'var(--win-mono)', whiteSpace: 'pre-wrap', marginBottom: 8 }}>
            {project.error_message}
          </div>
          <p className="win95-muted" style={{ marginTop: 0 }}>
            {/remotion|npx|node_modules/i.test(project.error_message || '')
              ? 'Remotion/Node issue: run cd remotion-composer && npm install, then retry from the workbook.'
              : /huggingface|api-inference|Connection error|getaddrinfo|FLUX/i.test(project.error_message || '')
                ? 'Network/image-API failure — not an npm install problem. Pure Lyric Video should not call image APIs.'
                : 'See the error text above for the real cause, then retry from the workbook.'}
          </p>
          <Link href={`/projects/${id}`} className="win95-btn win95-btn-link">← Back to workbook</Link>
        </Win95Alert>
      )}

      {!reviewVideoUrl && (
        <Win95GroupBox title="Render progress">
          <Win95Progress
            value={progress}
            label={
              isRendering
                ? (isLyric ? 'Assembling lyric video…' : 'Assembling base video…')
                : 'Waiting for video generation'
            }
          />
          <p className="win95-muted" style={{ marginBottom: 0, marginTop: 8 }}>
            Stage: <strong>{project.stage}</strong>. This page auto-refreshes every 5 seconds.
            {isLyric
              ? ' Lyric Video uses Remotion over the approved transcript — no storyboard frames required.'
              : ' Cinematic assembly uses the approved storyboard and configured video backend.'}
          </p>
        </Win95GroupBox>
      )}

      {reviewVideoUrl && (
        <Win95GroupBox title={finalApproved ? 'Final Music Video' : 'Video Preview'}>
          <div className="win95-row" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
            <div>
              <div className="win95-strong">
                {finalApproved ? 'Approved final export' : 'Review before final approval'}
              </div>
              <div className="win95-muted">
                {finalApproved
                  ? 'This output is locked in as the project deliverable.'
                  : 'Approve only if this is acceptable as the finished music video.'}
              </div>
            </div>
            <div className="win95-row">
              {!finalApproved && (
                <>
                  <Win95Button onClick={rejectFinal} disabled={working}>Reject</Win95Button>
                  <Win95Button variant="primary" onClick={approveFinal} disabled={working}>
                    {working ? 'Working…' : 'Approve Final'}
                  </Win95Button>
                </>
              )}
              <Win95Button onClick={handleDownload}>Download MP4</Win95Button>
            </div>
          </div>
          <video
            src={reviewVideoUrl}
            controls
            className="win95-media"
            style={{ maxHeight: 480, width: '100%', background: '#000' }}
          />
          <div className="win95-muted" style={{ marginTop: 8, wordBreak: 'break-all' }}>
            Source: {finalVideoUrl ? 'final_video_url' : 'base_video_url'} · {reviewVideoUrl}
          </div>
        </Win95GroupBox>
      )}

      {clipList.length > 0 && (
        <Win95GroupBox title={`Generated Clips (${readyClips.length}/${clipList.length})`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {clipList.map((clip: any, i: number) => (
              <div key={clip.id} className="win95-outset" style={{ padding: 6 }}>
                {clip.url ? (
                  <video src={mediaUrl(clip.url)} controls muted className="win95-media" style={{ aspectRatio: '16/9' }} />
                ) : (
                  <div className="win95-empty" style={{ padding: 20 }}>Rendering…</div>
                )}
                <div className="win95-muted" style={{ marginTop: 4 }}>Clip {i + 1}</div>
                {clip.scene_description && (
                  <div style={{ fontSize: 11 }}>{clip.scene_description}</div>
                )}
              </div>
            ))}
          </div>
        </Win95GroupBox>
      )}

      {isRendering && !reviewVideoUrl && clipList.length === 0 && (
        <div className="win95-empty">
          {isLyric
            ? 'Rendering lyric video from approved timestamps…'
            : 'Assembling video from storyboard panels…'}
        </div>
      )}

      {!isRendering && !reviewVideoUrl && (
        <Win95Alert tone="info" title="No video yet">
          Generate the video from the workbook’s Final Video stage, then return here to review and approve.
        </Win95Alert>
      )}
    </div>
  )
}
