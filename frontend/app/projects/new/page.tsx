'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import ReferenceUploader, { ReferenceItem, appendReferences } from '@/components/ReferenceUploader'

export default function NewProjectPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [brief, setBrief] = useState('')
  const [references, setReferences] = useState<ReferenceItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [seriesList, setSeriesList] = useState<any[]>([])
  const [seriesId, setSeriesId] = useState('')
  const [showNewSeries, setShowNewSeries] = useState(false)
  const [newSeriesName, setNewSeriesName] = useState('')

  useEffect(() => {
    api.series.list().then(setSeriesList).catch(() => {})
  }, [])

  const handleCreateSeries = async () => {
    if (!newSeriesName.trim()) return
    try {
      const s = await api.series.create(newSeriesName.trim(), artist)
      setSeriesList(prev => [s, ...prev])
      setSeriesId(s.id)
      setShowNewSeries(false)
      setNewSeriesName('')
    } catch {
      alert('Could not create series.')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !title) return
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('title', title)
      formData.append('artist', artist)
      formData.append('file', file)
      if (seriesId) formData.append('series_id', seriesId)
      if (brief.trim()) formData.append('brief', brief.trim())
      if (references.length > 0) appendReferences(formData, references)
      const project = await api.projects.uploadAudio(formData)
      router.push(`/projects/${project.id}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Upload failed. Check that the backend is running.')
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-xl mx-auto">
        <a href="/" className="text-purple-400 text-sm hover:underline">← Back to projects</a>

        <h1 className="text-3xl font-bold mt-6 mb-2">New Music Video</h1>
        <p className="text-gray-400 mb-8">
          The song is all you need to start. Share your vision and any reference
          files too, and the AI will build on your ideas instead of guessing.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Song Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              placeholder="e.g. Midnight Run"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Artist */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Artist</label>
            <input
              type="text"
              value={artist}
              onChange={e => setArtist(e.target.value)}
              placeholder="e.g. DJ Distraction"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Series */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Part of a Series?
              <span className="text-gray-500 font-normal ml-2">— links this video to recurring characters & style</span>
            </label>
            <div className="flex gap-2">
              <select
                value={seriesId}
                onChange={e => setSeriesId(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">— Standalone video —</option>
                {seriesList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.artist ? ` (${s.artist})` : ''}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewSeries(v => !v)}
                className="px-3 border border-gray-700 rounded-lg text-gray-400 hover:border-purple-500 hover:text-purple-400 transition text-sm"
              >
                + New
              </button>
            </div>

            {showNewSeries && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newSeriesName}
                  onChange={e => setNewSeriesName(e.target.value)}
                  placeholder="Series name…"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-purple-500"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreateSeries}
                  disabled={!newSeriesName.trim()}
                  className="px-3 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 rounded-lg text-sm text-white transition"
                >
                  Create
                </button>
              </div>
            )}
          </div>

          {/* Audio file */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Audio File *</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-gray-900 border-2 border-dashed border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-purple-500 transition-colors"
            >
              {file ? (
                <div>
                  <div className="text-purple-400 text-2xl mb-1">🎵</div>
                  <div className="text-white font-medium">{file.name}</div>
                  <div className="text-gray-500 text-sm">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
              ) : (
                <div>
                  <div className="text-gray-500 text-4xl mb-2">↑</div>
                  <div className="text-gray-400">Click to select audio file</div>
                  <div className="text-gray-600 text-sm mt-1">MP3, WAV, FLAC, M4A supported</div>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
          </div>

          {/* Creative vision */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Your Vision
              <span className="text-gray-500 font-normal ml-2">— optional, but it helps a lot</span>
            </label>
            <textarea
              value={brief}
              onChange={e => setBrief(e.target.value)}
              rows={4}
              placeholder="Describe what you picture for this video — the story, mood, characters, settings, references, anything. The more you share, the closer the AI lands to your idea. Leave it blank and the AI will create a vision from the song alone."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          {/* Reference files */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Reference Files
              <span className="text-gray-500 font-normal ml-2">— images, mood boards, lyrics, scripts, notes</span>
            </label>
            <ReferenceUploader items={references} onChange={setReferences} />
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!file || !title || uploading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {uploading ? 'Uploading & starting analysis…' : 'Upload & Start Pipeline'}
          </button>
        </form>

        <div className="mt-8 space-y-4">
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Pipeline Timeline</h3>
            <ol className="text-gray-500 text-sm space-y-1 list-decimal list-inside">
              <li>Audio is transcribed and analyzed — folding in your vision & references (~1 min)</li>
              <li>AI generates a visual treatment — you review, attach more, and approve</li>
              <li>Backgrounds and character elements are generated (~5–10 min)</li>
              <li>Storyboard is built — you review and approve panel order</li>
              <li>Final video is assembled with your audio (~15–25 min)</li>
            </ol>
          </div>

          <div className="p-4 bg-blue-900/30 rounded-lg border border-blue-700">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">💡 Getting started</h3>
            <ul className="text-blue-200 text-xs space-y-1">
              <li>✓ Make sure the backend is running on <code className="bg-black/40 px-1 rounded">http://localhost:8000</code></li>
              <li>✓ Check backend health: <code className="bg-black/40 px-1 rounded">curl http://localhost:8000/health</code></li>
              <li>✓ Need API keys? Groq (free): <code className="bg-black/40 px-1 rounded">console.groq.com</code> · Gemini (500 free images/day): <code className="bg-black/40 px-1 rounded">aistudio.google.com</code></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
