'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { analyzeAudioFile, AudioAnalysisStep } from '@/lib/audioAnalysis'
import { AUDIO_PIPELINE_STEPS, stepProgress } from '@/lib/pipelineSteps'

const CLIENT_STEP_INDEX: Record<AudioAnalysisStep, number> = {
  bpm: 0,
  beatgrid: 1,
  key: 2,
}

export default function NewProjectPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  const [processing, setProcessing] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !title.trim()) return
    setError('')
    setProcessing(true)
    setStepIndex(0)
    try {
      const analysis = await analyzeAudioFile(file, (step) => {
        setStepIndex(CLIENT_STEP_INDEX[step])
      })
      // Whether or not BPM/key detection succeeded (some browsers/contexts
      // can't run it), the very next real thing is server-side conversion —
      // show that as soon as client analysis finishes, since the upload
      // itself (a few MB, typically) completes well within that step.
      setStepIndex(3)

      const formData = new FormData()
      formData.append('title', title.trim())
      formData.append('file', file)
      if (analysis) {
        formData.append('bpm', analysis.bpm)
        formData.append('musical_key', analysis.musicalKey)
        formData.append('beat_grid', JSON.stringify(analysis.beatGrid))
      }
      const project = await api.projects.uploadAudio(formData)
      router.push(`/projects/${project.id}/processing`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Upload failed. Check that the backend is running.')
      setProcessing(false)
    }
  }

  if (processing) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center">
          <div className="text-5xl mb-6 animate-pulse">🎧</div>
          <p className="text-xl text-white font-medium mb-6">{AUDIO_PIPELINE_STEPS[stepIndex]}…</p>
          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-600 transition-all duration-500 ease-out"
              style={{ width: `${stepProgress(stepIndex)}%` }}
            />
          </div>
          <p className="text-gray-600 text-sm mt-4">
            This can take a few minutes once vocal separation and transcription start.
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
          Name it and drop in the song — everything else (artist, series, your
          creative vision, reference files) comes next, once we've pulled the
          lyrics and tags back for you to confirm.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project name */}
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

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!file || !title.trim()}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Upload & Analyze
          </button>
        </form>

        <div className="mt-8 space-y-4">
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Pipeline Timeline</h3>
            <ol className="text-gray-500 text-sm space-y-1 list-decimal list-inside">
              <li>Audio is converted, tagged, and vocals are isolated for transcription</li>
              <li>You review the extracted song info and lyrics — add artist, series, your creative vision, and reference files here — then save</li>
              <li>AI interprets the song, then generates a visual treatment — you review, attach more, and approve</li>
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
              <li>✓ Need API keys?</li>
              <li>— Groq (free): <code className="bg-black/40 px-1 rounded">console.groq.com</code></li>
              <li>— Gemini (500 free images/day): <code className="bg-black/40 px-1 rounded">aistudio.google.com</code></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
