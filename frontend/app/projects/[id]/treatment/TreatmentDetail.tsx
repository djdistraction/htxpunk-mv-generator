'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function TreatmentDetail({ id }: { id: string }) {
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [mode, setMode] = useState<'review' | 'changes'>('review')
  const [feedback, setFeedback] = useState('')

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
    // Auto-refresh while waiting for treatment
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [id])

  const handleApprove = async () => {
    setWorking(true)
    try {
      await api.pipeline.approveTreatment(id)
      router.push(`/projects/${id}`)
    } catch {
      alert('Could not approve. Is the backend running?')
      setWorking(false)
    }
  }

  const handleRequestChanges = async () => {
    if (!feedback.trim()) return
    setWorking(true)
    try {
      await api.pipeline.reviseTreatment(id, feedback.trim())
      router.push(`/projects/${id}`)
    } catch {
      alert('Could not submit feedback. Is the backend running?')
      setWorking(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading…</div>
  )

  if (!project?.treatment) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4 animate-pulse">🎬</div>
        <p className="text-gray-400 mb-2">Generating your creative vision…</p>
        <p className="text-gray-600 text-sm mb-6">This usually takes 1-2 minutes. The page will update automatically.</p>
        <a href={`/projects/${id}`} className="text-purple-400 hover:underline text-sm inline-block">← Back to project dashboard</a>
      </div>
    </div>
  )

  const t = project.treatment

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto">
        <a href={`/projects/${id}`} className="text-purple-400 text-sm hover:underline">← Back to project</a>

        <div className="mt-6 mb-8">
          <h1 className="text-3xl font-bold">Your Creative Vision</h1>
          <p className="text-gray-500 mt-2">
            Our AI director drafted this treatment for <span className="text-white">{project.title}</span>.
            Approve to start generating images, or request changes.
          </p>
        </div>

        <div className="space-y-5">
          <div className="bg-gradient-to-br from-purple-900/40 to-gray-900 rounded-xl p-6 border border-purple-800/50">
            <h2 className="text-xs text-purple-400 uppercase tracking-widest mb-3">The Concept</h2>
            <p className="text-2xl text-white font-light leading-relaxed italic">&ldquo;{t.logline}&rdquo;</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-2">Visual Style</h2>
              <p className="text-gray-200 leading-relaxed">{t.visual_style}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-2">The World</h2>
              <p className="text-gray-200 leading-relaxed">{t.world_description}</p>
            </div>
          </div>

          {t.color_palette?.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Color Palette</h2>
              <div className="flex flex-wrap gap-2">
                {t.color_palette.map((color: string, i: number) => (
                  <span key={i} className="px-3 py-1.5 bg-gray-800 rounded-full text-sm text-gray-200 border border-gray-700">
                    {color}
                  </span>
                ))}
              </div>
            </div>
          )}

          {t.characters?.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-4">Characters</h2>
              <div className="space-y-4">
                {t.characters.map((char: any, i: number) => (
                  <div key={i} className="border-l-2 border-purple-700 pl-4">
                    <div className="font-semibold text-white">{char.name}</div>
                    <div className="text-gray-400 text-sm mt-1 leading-relaxed">{char.description}</div>
                    {char.role && <div className="text-purple-400 text-xs mt-1">{char.role}</div>}
                    {char.states_needed?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {char.states_needed.map((s: string, j: number) => (
                          <span key={j} className="text-xs px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded-full">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {t.locations?.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Locations</h2>
              <div className="space-y-3">
                {t.locations.map((loc: any, i: number) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-purple-500 mt-0.5 flex-shrink-0">▸</span>
                    <div>
                      <span className="text-white font-medium">
                        {typeof loc === 'string' ? loc : loc.name}
                      </span>
                      {typeof loc === 'object' && loc.description && (
                        <p className="text-gray-400 text-sm mt-0.5">{loc.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {t.narrative_structure && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-2">Story Arc</h2>
              <p className="text-gray-300 leading-relaxed">{t.narrative_structure}</p>
            </div>
          )}

          <div className="pt-4">
            {mode === 'review' ? (
              <div className="space-y-3">
                <button
                  onClick={handleApprove}
                  disabled={working}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white font-semibold py-4 rounded-xl text-lg transition-colors"
                >
                  {working ? 'Approving…' : '✓ Looks great — start generating images'}
                </button>
                <button
                  onClick={() => setMode('changes')}
                  className="w-full border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white py-3 rounded-xl transition-colors"
                >
                  ✎ Request changes
                </button>
              </div>
            ) : (
              <div className="bg-gray-900 rounded-xl p-5 border border-yellow-800/50 space-y-4">
                <div>
                  <h3 className="font-semibold text-yellow-300 mb-1">What would you like changed?</h3>
                  <p className="text-gray-500 text-sm">Be specific — the AI will regenerate the treatment addressing your feedback.</p>
                </div>
                <textarea
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="e.g. Make it more cyberpunk, less gothic. Neon lights and rain-slicked streets instead of dark forests."
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 resize-none"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleRequestChanges}
                    disabled={working || !feedback.trim()}
                    className="flex-1 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    {working ? 'Submitting…' : '↩ Regenerate with these changes'}
                  </button>
                  <button
                    onClick={() => { setMode('review'); setFeedback('') }}
                    className="px-5 border border-gray-700 rounded-lg text-gray-400 hover:border-gray-500 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
