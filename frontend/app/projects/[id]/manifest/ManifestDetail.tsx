'use client'

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface ShotManifest {
  id: string
  shot_number: string
  start_time: string
  end_time: string
  audio_cue: string
  location: string
  characters: string[]
  camera: string
  action: string
  mood: string
  continuity_rules: string[]
  negative_constraints: string[]
  status: string
}

type ShotForm = Omit<ShotManifest, 'id' | 'characters' | 'continuity_rules' | 'negative_constraints'> & {
  characters: string
  continuity_rules: string
  negative_constraints: string
}

const blankShot: ShotForm = {
  shot_number: '',
  start_time: '',
  end_time: '',
  audio_cue: '',
  location: '',
  characters: '',
  camera: '',
  action: '',
  mood: '',
  continuity_rules: '',
  negative_constraints: '',
  status: 'draft',
}

function joinList(value: string[] | undefined): string {
  return Array.isArray(value) ? value.join('\n') : ''
}

function splitList(value: string): string[] {
  return value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean)
}

function toForm(shot: ShotManifest): ShotForm {
  return {
    shot_number: shot.shot_number || '',
    start_time: shot.start_time || '',
    end_time: shot.end_time || '',
    audio_cue: shot.audio_cue || '',
    location: shot.location || '',
    characters: joinList(shot.characters),
    camera: shot.camera || '',
    action: shot.action || '',
    mood: shot.mood || '',
    continuity_rules: joinList(shot.continuity_rules),
    negative_constraints: joinList(shot.negative_constraints),
    status: shot.status || 'draft',
  }
}

function toPayload(form: ShotForm) {
  return {
    ...form,
    characters: splitList(form.characters),
    continuity_rules: splitList(form.continuity_rules),
    negative_constraints: splitList(form.negative_constraints),
  }
}

