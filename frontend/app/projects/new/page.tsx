'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import {
  Win95Alert,
  Win95Button,
  Win95GroupBox,
  Win95Input,
  Win95Label,
  Win95Progress,
  Win95Textarea,
} from '@/components/win95/Win95Primitives'

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
  const [productionPaths, setProductionPaths] = useState<string[]>(['lyric'])
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
      <div className="win95-page">
        <h1 className="win95-page-title">Uploading song</h1>
        <p className="win95-page-sub">
          Saving the original file and selected production path. Rhythm, key, metadata, vocals, and lyrics run as separate steps on the project workbook.
        </p>
        <Win95Progress value={50} label="Upload in progress" />
        {error && (
          <Win95Alert tone="error" title="Upload failed">{error}</Win95Alert>
        )}
      </div>
    )
  }

  return (
    <div className="win95-page">
      <div className="win95-page-header">
        <div>
          <h1 className="win95-page-title">New Music Video Project</h1>
          <p className="win95-page-sub">
            Choose a production path and upload the song. The workbook walks through each processing step with its own review gate.
          </p>
        </div>
        <Link href="/" className="win95-btn win95-btn-link">← Projects</Link>
      </div>

      <form onSubmit={handleSubmit} className="win95-stack">
        <Win95GroupBox title="Project">
          <Win95Label>
            Project Name *
            <Win95Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              placeholder="e.g. Midnight Run"
            />
          </Win95Label>
        </Win95GroupBox>

        <Win95GroupBox title="Production Path *">
          <p className="win95-muted" style={{ marginTop: 0, marginBottom: 10 }}>
            Choose one path, or combine any two. Lyric Video is recommended for the first full end-to-end run.
            {productionPaths.length === 2 ? ' (2 selected — maximum reached)' : ''}
          </p>
          <div className="win95-grid-2">
            {PRODUCTION_PATHS.map(path => {
              const selected = productionPaths.includes(path.key)
              const disabled = !selected && productionPaths.length >= 2
              return (
                <label
                  key={path.key}
                  className={`win95-path-card ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
                >
                  <div className="win95-row" style={{ alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggleProductionPath(path.key)}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div className="win95-path-card-title">{path.label}</div>
                      <div className="win95-path-card-desc">{path.description}</div>
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
          {productionPaths.length === 0 && (
            <p style={{ color: 'var(--win-danger)', marginBottom: 0 }}>Select at least one production path.</p>
          )}
        </Win95GroupBox>

        <Win95GroupBox title="Audio File *">
          <div className="win95-dropzone" onClick={() => fileInputRef.current?.click()}>
            {file ? (
              <>
                <div className="win95-strong">{file.name}</div>
                <div className="win95-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
              </>
            ) : (
              <>
                <div className="win95-strong">Click to select audio file</div>
                <div className="win95-muted">MP3, WAV, or MP4 supported</div>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.mp4,audio/wav,audio/mpeg,video/mp4"
            style={{ display: 'none' }}
            onChange={e => setFile(e.target.files?.[0] || null)}
          />
        </Win95GroupBox>

        <Win95GroupBox title="Optional inputs">
          <label className="win95-row" style={{ alignItems: 'flex-start', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={hasVocalStems}
              onChange={e => {
                setHasVocalStems(e.target.checked)
                if (!e.target.checked) setVocalsFile(null)
              }}
              style={{ marginTop: 2 }}
            />
            <span>
              <span className="win95-strong">I already have an isolated vocal stems file</span>
              <span className="win95-muted" style={{ display: 'block' }}>
                The guided workflow will use it and skip vocal isolation.
              </span>
            </span>
          </label>

          {hasVocalStems && (
            <div style={{ marginBottom: 12 }}>
              <div className="win95-dropzone" onClick={() => vocalsInputRef.current?.click()}>
                {vocalsFile ? (
                  <>
                    <div className="win95-strong">{vocalsFile.name}</div>
                    <div className="win95-muted">{(vocalsFile.size / 1024 / 1024).toFixed(1)} MB</div>
                  </>
                ) : (
                  <>
                    <div className="win95-strong">Click to select vocal stems file</div>
                    <div className="win95-muted">MP3, WAV, or MP4 supported</div>
                  </>
                )}
              </div>
              <input
                ref={vocalsInputRef}
                type="file"
                accept=".wav,.mp3,.mp4,audio/wav,audio/mpeg,video/mp4"
                style={{ display: 'none' }}
                onChange={e => setVocalsFile(e.target.files?.[0] || null)}
              />
            </div>
          )}

          <label className="win95-row" style={{ alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={hasLyrics}
              onChange={e => {
                setHasLyrics(e.target.checked)
                if (!e.target.checked) setLyricsText('')
              }}
              style={{ marginTop: 2 }}
            />
            <span>
              <span className="win95-strong">I have the exact lyrics</span>
              <span className="win95-muted" style={{ display: 'block' }}>
                Time-align this text against the vocal stem instead of Whisper transcription — usually more accurate.
              </span>
            </span>
          </label>

          {hasLyrics && (
            <div style={{ marginTop: 10 }}>
              <Win95Textarea
                value={lyricsText}
                onChange={e => setLyricsText(e.target.value)}
                placeholder="Paste lyrics here, one line per line…"
                rows={6}
                style={{ fontFamily: 'var(--win-mono)' }}
              />
              <div style={{ marginTop: 6 }}>
                <Win95Button type="button" onClick={() => lyricsInputRef.current?.click()}>
                  Upload .txt lyrics file…
                </Win95Button>
                <input
                  ref={lyricsInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  style={{ display: 'none' }}
                  onChange={e => handleLyricsFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
          )}
        </Win95GroupBox>

        {error && (
          <Win95Alert tone="error" title="Could not create project">{error}</Win95Alert>
        )}

        <div className="win95-row">
          <Win95Button type="submit" disabled={!canSubmit} variant="primary">
            Upload Song & Create Project
          </Win95Button>
          <Link href="/" className="win95-btn win95-btn-link">Cancel</Link>
        </div>
      </form>

      <Win95GroupBox title="Guided pipeline after upload">
        <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--win-muted)' }}>
          <li>Analyze rhythm and key</li>
          <li>Prepare project audio</li>
          <li>Read metadata tags</li>
          <li>Isolate vocal stem (or use yours)</li>
          <li>Transcribe/align lyrics with timestamps</li>
          <li>Approve stages, then generate the video for your production path</li>
        </ol>
      </Win95GroupBox>
    </div>
  )
}
