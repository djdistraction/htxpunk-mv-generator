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
  Win95Textarea,
} from '@/components/win95/Win95Primitives'

export default function TreatmentDetail({ id }: { id: string }) {
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [mode, setMode] = useState<'review' | 'changes'>('review')
  const [feedback, setFeedback] = useState('')
  const [references, setReferences] = useState<ReferenceItem[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.projects.get(id)
        setProject(data)
      } catch {
        setProject(null)
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [id])

  const handleApprove = async () => {
    setWorking(true)
    setError('')
    try {
      await api.pipeline.approveTreatment(id)
      router.push(`/projects/${id}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not approve. Is the backend running?')
      setWorking(false)
    }
  }

  const handleRequestChanges = async () => {
    if (!feedback.trim() && references.length === 0) return
    setWorking(true)
    setError('')
    try {
      if (references.length > 0) {
        const form = new FormData()
        appendReferences(form, references)
        await api.projects.addReferences(id, form)
      }
      await api.pipeline.reviseTreatment(id, feedback.trim() || 'Incorporate the newly added reference files.')
      router.push(`/projects/${id}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not submit feedback. Is the backend running?')
      setWorking(false)
    }
  }

  if (loading) return <div className="win95-empty">Loading treatment…</div>

  if (!project?.treatment) {
    return (
      <div className="win95-page">
        <div className="win95-page-header">
          <h1 className="win95-page-title">Visual Treatment</h1>
          <Link href={`/projects/${id}`} className="win95-btn win95-btn-link">← Workbook</Link>
        </div>
        <div className="win95-empty">
          Generating creative vision… This usually takes 1–2 minutes. This page refreshes automatically.
        </div>
      </div>
    )
  }

  const t = project.treatment

  return (
    <div className="win95-page">
      <div className="win95-page-header">
        <div>
          <h1 className="win95-page-title">Visual Treatment</h1>
          <p className="win95-page-sub">
            Creative direction for <strong>{project.title}</strong>. Approve to unlock the Element Plan, or request changes.
          </p>
        </div>
        <Link href={`/projects/${id}`} className="win95-btn win95-btn-link">← Workbook</Link>
      </div>

      {error && (
        <Win95Alert tone="error" title="Action failed" onDismiss={() => setError('')}>
          {error}
        </Win95Alert>
      )}

      <Win95GroupBox title="The Concept">
        <p style={{ margin: 0, fontSize: 14, fontStyle: 'italic', lineHeight: 1.5 }}>
          “{t.logline}”
        </p>
      </Win95GroupBox>

      <div className="win95-grid-2">
        <Win95GroupBox title="Visual Style">
          <p style={{ margin: 0, lineHeight: 1.5 }}>{t.visual_style}</p>
        </Win95GroupBox>
        <Win95GroupBox title="The World">
          <p style={{ margin: 0, lineHeight: 1.5 }}>{t.world_description}</p>
        </Win95GroupBox>
      </div>

      {t.color_palette?.length > 0 && (
        <Win95GroupBox title="Color Palette">
          <div className="win95-row">
            {t.color_palette.map((color: string, i: number) => (
              <span key={i} className="win95-status win95-status-muted">{color}</span>
            ))}
          </div>
        </Win95GroupBox>
      )}

      {t.characters?.length > 0 && (
        <Win95GroupBox title="Characters">
          <div className="win95-stack">
            {t.characters.map((char: any, i: number) => (
              <div key={i} style={{ borderLeft: '3px solid var(--win-title)', paddingLeft: 10 }}>
                <div className="win95-strong">{char.name}</div>
                <div className="win95-muted">{char.description}</div>
                {char.role && <div style={{ fontSize: 11, color: 'var(--win-info)' }}>{char.role}</div>}
                {char.states_needed?.length > 0 && (
                  <div className="win95-row" style={{ marginTop: 4 }}>
                    {char.states_needed.map((s: string, j: number) => (
                      <span key={j} className="win95-status win95-status-info">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Win95GroupBox>
      )}

      {t.locations?.length > 0 && (
        <Win95GroupBox title="Locations">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {t.locations.map((loc: any, i: number) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <strong>{typeof loc === 'string' ? loc : loc.name}</strong>
                {typeof loc === 'object' && loc.description && (
                  <span className="win95-muted"> — {loc.description}</span>
                )}
              </li>
            ))}
          </ul>
        </Win95GroupBox>
      )}

      {t.narrative_structure && (
        <Win95GroupBox title="Story Arc">
          <p style={{ margin: 0, lineHeight: 1.5 }}>{t.narrative_structure}</p>
        </Win95GroupBox>
      )}

      {mode === 'review' ? (
        <div className="win95-row">
          <Win95Button variant="primary" onClick={handleApprove} disabled={working}>
            {working ? 'Approving…' : 'Approve treatment'}
          </Win95Button>
          <Win95Button onClick={() => setMode('changes')}>Request changes…</Win95Button>
        </div>
      ) : (
        <Win95GroupBox title="Request changes">
          <p className="win95-muted" style={{ marginTop: 0 }}>
            Be specific — the AI regenerates the treatment using your feedback.
          </p>
          <Win95Textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="e.g. More cyberpunk, less gothic. Neon rain-slicked streets instead of dark forests."
            rows={4}
            autoFocus
          />
          <div style={{ marginTop: 10, marginBottom: 10 }}>
            <p className="win95-muted" style={{ marginTop: 0 }}>Optional references (mood boards, notes):</p>
            <ReferenceUploader items={references} onChange={setReferences} accent="yellow" />
          </div>
          <div className="win95-row">
            <Win95Button
              variant="primary"
              onClick={handleRequestChanges}
              disabled={working || (!feedback.trim() && references.length === 0)}
            >
              {working ? 'Submitting…' : 'Regenerate with these changes'}
            </Win95Button>
            <Win95Button
              onClick={() => {
                setMode('review')
                setFeedback('')
                setReferences([])
              }}
            >
              Cancel
            </Win95Button>
          </div>
        </Win95GroupBox>
      )}
    </div>
  )
}
