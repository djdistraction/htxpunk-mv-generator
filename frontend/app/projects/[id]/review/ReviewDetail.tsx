'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import ReferenceUploader, { ReferenceItem, appendReferences } from '@/components/ReferenceUploader'
import {
  Win95Alert,
  Win95Button,
  Win95GroupBox,
  Win95Input,
  Win95Label,
  Win95Select,
  Win95Textarea,
} from '@/components/win95/Win95Primitives'

type Segment = { start: number; end?: number; text: string }

const PRODUCTION_PATHS = [
  { key: 'lyric', label: 'Lyric Video' },
  { key: 'karaoke', label: 'Karaoke Video' },
  { key: 'performance', label: 'Performance Music Video' },
  { key: 'cinematic', label: 'Cinematic Music Video' },
]

export default function ReviewDetail({ id }: { id: string }) {
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [seeded, setSeeded] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [composer, setComposer] = useState('')
  const [album, setAlbum] = useState('')
  const [segments, setSegments] = useState<Segment[]>([])
  const [productionPaths, setProductionPaths] = useState<string[]>([])
  const [showRealign, setShowRealign] = useState(false)
  const [realignText, setRealignText] = useState('')
  const [realigning, setRealigning] = useState(false)
  const [realignError, setRealignError] = useState('')

  const [seriesList, setSeriesList] = useState<any[]>([])
  const [seriesId, setSeriesId] = useState('')
  const [showNewSeries, setShowNewSeries] = useState(false)
  const [newSeriesName, setNewSeriesName] = useState('')
  const [brief, setBrief] = useState('')
  const [references, setReferences] = useState<ReferenceItem[]>([])

  useEffect(() => {
    api.series.list().then(setSeriesList).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await api.projects.get(id)
        if (cancelled) return
        setProject(data)
        if (data.stage === 'awaiting_project_info_review' && !seeded) {
          setSeeded(true)
          setTitle(data.title || '')
          setArtist(data.artist || '')
          setComposer(data.composer || '')
          setAlbum(data.album || '')
          setSegments(data.transcript?.segments || [])
          setProductionPaths(
            Array.isArray(data.production_paths) && data.production_paths.length > 0
              ? data.production_paths
              : ['lyric']
          )
          setSeriesId(data.series_id || '')
          setBrief(data.user_brief || '')
        }
      } catch {
        if (!cancelled) setProject(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 3000)
    return () => { cancelled = true; clearInterval(interval) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, seeded])

  const handleCreateSeries = async () => {
    if (!newSeriesName.trim()) return
    try {
      const s = await api.series.create(newSeriesName.trim(), artist)
      setSeriesList(prev => [s, ...prev])
      setSeriesId(s.id)
      setShowNewSeries(false)
      setNewSeriesName('')
    } catch {
      setError('Could not create series.')
    }
  }

  const handleSave = async () => {
    if (productionPaths.length < 1 || productionPaths.length > 2) {
      setError('Choose one production path, or a hybrid of any two.')
      return
    }
    setWorking(true)
    setError('')
    try {
      if (references.length > 0) {
        const form = new FormData()
        appendReferences(form, references)
        form.append('source', 'initial')
        await api.projects.addReferences(id, form)
      }
      await api.projects.confirmInfo(id, {
        title: title.trim(),
        artist: artist.trim(),
        composer: composer.trim(),
        album: album.trim(),
        transcript: { ...(project.transcript || {}), segments },
        production_paths: productionPaths,
        series_id: seriesId || undefined,
        brief: brief.trim(),
      })
      router.push(`/projects/${id}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not save — is the backend running?')
      setWorking(false)
    }
  }

  const handleRealign = async () => {
    if (!realignText.trim()) return
    setRealigning(true)
    setRealignError('')
    try {
      const { project: updated } = await api.projects.alignLyrics(id, realignText.trim())
      setSegments(updated?.transcript?.segments || [])
      setShowRealign(false)
      setRealignText('')
    } catch (err: any) {
      setRealignError(err?.response?.data?.detail || err?.message || 'Alignment failed — check that a vocal stem is available.')
    } finally {
      setRealigning(false)
    }
  }

  const toggleProductionPath = (path: string) => {
    setProductionPaths(current => {
      if (current.includes(path)) return current.filter(item => item !== path)
      if (current.length >= 2) return current
      return [...current, path]
    })
  }

  if (loading) return <div className="win95-empty">Loading…</div>
  if (!project) return <div className="win95-empty">Project not found</div>

  if (project.stage !== 'awaiting_project_info_review') {
    return (
      <div className="win95-page">
        <div className="win95-page-header">
          <h1 className="win95-page-title">Review Song Info</h1>
          <Link href={`/projects/${id}`} className="win95-btn win95-btn-link">← Workbook</Link>
        </div>
        <div className="win95-empty">
          Still preparing audio (convert, tags, vocals, lyrics)… Current stage: <strong>{project.stage}</strong>.
          This page updates automatically when review is ready.
        </div>
      </div>
    )
  }

  return (
    <div className="win95-page">
      <div className="win95-page-header">
        <div>
          <h1 className="win95-page-title">Review Song Info</h1>
          <p className="win95-page-sub">
            Confirm title, path, and transcript before the production workbook continues.
            Fix anything wrong — fields are editable.
          </p>
        </div>
        <Link href={`/projects/${id}`} className="win95-btn win95-btn-link">← Workbook</Link>
      </div>

      {error && (
        <Win95Alert tone="error" title="Could not save" onDismiss={() => setError('')}>
          {error}
        </Win95Alert>
      )}

      <Win95GroupBox title="Metadata">
        <div className="win95-grid-2">
          <Win95Label>Title <Win95Input value={title} onChange={e => setTitle(e.target.value)} /></Win95Label>
          <Win95Label>Artist <Win95Input value={artist} onChange={e => setArtist(e.target.value)} /></Win95Label>
          <Win95Label>Composer <Win95Input value={composer} onChange={e => setComposer(e.target.value)} /></Win95Label>
          <Win95Label>Album <Win95Input value={album} onChange={e => setAlbum(e.target.value)} /></Win95Label>
        </div>
      </Win95GroupBox>

      <Win95GroupBox title="Measured (locked)">
        <div className="win95-grid-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div><span className="win95-muted">Length</span><div className="win95-strong">{project.song_length ? `${project.song_length}s` : '—'}</div></div>
          <div><span className="win95-muted">BPM</span><div className="win95-strong">{project.bpm || 'Not measured'}</div></div>
          <div><span className="win95-muted">Key</span><div className="win95-strong">{project.musical_key || 'Not measured'}</div></div>
        </div>
      </Win95GroupBox>

      <Win95GroupBox title="Production Path">
        <p className="win95-muted" style={{ marginTop: 0 }}>Choose one, or combine any two.</p>
        <div className="win95-grid-2">
          {PRODUCTION_PATHS.map(path => {
            const selected = productionPaths.includes(path.key)
            const disabled = !selected && productionPaths.length >= 2
            return (
              <label
                key={path.key}
                className={`win95-path-card ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
              >
                <div className="win95-row">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={disabled}
                    onChange={() => toggleProductionPath(path.key)}
                  />
                  <span className="win95-strong">{path.label}</span>
                </div>
              </label>
            )
          })}
        </div>
      </Win95GroupBox>

      <Win95GroupBox title={`Transcript (${segments.length} lines)`}>
        <div className="win95-row" style={{ marginBottom: 8 }}>
          <Win95Button onClick={() => setShowRealign(v => !v)}>
            {showRealign ? 'Cancel re-align' : 'Transcript wrong? Paste correct lyrics'}
          </Win95Button>
        </div>

        {showRealign && (
          <div style={{ marginBottom: 12 }}>
            <p className="win95-muted">
              Paste exact lyrics — we force-align them against the vocal stem instead of Whisper.
            </p>
            <Win95Textarea
              value={realignText}
              onChange={e => setRealignText(e.target.value)}
              rows={6}
              placeholder="One lyric line per line…"
              style={{ fontFamily: 'var(--win-mono)' }}
            />
            {realignError && (
              <p style={{ color: 'var(--win-danger)' }}>{realignError}</p>
            )}
            <Win95Button
              variant="primary"
              onClick={handleRealign}
              disabled={realigning || !realignText.trim()}
            >
              {realigning ? 'Aligning…' : 'Re-align lyrics'}
            </Win95Button>
          </div>
        )}

        {segments.length === 0 ? (
          <p className="win95-muted">No transcript captured.</p>
        ) : (
          <div className="win95-inset" style={{ maxHeight: 320, overflowY: 'auto', padding: 8 }}>
            {segments.map((seg, i) => (
              <div key={i} className="win95-row" style={{ marginBottom: 4, alignItems: 'center' }}>
                <span className="win95-muted" style={{ width: 48, fontFamily: 'var(--win-mono)', flex: 'none' }}>
                  {seg.start.toFixed(1)}s
                </span>
                <Win95Input
                  value={seg.text}
                  onChange={e => {
                    const next = [...segments]
                    next[i] = { ...next[i], text: e.target.value }
                    setSegments(next)
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Win95GroupBox>

      <Win95GroupBox title="Series (optional)">
        <div className="win95-row">
          <Win95Select value={seriesId} onChange={e => setSeriesId(e.target.value)} style={{ flex: 1 }}>
            <option value="">— Standalone video —</option>
            {seriesList.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.artist ? ` (${s.artist})` : ''}</option>
            ))}
          </Win95Select>
          <Win95Button onClick={() => setShowNewSeries(v => !v)}>+ New</Win95Button>
        </div>
        {showNewSeries && (
          <div className="win95-row" style={{ marginTop: 8 }}>
            <Win95Input
              value={newSeriesName}
              onChange={e => setNewSeriesName(e.target.value)}
              placeholder="Series name…"
              style={{ flex: 1 }}
            />
            <Win95Button onClick={handleCreateSeries} disabled={!newSeriesName.trim()}>Create</Win95Button>
          </div>
        )}
      </Win95GroupBox>

      <Win95GroupBox title="Your Vision (optional)">
        <Win95Textarea
          value={brief}
          onChange={e => setBrief(e.target.value)}
          rows={4}
          placeholder="Story, mood, characters, settings, references… Leave blank and the AI invents from the song alone."
        />
      </Win95GroupBox>

      <Win95GroupBox title="Reference Files (optional)">
        <ReferenceUploader items={references} onChange={setReferences} />
      </Win95GroupBox>

      <div className="win95-row">
        <Win95Button variant="primary" onClick={handleSave} disabled={working}>
          {working ? 'Saving…' : 'Confirm & Continue'}
        </Win95Button>
      </div>
    </div>
  )
}
