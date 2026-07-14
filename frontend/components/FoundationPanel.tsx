'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import {
  Win95Alert,
  Win95Button,
  Win95GroupBox,
  Win95Input,
  Win95Label,
  Win95Textarea,
} from '@/components/win95/Win95Primitives'

const ADDON_PATHS = [
  {
    key: 'karaoke',
    label: 'Karaoke Video',
    description: 'Same foundation lyrics with sing-along highlighting (next module after Lyric).',
  },
  {
    key: 'performance',
    label: 'Performance Music Video',
    description: 'Uses foundation timing; adds performer / footage modules (not re-intake).',
  },
  {
    key: 'cinematic',
    label: 'Cinematic Music Video',
    description: 'Uses foundation song intelligence; adds treatment → elements → storyboard stack.',
  },
]

/**
 * Shared foundation editor + optional format add-ons.
 * Foundation is song intelligence used by every video type (decision 2026-07-14).
 */
export default function FoundationPanel({
  project,
  projectId,
  onUpdated,
  showAddons = false,
}: {
  project: any
  projectId: string
  onUpdated: (project: any) => void
  showAddons?: boolean
}) {
  const [title, setTitle] = useState(project?.title || '')
  const [artist, setArtist] = useState(project?.artist || '')
  const [bpm, setBpm] = useState(project?.bpm || '')
  const [musicalKey, setMusicalKey] = useState(project?.musical_key || '')
  const [brief, setBrief] = useState(project?.user_brief || '')
  const [lyricsText, setLyricsText] = useState(() => {
    const segs = project?.transcript?.segments
    if (Array.isArray(segs) && segs.length) {
      return segs.map((s: any) => s.text || '').join('\n')
    }
    return project?.user_lyrics_text || ''
  })
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setTitle(project?.title || '')
    setArtist(project?.artist || '')
    setBpm(project?.bpm || '')
    setMusicalKey(project?.musical_key || '')
    setBrief(project?.user_brief || '')
    const segs = project?.transcript?.segments
    if (Array.isArray(segs) && segs.length) {
      setLyricsText(segs.map((s: any) => s.text || '').join('\n'))
    } else {
      setLyricsText(project?.user_lyrics_text || '')
    }
  }, [project?.id, project?.updated_at, project?.title, project?.stage])

  const paths: string[] = Array.isArray(project?.production_paths) ? project.production_paths : []

  const saveFoundation = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const segs = Array.isArray(project?.transcript?.segments) ? project.transcript.segments : []
      const lines = lyricsText.split(/\r?\n/)
      let transcript: object | undefined
      if (segs.length && lines.length) {
        // Preserve timestamps; replace text line-by-line when counts match,
        // otherwise keep structure and update what we can.
        const nextSegs = segs.map((seg: any, i: number) => ({
          ...seg,
          text: lines[i] !== undefined ? lines[i] : seg.text,
        }))
        transcript = { ...(project.transcript || {}), segments: nextSegs }
      }

      const updated = await api.projects.updateFoundation(projectId, {
        title: title.trim(),
        artist: artist.trim(),
        bpm: String(bpm || '').trim(),
        musical_key: String(musicalKey || '').trim(),
        brief: brief.trim(),
        user_lyrics_text: lyricsText,
        transcript,
      })
      onUpdated(updated)
      setMessage('Foundation saved. All video formats on this project will use these values.')
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not save foundation.')
    } finally {
      setSaving(false)
    }
  }

  const addPath = async (path: string) => {
    setAdding(path)
    setError('')
    setMessage('')
    try {
      const res = await api.projects.addProductionPath(projectId, path)
      if (res.project) onUpdated(res.project)
      setMessage(res.message || `Enabled ${path}.`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not enable format.')
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="win95-stack">
      <Win95GroupBox title="Shared foundation (edit anytime)">
        <p className="win95-muted" style={{ marginTop: 0 }}>
          This is the song intelligence every format uses: title, artist, rhythm, and lyrics.
          Fix anything wrong here — you should never need to re-upload the song just to correct a field.
        </p>
        <div className="win95-grid-2">
          <Win95Label>
            Title
            <Win95Input value={title} onChange={e => setTitle(e.target.value)} />
          </Win95Label>
          <Win95Label>
            Artist
            <Win95Input value={artist} onChange={e => setArtist(e.target.value)} />
          </Win95Label>
          <Win95Label>
            BPM
            <Win95Input value={bpm} onChange={e => setBpm(e.target.value)} />
          </Win95Label>
          <Win95Label>
            Key
            <Win95Input value={musicalKey} onChange={e => setMusicalKey(e.target.value)} />
          </Win95Label>
        </div>
        <Win95Label>
          Creative brief (optional)
          <Win95Textarea value={brief} onChange={e => setBrief(e.target.value)} rows={3} />
        </Win95Label>
        <Win95Label>
          Lyrics (one line per line — timestamps kept when line count matches)
          <Win95Textarea
            value={lyricsText}
            onChange={e => setLyricsText(e.target.value)}
            rows={8}
            style={{ fontFamily: 'var(--win-mono)' }}
          />
        </Win95Label>
        <Win95Button variant="primary" onClick={saveFoundation} disabled={saving}>
          {saving ? 'Saving…' : 'Save foundation'}
        </Win95Button>
      </Win95GroupBox>

      {showAddons && (
        <Win95GroupBox title="Build another format from this foundation">
          <p className="win95-muted" style={{ marginTop: 0 }}>
            Lyric Video is the first deliverable. Enable more formats when you are ready —
            they reuse the foundation above. Nothing re-uploads or re-transcribes automatically.
          </p>
          <div className="win95-stack">
            {ADDON_PATHS.map(p => {
              const enabled = paths.includes(p.key)
              return (
                <div key={p.key} className="win95-outset" style={{ padding: 8 }}>
                  <div className="win95-row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <div className="win95-strong">{p.label}</div>
                      <div className="win95-muted" style={{ fontSize: 11 }}>{p.description}</div>
                    </div>
                    {enabled ? (
                      <span className="win95-status win95-status-ok">Enabled</span>
                    ) : (
                      <Win95Button
                        className="win95-btn-sm"
                        disabled={Boolean(adding)}
                        onClick={() => addPath(p.key)}
                      >
                        {adding === p.key ? 'Adding…' : 'Enable'}
                      </Win95Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {paths.includes('cinematic') && (
            <p className="win95-muted" style={{ marginBottom: 0 }}>
              Cinematic is enabled — open the full workbook stages for treatment / elements / storyboard
              (still building on this foundation). Karaoke/performance generators ship after Lyric is solid.
            </p>
          )}
        </Win95GroupBox>
      )}

      {message && (
        <Win95Alert tone="success" title="OK" onDismiss={() => setMessage('')}>
          {message}
        </Win95Alert>
      )}
      {error && (
        <Win95Alert tone="error" title="Error" onDismiss={() => setError('')}>
          {error}
        </Win95Alert>
      )}
    </div>
  )
}
