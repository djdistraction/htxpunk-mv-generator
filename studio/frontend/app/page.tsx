"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { studioApi } from "@/lib/api"

export default function HomePage() {
  const [projects, setProjects] = useState<any[]>([])
  const [error, setError] = useState("")
  const [online, setOnline] = useState<boolean | null>(null)
  const [title, setTitle] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [vocalsFile, setVocalsFile] = useState<File | null>(null)
  const [lyrics, setLyrics] = useState("")
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      await studioApi.health()
      setOnline(true)
      setProjects(await studioApi.listProjects())
      setError("")
    } catch {
      setOnline(false)
      setError("Studio API offline. Start: uvicorn on port 8010 (see studio/README.md).")
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  const create = async () => {
    if (!file || !title.trim()) {
      setError("Title and audio file are required.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const p = await studioApi.createProject(title.trim(), file, lyrics, "", vocalsFile)
      window.location.href = `/projects/${p.id}`
    } catch (e: any) {
      setError(e.message || "Create failed")
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="titlebar">
        <span>HTXpunk Studio v2 — Project Library</span>
        <span>{online === null ? "…" : online ? "● API online" : "● API offline"}</span>
      </div>
      <div className="toolbar">
        <button type="button" className="btn" onClick={load}>Refresh</button>
        <span className="muted">Foundation-first production desk · free tools · job progress</span>
      </div>
      <div style={{ padding: 12 }}>
        {error && <div className="alert">{error}</div>}

        <fieldset className="group">
          <legend>New project (upload song)</legend>
          <p className="muted">
            Song becomes shared foundation for Lyric Video first, then cinematic elements
            (with real image locking), linked clips, and optional Modal lip-sync polish.
          </p>
          <label>
            Title *
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Song title" />
          </label>
          <label>
            Full mix (song) *
            <input type="file" accept="audio/*,.mp3,.wav,.mp4,.m4a,.flac" onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
          <label>
            Isolated vocal stem (optional — strongly recommended if you have it)
            <input type="file" accept="audio/*,.mp3,.wav,.mp4,.m4a,.flac" onChange={e => setVocalsFile(e.target.files?.[0] || null)} />
          </label>
          <p className="muted">
            If you upload a pre-separated vocal file, Studio skips CPU vocal isolation (the usual bottleneck)
            and uses your stem for lyric align/transcribe. Full mix is still required for the final video audio.
          </p>
          <label>
            Exact lyrics (optional — enables force-align later)
            <textarea rows={5} value={lyrics} onChange={e => setLyrics(e.target.value)} placeholder="One line per line…" />
          </label>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>
            {busy ? "Uploading…" : "Create project"}
          </button>
        </fieldset>

        <fieldset className="group">
          <legend>Projects</legend>
          {projects.length === 0 ? (
            <p className="muted">No studio-v2 projects yet.</p>
          ) : (
            projects.map(p => (
              <Link key={p.id} href={`/projects/${p.id}`} className="step" style={{ textDecoration: "none", color: "inherit", marginBottom: 6 }}>
                <div><strong>{p.title}</strong> {p.artist ? `— ${p.artist}` : ""}</div>
                <div className="meta">stage: {p.stage} · id: {p.id.slice(0, 8)}…</div>
              </Link>
            ))
          )}
        </fieldset>
      </div>
    </div>
  )
}
