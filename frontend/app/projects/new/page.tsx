'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function NewProjectPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const vocalsInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [hasVocalStems, setHasVocalStems] = useState(false)
  const [vocalsFile, setVocalsFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const canSubmit = Boolean(file && title.trim() && (!hasVocalStems || vocalsFile))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !file) return
    setError('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('title', title.trim())
      formData.append('file', file)
      if (hasVocalStems && vocalsFile) {
        formData.append('vocals_file', vocalsFile)
      }
      const project = await api.projects.uploadAudio(formData)
      router.push(`/projects/${project.id}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Upload failed. Check that the backend is running.')
      setUploading(false)
    }
  }

  if (uploading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-6">Uploading song</h1>
          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-purple-600 transition-all duration-500 ease-out" style={{ width: '50%' }} />
          </div>
          <p className="text-gray-600 text-sm mt-4">
            The app is only saving the original file. Rhythm, key, metadata, vocals, and lyrics will run as separate steps on the project page.
          </p>
          {error && (
            <div className="mt-6 bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-xl mx-auto">
        <a href="/" className="text-purple-400 text-sm hover:underline">← Back to projects</a>

        <h1 className="text-3xl font-bold mt-6 mb-2">New Music Video</h1>
        <p className="text-gray-400 mb-8">
          Start by uploading the song. The project page will walk through each processing step one at a time with its own result and retry point.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Project Name *</label>
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
            <label className="block text-sm font-medium text-gray-300 mb-1">Audio File *</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-gray-900 border-2 border-dashed border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-purple-500 transition-colors"
            >
              {file ? (
                <div>
                  <div className="text-white font-medium">{file.name}</div>
                  <div className="text-gray-500 text-sm">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
              ) : (
                <div>
                  <div className="text-gray-500 text-4xl mb-2">↑</div>
                  <div className="text-gray-400">Click to select audio file</div>
                  <div className="text-gray-600 text-sm mt-1">MP3, WAV, or MP4 supported</div>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav,.mp3,.mp4,audio/wav,audio/mpeg,video/mp4"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasVocalStems}
                onChange={e => { setHasVocalStems(e.target.checked); if (!e.target.checked) setVocalsFile(null) }}
                className="mt-1"
              />
              <span className="text-sm text-gray-300">
                I already have an isolated vocal stems file
                <span className="text-gray-500 font-normal block text-xs mt-0.5">
                  The guided workflow will use it and skip vocal isolation.
                </span>
              </span>
            </label>

            {hasVocalStems && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-300 mb-1">Vocal Stems File *</label>
                <div
                  onClick={() => vocalsInputRef.current?.click()}
                  className="w-full bg-gray-900 border-2 border-dashed border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
                >
                  {vocalsFile ? (
                    <div>
                      <div className="text-white font-medium">{vocalsFile.name}</div>
                      <div className="text-gray-500 text-sm">{(vocalsFile.size / 1024 / 1024).toFixed(1)} MB</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-gray-500 text-2xl mb-1">↑</div>
                      <div className="text-gray-400 text-sm">Click to select vocal stems file</div>
                      <div className="text-gray-600 text-xs mt-1">MP3, WAV, or MP4 supported</div>
                    </div>
                  )}
                </div>
                <input
                  ref={vocalsInputRef}
                  type="file"
                  accept=".wav,.mp3,.mp4,audio/wav,audio/mpeg,video/mp4"
                  className="hidden"
                  onChange={e => setVocalsFile(e.target.files?.[0] || null)}
                />
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Upload Song
          </button>
        </form>

        <div className="mt-8 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Guided Pipeline</h3>
          <ol className="text-gray-500 text-sm space-y-1 list-decimal list-inside">
            <li>Upload song</li>
            <li>Analyze rhythm and key</li>
            <li>Prepare project audio</li>
            <li>Read metadata tags</li>
            <li>Isolate vocal stem</li>
            <li>Transcribe and timestamp lyrics</li>
            <li>Review song info and continue to creative generation</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
