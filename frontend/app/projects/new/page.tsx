'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

const PRODUCTION_PATHS = [
  {
    key: 'lyric',
    label: 'Lyric Video',
    description: 'Typography, lyric moments, graphic rhythm, and visual hooks around the words.',
  },
  {
    key: 'karaoke',
    label: 'Karaoke Video',
    description: 'Sing-along timing, readable lyric highlighting, and performance-friendly pacing.',
  },
  {
    key: 'performance',
    label: 'Performance Music Video',
    description: 'Artist, band, character, or staged performance coverage driven by the song.',
  },
  {
    key: 'cinematic',
    label: 'Cinematic Music Video',
    description: 'Narrative scenes, locations, characters, motifs, and shot-driven storytelling.',
  },
]

export default function NewProjectPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const vocalsInputRef = useRef<HTMLInputElement>(null)
  const lyricsInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [productionPaths, setProductionPaths] = useState<string[]>(['cinematic'])
  const [file, setFile] = useState<File | null>(null)
  const [hasVocalStems, setHasVocalStems] = useState(false)
  const [vocalsFile, setVocalsFile] = useState<File | null>(null)
  const [hasLyrics, setHasLyrics] = useState(false)
  const [lyricsText, setLyricsText] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const canSubmit = Boolean(
    file && title.trim() && productionPaths.length >= 1 && productionPaths.length <= 2 &&
    (!hasVocalStems || vocalsFile) && (!hasLyrics || lyricsText.trim())
  )

  const handleLyricsFile = (selected: File | null) => {
    if (!selected) return
    const reader = new FileReader()
    reader.onload = () => setLyricsText(String(reader.result || ''))
    reader.readAsText(selected)
  }

  const toggleProductionPath = (path: string) => {
    setProductionPaths(current => {
      if (current.includes(path)) {
        return current.filter(item => item !== path)
      }
      if (current.length >= 2) {
        return current
      }
      return [...current, path]
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !file) return
    setError('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('title', title.trim())
      formData.append('production_paths', JSON.stringify(productionPaths))
      formData.append('file', file)
      if (hasVocalStems && vocalsFile) {
        formData.append('vocals_file', vocalsFile)
      }
      if (hasLyrics && lyricsText.trim()) {
        formData.append('lyrics_text', lyricsText.trim())
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
            The app is saving the original file and selected production path. Rhythm, key, metadata, vocals, and lyrics will run as separate steps on the project page.
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
          Start by choosing the production path and uploading the song. The project page will walk through each processing step one at a time with its own result and retry point.
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
            <div className="flex items-center justify-between gap-4 mb-2">
              <label className="block text-sm font-medium text-gray-300">Production Path *</label>
              <span className={`text-xs ${productionPaths.length === 2 ? 'text-yellow-300' : 'text-gray-500'}`}>
                Choose one, or combine any two
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PRODUCTION_PATHS.map(path => {
                const selected = productionPaths.includes(path.key)
                const disabled = !selected && productionPaths.length >= 2
                return (
                  <label
                    key={path.key}
                    className={`block border rounded-lg p-4 transition-colors ${
                      selected
                        ? 'bg-purple-950/50 border-purple-600'
                        : disabled
                          ? 'bg-gray-900/40 border-gray-800 opacity-50 cursor-not-allowed'
                          : 'bg-gray-900 border-gray-700 hover:border-purple-500 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => toggleProductionPath(path.key)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-white">{path.label}</div>
                        <p className="text-gray-500 text-sm mt-1 leading-relaxed">{path.description}</p>
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
            {productionPaths.length === 0 && (
              <p className="text-red-300 text-sm mt-2">Select at least one production path.</p>
            )}
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

          <div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasLyrics}
                onChange={e => { setHasLyrics(e.target.checked); if (!e.target.checked) setLyricsText('') }}
                className="mt-1"
              />
              <span className="text-sm text-gray-300">
                I have the exact lyrics
                <span className="text-gray-500 font-normal block text-xs mt-0.5">
                  The guided workflow will time-align this text against the vocal stem instead of transcribing with Whisper — more accurate than auto-transcription.
                </span>
              </span>
            </label>

            {hasLyrics && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={lyricsText}
                  onChange={e => setLyricsText(e.target.value)}
                  placeholder={'Paste lyrics here, one line per line...'}
                  rows={6}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => lyricsInputRef.current?.click()}
                  className="text-purple-400 text-sm hover:underline"
                >
                  Or upload a .txt file
                </button>
                <input
                  ref={lyricsInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={e => handleLyricsFile(e.target.files?.[0] || null)}
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
            <li>Transcribe and timestamp lyrics (or align your provided lyrics)</li>
            <li>Review song info and continue to creative generation</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
