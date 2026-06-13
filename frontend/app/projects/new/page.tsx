'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function NewProjectPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

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
        <p className="text-gray-400 mb-8">Upload a song and the pipeline will handle the rest.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
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
            {uploading ? 'Uploading & starting analysis...' : 'Upload & Start Pipeline'}
          </button>
        </form>

        <div className="mt-8 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">What happens next</h3>
          <ol className="text-gray-500 text-sm space-y-1 list-decimal list-inside">
            <li>Audio is transcribed and analyzed (~1 min)</li>
            <li>AI generates a visual treatment — you review and approve</li>
            <li>Backgrounds and character elements are generated (~5–10 min)</li>
            <li>Storyboard is built — you review and approve panel order</li>
            <li>5-second clips are animated via RunwayML (~15–20 min)</li>
            <li>Final video is assembled with your audio</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