export default function ManifestDetail({ id }: { id: string }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [project, setProject] = useState<any>(null)
  const [manifests, setManifests] = useState<ShotManifest[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [expandedShot, setExpandedShot] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, ShotForm>>({})
  const [newShot, setNewShot] = useState<ShotForm>(blankShot)

  const load = async () => {
    try {
      const [projData, manifestData] = await Promise.all([
        api.projects.get(id),
        api.pipeline.getShotManifests(id),
      ])
      setProject(projData)
      const shots = manifestData.manifests || []
      setManifests(shots)
      setDrafts(Object.fromEntries(shots.map((shot: ShotManifest) => [shot.id, toForm(shot)])))
    } catch (e) {
      console.error('Error loading manifests:', e)
      setProject(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const updateDraft = (shotId: string, key: keyof ShotForm, value: string) => {
    setDrafts(current => ({
      ...current,
      [shotId]: { ...(current[shotId] || blankShot), [key]: value },
    }))
  }

  const saveShot = async (shotId: string) => {
    const draft = drafts[shotId]
    if (!draft?.shot_number.trim()) {
      alert('Shot number is required.')
      return
    }
    setWorking(true)
    try {
      await api.pipeline.updateShotManifest(id, shotId, toPayload(draft))
      await load()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Could not save shot.')
    } finally {
      setWorking(false)
    }
  }

  const addShot = async () => {
    if (!newShot.shot_number.trim()) {
      alert('Shot number is required.')
      return
    }
    setWorking(true)
    try {
      await api.pipeline.createShotManifest(id, toPayload(newShot))
      setNewShot(blankShot)
      await load()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Could not add shot.')
    } finally {
      setWorking(false)
    }
  }

  const deleteShot = async (shotId: string) => {
    if (!window.confirm('Delete this shot from the manifest?')) return
    setWorking(true)
    try {
      await api.pipeline.deleteShotManifest(id, shotId)
      if (expandedShot === shotId) setExpandedShot(null)
      await load()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Could not delete shot.')
    } finally {
      setWorking(false)
    }
  }

  const importGuide = async (file: File) => {
    setWorking(true)
    try {
      await api.pipeline.importProductionGuide(id, file)
      await load()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Could not import production guide.')
    } finally {
      setWorking(false)
    }
  }

  const handleApprove = async () => {
    if (manifests.length === 0) {
      alert('Add or import at least one shot before approving the manifest.')
      return
    }
    setWorking(true)
    try {
      await api.pipeline.approveManifests(id, { revision_notes: feedback })
      router.push(`/projects/${id}`)
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Could not approve manifests. Is the backend running?')
      setWorking(false)
    }
  }

  const handleRequestChanges = async () => {
    if (!feedback.trim()) return
    setWorking(true)
    try {
      await api.pipeline.reviseManifests(id, { revision_notes: feedback })
      router.push(`/projects/${id}`)
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Could not submit feedback. Is the backend running?')
      setWorking(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading production plan...
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <p className="text-gray-400 mb-2">Project not found.</p>
          <a href={`/projects/${id}`} className="text-purple-400 hover:underline text-sm">Back to project</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <a href={`/projects/${id}`} className="text-purple-400 text-sm hover:underline">
          Back to project
        </a>

        <div className="mt-6 mb-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Shot Manifest / Storyboard Plan</h1>
            <p className="text-gray-500 mt-2">
              {manifests.length} shots planned for <span className="text-white">{project.title}</span>.
              Edit the shot list or import a production guide before approving.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) importGuide(file)
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={working}
              className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 disabled:text-gray-600 text-sm"
            >
              Import Guide
            </button>
            <button
              onClick={handleApprove}
              disabled={working || manifests.length === 0}
              className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:text-gray-500 text-sm font-semibold"
            >
              {working ? 'Working...' : 'Approve Manifest'}
            </button>
          </div>
        </div>

        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-3">Add Shot Manually</h2>
          <ShotEditor
            form={newShot}
            onChange={(key, value) => setNewShot(current => ({ ...current, [key]: value }))}
            compact
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={addShot}
              disabled={working}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 text-sm font-semibold"
            >
              Add Shot
            </button>
          </div>
        </div>

        {manifests.length === 0 ? (
          <div className="text-center py-16 bg-gray-950 border border-gray-800 rounded-lg text-gray-500">
            No shots yet. Import a production guide or add the first shot manually.
          </div>
        ) : (
          <div className="bg-gray-900/40 rounded-lg border border-gray-800 overflow-hidden mb-8">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/50">
                    <th className="px-4 py-3 text-left font-semibold text-gray-300">#</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-300">Time</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-300">Audio Cue</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-300">Location</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-300">Action</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-300">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {manifests.map((shot) => (
                    <Fragment key={shot.id}>
                      <tr className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 text-gray-300 font-mono">{shot.shot_number}</td>
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{shot.start_time} - {shot.end_time}</td>
                        <td className="px-4 py-3 text-gray-400 text-sm">{shot.audio_cue?.substring(0, 38)}</td>
                        <td className="px-4 py-3 text-gray-300">{shot.location}</td>
                        <td className="px-4 py-3 text-gray-400 text-sm">{shot.action?.substring(0, 52)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setExpandedShot(expandedShot === shot.id ? null : shot.id)}
                            className="text-purple-400 hover:text-purple-300 text-sm"
                          >
                            {expandedShot === shot.id ? 'Close' : 'Edit'}
                          </button>
                        </td>
                      </tr>
                      {expandedShot === shot.id && (
                        <tr className="border-b border-purple-900/40 bg-gray-950">
                          <td colSpan={6} className="p-4">
                            <ShotEditor
                              form={drafts[shot.id] || toForm(shot)}
                              onChange={(key, value) => updateDraft(shot.id, key, value)}
                            />
                            <div className="flex justify-between gap-3 mt-4">
                              <button
                                onClick={() => deleteShot(shot.id)}
                                disabled={working}
                                className="px-4 py-2 rounded-lg border border-red-900 text-red-300 hover:border-red-700 disabled:text-gray-600 text-sm"
                              >
                                Delete Shot
                              </button>
                              <button
                                onClick={() => saveShot(shot.id)}
                                disabled={working}
                                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 text-sm font-semibold"
                              >
                                Save Shot
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-3">
              Notes
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Optional approval notes, or required feedback when requesting changes."
              className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
              rows={3}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={handleRequestChanges}
              disabled={working || !feedback.trim()}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                feedback.trim() && !working
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-700/40 text-gray-500 cursor-not-allowed'
              }`}
            >
              Request Changes
            </button>
            <button
              onClick={handleApprove}
              disabled={working || manifests.length === 0}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                !working && manifests.length > 0
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-green-600/40 text-gray-400 cursor-not-allowed'
              }`}
            >
              {working ? 'Processing...' : 'Approve Production Plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ShotEditor({
  form,
  onChange,
  compact = false,
}: {
  form: ShotForm
  onChange: (key: keyof ShotForm, value: string) => void
  compact?: boolean
}) {
  const inputClass = 'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-600'
  const labelClass = 'block text-xs uppercase tracking-widest text-gray-500 mb-1'

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <Field label="Shot #" className="md:col-span-1">
        <input value={form.shot_number} onChange={e => onChange('shot_number', e.target.value)} className={inputClass} placeholder="1" />
      </Field>
      <Field label="Start" className="md:col-span-1">
        <input value={form.start_time} onChange={e => onChange('start_time', e.target.value)} className={inputClass} placeholder="00:00:12" />
      </Field>
      <Field label="End" className="md:col-span-1">
        <input value={form.end_time} onChange={e => onChange('end_time', e.target.value)} className={inputClass} placeholder="00:00:16" />
      </Field>
      <Field label="Mood" className="md:col-span-1">
        <input value={form.mood} onChange={e => onChange('mood', e.target.value)} className={inputClass} placeholder="tense, joyful..." />
      </Field>
      <Field label="Audio Cue" className="md:col-span-2">
        <input value={form.audio_cue} onChange={e => onChange('audio_cue', e.target.value)} className={inputClass} placeholder="lyric or musical hit" />
      </Field>
      <Field label="Location" className="md:col-span-1">
        <input value={form.location} onChange={e => onChange('location', e.target.value)} className={inputClass} placeholder="rooftop, studio..." />
      </Field>
      <Field label="Characters" className="md:col-span-1">
        <input value={form.characters} onChange={e => onChange('characters', e.target.value)} className={inputClass} placeholder="comma separated" />
      </Field>
      <Field label="Action" className="md:col-span-2">
        <textarea value={form.action} onChange={e => onChange('action', e.target.value)} className={inputClass} rows={compact ? 2 : 3} placeholder="what happens in the shot" />
      </Field>
      <Field label="Camera" className="md:col-span-2">
        <textarea value={form.camera} onChange={e => onChange('camera', e.target.value)} className={inputClass} rows={compact ? 2 : 3} placeholder="framing, lens, movement" />
      </Field>
      {!compact && (
        <>
          <Field label="Continuity Rules" className="md:col-span-2">
            <textarea value={form.continuity_rules} onChange={e => onChange('continuity_rules', e.target.value)} className={inputClass} rows={3} placeholder="one per line or comma separated" />
          </Field>
          <Field label="Negative Constraints" className="md:col-span-2">
            <textarea value={form.negative_constraints} onChange={e => onChange('negative_constraints', e.target.value)} className={inputClass} rows={3} placeholder="what must not appear" />
          </Field>
        </>
      )}
    </div>
  )

  function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
    return (
      <label className={className}>
        <span className={labelClass}>{label}</span>
        {children}
      </label>
    )
  }
}
