'use client'

import { useEffect, useState } from 'react'
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

export default function ManifestDetail({ id }: { id: string }) {
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [manifests, setManifests] = useState<ShotManifest[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [expandedShot, setExpandedShot] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [projData, manifestData] = await Promise.all([
          api.projects.get(id),
          api.pipeline.getShotManifests(id),
        ])
        setProject(projData)
        setManifests(manifestData.manifests || [])
      } catch (e) {
        console.error('Error loading manifests:', e)
        setProject(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handleApprove = async () => {
    setWorking(true)
    try {
      await api.pipeline.approveManifests(id, { revision_notes: feedback })
      router.push(`/projects/${id}`)
    } catch (e) {
      console.error('Error approving manifests:', e)
      alert('Could not approve manifests. Is the backend running?')
      setWorking(false)
    }
  }

  const handleRequestChanges = async () => {
    if (!feedback.trim()) return
    setWorking(true)
    try {
      await api.pipeline.reviseManifests(id, { revision_notes: feedback })
      router.push(`/projects/${id}`)
    } catch (e) {
      console.error('Error requesting changes:', e)
      alert('Could not submit feedback. Is the backend running?')
      setWorking(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading production plan…
      </div>
    )
  }

  if (!project || !manifests.length) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4 animate-pulse">📋</div>
          <p className="text-gray-400 mb-2">Building production plan…</p>
          <p className="text-gray-600 text-sm mb-6">
            The AI is analyzing your creative vision and planning the shots.
            This usually takes 2-3 minutes. The page will update automatically.
          </p>
          <a href={`/projects/${id}`} className="text-purple-400 hover:underline text-sm inline-block">
            ← Back to project dashboard
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <a href={`/projects/${id}`} className="text-purple-400 text-sm hover:underline">
          ← Back to project
        </a>

        <div className="mt-6 mb-8">
          <h1 className="text-3xl font-bold">Production Plan</h1>
          <p className="text-gray-500 mt-2">
            {manifests.length} shots planned for <span className="text-white">{project.title}</span>.
            Review the shot manifest and approve to begin storyboard generation.
          </p>
        </div>

        {/* Shot manifests table */}
        <div className="bg-gray-900/40 rounded-lg border border-gray-800 overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
                  <th className="px-4 py-3 text-left font-semibold text-gray-300">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-300">Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-300">Audio Cue</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-300">Location</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-300">Characters</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-300">Action</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-300">Details</th>
                </tr>
              </thead>
              <tbody>
                {manifests.map((shot, i) => (
                  <tr key={shot.id} className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 text-gray-300 font-mono">{shot.shot_number}</td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">{shot.start_time}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{shot.audio_cue.substring(0, 30)}</td>
                    <td className="px-4 py-3 text-gray-300">{shot.location}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{shot.characters.join(', ')}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{shot.action.substring(0, 40)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() =>
                          setExpandedShot(expandedShot === shot.id ? null : shot.id)
                        }
                        className="text-purple-400 hover:text-purple-300 text-sm font-mono"
                      >
                        {expandedShot === shot.id ? '▼' : '▶'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expanded shot details */}
        {expandedShot && (
          <div className="mb-8 bg-gray-900/40 rounded-lg p-6 border border-purple-800/30 space-y-4">
            {manifests.find((s) => s.id === expandedShot) && (
              <>
                <div>
                  <h3 className="text-purple-300 font-semibold mb-2">
                    Shot {manifests.find((s) => s.id === expandedShot)?.shot_number}
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 block text-xs uppercase mb-1">Mood</span>
                    <p className="text-gray-300">
                      {manifests.find((s) => s.id === expandedShot)?.mood}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs uppercase mb-1">Camera</span>
                    <p className="text-gray-300">
                      {manifests.find((s) => s.id === expandedShot)?.camera}
                    </p>
                  </div>
                </div>
                {manifests.find((s) => s.id === expandedShot)?.continuity_rules?.length > 0 && (
                  <div>
                    <span className="text-gray-500 block text-xs uppercase mb-2">Continuity Rules</span>
                    <ul className="list-disc list-inside space-y-1 text-gray-300 text-sm">
                      {manifests
                        .find((s) => s.id === expandedShot)
                        ?.continuity_rules.map((rule, i) => (
                          <li key={i}>{rule}</li>
                        ))}
                    </ul>
                  </div>
                )}
                {manifests.find((s) => s.id === expandedShot)?.negative_constraints?.length > 0 && (
                  <div>
                    <span className="text-gray-500 block text-xs uppercase mb-2">Negative Constraints</span>
                    <ul className="list-disc list-inside space-y-1 text-gray-400 text-sm">
                      {manifests
                        .find((s) => s.id === expandedShot)
                        ?.negative_constraints.map((constraint, i) => (
                          <li key={i}>{constraint}</li>
                        ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Approval section */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-3">
              Notes (optional)
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Any feedback or changes you'd like to suggest? Leave blank to approve as-is."
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
              disabled={working}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                !working
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-green-600/40 text-gray-400 cursor-not-allowed'
              }`}
            >
              {working ? 'Processing…' : 'Approve Production Plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
