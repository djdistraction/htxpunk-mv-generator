'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

type Segment = { start: number; end?: number; text: string }

export default function ReviewDetail({ id }: { id: string }) {
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [composer, setComposer] = useState('')
  const [album, setAlbum] = useState('')
  const [segments, setSegments] = useState<Segment[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await api.projects.get(id)
        if (cancelled) return
        setProject(data)
        // Only seed the editable fields once, the first time the gate's data
        // arrives — otherwise the 3s poll would clobber in-progress edits.
        if (data.stage === 'awaiting_project_info_review' && title === '' && artist === '') {
          setTitle(data.title || '')
          setArtist(data.artist || '')
          setComposer(data.composer || '')
          setAlbum(data.album || '')
          setSegments(data.transcript?.segments || [])
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
  }, [id])

  const handleSave = async () => {
    setWorking(true)
    try {
      await api.projects.confirmInfo(id, {
        title: title.trim(),
        artist: artist.trim(),
        composer: composer.trim(),
        album: album.trim(),
        transcript: { ...(project.transcript || {}), segments },
      })
      router.push(`/projects/${id}`)
    } catch {
      alert('Could not save — is the backend running?')
      setWorking(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading…</div>
  )
  if (!project) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">Project not found</div>
  )

  if (project.stage !== 'awaiting_project_info_review') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4 animate-pulse">🎧</div>
          <p className="text-gray-400 mb-2">
            Converting audio, reading tags, isolating vocals, and transcribing…
          </p>
          <p className="text-gray-600 text-sm mb-6">
            This can take a few minutes for vocal separation and transcription. The page will update automatically.
          </p>
          <a href={`/projects/${id}`} className="text-purple-400 hover:underline text-sm inline-block">← Back to project dashboard</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto">
        <a href={`/projects/${id}`} className="text-purple-400 text-sm hover:underline">← Back to project</a>

        <div className="mt-6 mb-8">
          <h1 className="text-3xl font-bold">Review Song Info</h1>
          <p className="text-gray-500 mt-2">
            Here&rsquo;s what we extracted before handing this off to the AI director.
            Fix anything that&rsquo;s wrong — nothing here is required.
          </p>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Title" value={title} onChange={setTitle} />
            <Field label="Artist" value={artist} onChange={setArtist} />
            <Field label="Composer" value={composer} onChange={setComposer} />
            <Field label="Album" value={album} onChange={setAlbum} />
          </div>

          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Measured (locked)</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <Locked label="Length" value={project.song_length ? `${project.song_length}s` : '—'} />
              <Locked label="BPM" value={project.bpm || 'Not measured'} />
              <Locked label="Key" value={project.musical_key || 'Not measured'} />
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">
              Transcript ({segments.length} lines)
            </h2>
            {segments.length === 0 ? (
              <p className="text-gray-600 text-sm italic">No transcript captured.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {segments.map((seg, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-gray-600 text-xs font-mono pt-2 w-14 flex-shrink-0">
                      {seg.start.toFixed(1)}s
                    </span>
                    <input
                      value={seg.text}
                      onChange={e => {
                        const next = [...segments]
                        next[i] = { ...next[i], text: e.target.value }
                        setSegments(next)
                      }}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={working}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white font-semibold py-4 rounded-xl text-lg transition-colors"
          >
            {working ? 'Saving…' : '✓ Create Project & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <label className="text-xs text-gray-500 uppercase tracking-widest">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-transparent border-b border-gray-700 focus:outline-none focus:border-purple-500 text-white py-1 mt-1"
      />
    </div>
  )
}

function Locked({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500 block">{label}</span>
      <p className="text-gray-200">{value}</p>
    </div>
  )
}
