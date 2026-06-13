'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function TreatmentPage() {
  const { id } = useParams()
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    api.projects.get(id as string).then(setProject).finally(() => setLoading(false))
  }, [id])

  const handleApprove = async () => {
    setApproving(true)
    try {
      await api.pipeline.approveTreatment(id as string, { notes })
      router.push(`/projects/${id}`)
    } catch (err) {
      alert('Failed to approve treatment. Is the backend running?')
      setApproving(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading…</div>
  if (!project?.treatment) return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-400">Treatment not ready yet.</p>
        <a href={`/projects/${id}`} className="text-purple-400 mt-2 block hover:underline">← Back to project</a>
      </div>
    </div>
  )

  const t = project.treatment

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto">
        <a href={`/projects/${id}`} className="text-purple-400 text-sm hover:underline">← Back to project</a>

        <h1 className="text-3xl font-bold mt-6 mb-1">Visual Treatment</h1>
        <p className="text-gray-500 mb-8">Review the AI-generated creative vision. Approve to begin image generation.</p>

        <div className="space-y-6">
          {/* Logline */}
          <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-2">Logline</h2>
            <p className="text-xl text-white italic leading-relaxed">"{t.logline}"</p>
          </div>

          {/* Style + World */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-2">Visual Style</h2>
              <p className="text-gray-200">{t.visual_style}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-2">World</h2>
              <p className="text-gray-200">{t.world_description}</p>
            </div>
          </div>

          {/* Color Palette */}
          {t.color_palette && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Color Palette</h2>
              <div className="flex flex-wrap gap-2">
                {t.color_palette.map((color: string, i: number) => (
                  <span key={i} className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">{color}</span>
                ))}
              </div>
            </div>
          )}

          {/* Characters */}
          {t.characters?.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Characters</h2>
              <div className="space-y-3">
                {t.characters.map((char: any, i: number) => (
                  <div key={i} className="border-b border-gray-800 pb-3 last:border-0 last:pb-0">
                    <div className="font-medium text-white">{char.name}</div>
                    <div className="text-gray-400 text-sm mt-1">{char.description}</div>
                    {char.states_needed && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {char.states_needed.map((s: string, j: number) => (
                          <span key={j} className="text-xs px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Locations */}
          {t.locations?.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Locations</h2>
              <ul className="space-y-2">
                {t.locations.map((loc: string, i: number) => (
                  <li key={i} className="text-gray-300 flex items-start gap-2">
                    <span className="text-purple-500 mt-1">▸</span> {loc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Style prompt preview */}
          {t.image_gen_style_prompt && (
            <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <h2 className="text-xs text-gray-500 uppercase tracking-widest mb-2">Image Generation Style</h2>
              <p className="text-gray-400 text-sm font-mono leading-relaxed">{t.image_gen_style_prompt}</p>
              <p className="text-gray-600 text-xs mt-2">This suffix will be appended to every FLUX.1 prompt to maintain visual consistency.</p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Notes for the record (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any thoughts on the treatment before proceeding…"
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {approving ? 'Approving…' : '✓ Approve & Generate Images'}
            </button>
            <a
              href={`/projects/${id}`}
              className="px-6 py-3 border border-gray-700 rounded-lg text-gray-400 hover:border-gray-500 transition-colors"
            >
              Cancel
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
