"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { studioApi } from "@/lib/api"

const STEPS = [
  { id: "song", label: "1. Song file" },
  { id: "rhythm", label: "2. Rhythm & key" },
  { id: "vocals", label: "3. Vocal stem" },
  { id: "lyrics", label: "4. Lyrics + timestamps" },
  { id: "understanding", label: "5. Understanding (soon)" },
  { id: "lyric_video", label: "6. Lyric video (soon)" },
]

export default function ProjectConsole() {
  const params = useParams()
  const id = String(params.id || "")
  const [project, setProject] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [activeJob, setActiveJob] = useState<any>(null)
  const [step, setStep] = useState("song")
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [busy, setBusy] = useState(false)

  // foundation edit fields
  const [title, setTitle] = useState("")
  const [artist, setArtist] = useState("")
  const [bpm, setBpm] = useState("")
  const [key, setKey] = useState("")
  const [lyricsText, setLyricsText] = useState("")

  const refresh = useCallback(async () => {
    if (!id) return
    try {
      const p = await studioApi.getProject(id)
      setProject(p)
      setTitle(p.title || "")
      setArtist(p.artist || "")
      setBpm(p.bpm || "")
      setKey(p.musical_key || "")
      if (p.user_lyrics_text) setLyricsText(p.user_lyrics_text)
      else if (p.transcript?.segments?.length) {
        setLyricsText(p.transcript.segments.map((s: any) => s.text || "").join("\n"))
      }
      const j = await studioApi.listJobs(id)
      setJobs(j)
      const running = j.find((x: any) => x.status === "running" || x.status === "queued")
      setActiveJob(running || j[0] || null)
      setError("")
    } catch (e: any) {
      setError(e.message || "Failed to load project")
    }
  }, [id])

  useEffect(() => {
    refresh()
    const t = setInterval(async () => {
      if (!id) return
      try {
        const j = await studioApi.listJobs(id)
        setJobs(j)
        const running = j.find((x: any) => x.status === "running" || x.status === "queued")
        if (running) {
          const live = await studioApi.getJob(running.id)
          setActiveJob(live)
          if (live.status === "succeeded" || live.status === "failed") {
            await refresh()
          }
        } else {
          setActiveJob(j[0] || null)
        }
      } catch {
        /* ignore poll errors */
      }
    }, 1500)
    return () => clearInterval(t)
  }, [id, refresh])

  const stepsState = project?.steps || {}

  const startJob = async (type: string) => {
    setBusy(true)
    setError("")
    setInfo("")
    try {
      const job = await studioApi.startJob(id, type)
      setActiveJob(job)
      setInfo(`Job started: ${type}`)
      await refresh()
    } catch (e: any) {
      setError(e.message || "Could not start job")
    } finally {
      setBusy(false)
    }
  }

  const saveFoundation = async () => {
    setBusy(true)
    setError("")
    try {
      await studioApi.patchFoundation(id, {
        title,
        artist,
        bpm,
        musical_key: key,
        user_lyrics_text: lyricsText,
      })
      setInfo("Foundation saved.")
      await refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const saveRhythm = async () => {
    setBusy(true)
    setError("")
    try {
      await studioApi.saveRhythm(id, { bpm, musical_key: key, beat_grid: project?.beat_grid || [] })
      setInfo("Rhythm & key saved.")
      await refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const segCount = project?.transcript?.segments?.length || 0
  const jobRunning = activeJob && (activeJob.status === "running" || activeJob.status === "queued")

  const workspace = useMemo(() => {
    if (!project) return null
    if (step === "song") {
      return (
        <fieldset className="group">
          <legend>Song file</legend>
          <p className="muted">Original upload path (local):</p>
          <code style={{ wordBreak: "break-all" }}>{project.audio_url || "—"}</code>
          <p className="muted" style={{ marginTop: 8 }}>
            Converted: {project.converted_audio_url || "not yet"}
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-primary" disabled={busy || jobRunning} onClick={() => startJob("prepare_audio")}>
              Prepare audio (convert)
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => studioApi.approveStep(id, "song").then(refresh)}>
              Mark song step approved
            </button>
          </div>
        </fieldset>
      )
    }
    if (step === "rhythm") {
      return (
        <fieldset className="group">
          <legend>Rhythm & key</legend>
          <p className="muted">Enter measured values (browser analysis can be wired later). Editable anytime.</p>
          <label>BPM<input value={bpm} onChange={e => setBpm(e.target.value)} /></label>
          <label>Key<input value={key} onChange={e => setKey(e.target.value)} placeholder="e.g. A minor" /></label>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={saveRhythm}>Save rhythm & key</button>
        </fieldset>
      )
    }
    if (step === "vocals") {
      return (
        <fieldset className="group">
          <legend>Vocal stem (separate step — always retryable)</legend>
          <p className="muted">
            CPU separation can take many minutes. Watch the Activity panel for live progress.
            If this fails, stay here and click Retry — do not skip to lyrics without a stem if you want force-align.
          </p>
          <p>Stem: {project.vocals_url ? "ready" : "not created"}</p>
          {project.vocals_url && (
            <code style={{ wordBreak: "break-all", display: "block", marginBottom: 8 }}>{project.vocals_url}</code>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || jobRunning}
            onClick={() => startJob("isolate_vocals")}
          >
            {project.vocals_url ? "Retry isolate vocals" : "Isolate vocals"}
          </button>
        </fieldset>
      )
    }
    if (step === "lyrics") {
      return (
        <fieldset className="group">
          <legend>Lyrics + timestamps</legend>
          <p className="muted">
            Requires vocal stem for best results. Align uses your pasted text; Transcribe uses Whisper.
          </p>
          <label>
            Lyrics text (for align)
            <textarea rows={8} value={lyricsText} onChange={e => setLyricsText(e.target.value)} />
          </label>
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={saveFoundation}>Save lyrics text</button>
            <button type="button" className="btn btn-primary" disabled={busy || jobRunning || !project.vocals_url} onClick={() => startJob("align_lyrics")}>
              Align lyrics to stem
            </button>
            <button type="button" className="btn" disabled={busy || jobRunning} onClick={() => startJob("transcribe_lyrics")}>
              Transcribe (Whisper)
            </button>
            <button type="button" className="btn" disabled={busy || !segCount} onClick={() => studioApi.approveStep(id, "lyrics").then(refresh)}>
              Approve lyrics
            </button>
          </div>
          {!project.vocals_url && (
            <div className="alert" style={{ marginTop: 8 }}>
              No vocal stem yet. Go to step 3 and run Isolate vocals (or Retry). Align is disabled until a stem exists.
            </div>
          )}
          <p style={{ marginTop: 8 }}>Segments: {segCount}</p>
          {segCount > 0 && (
            <div style={{ maxHeight: 200, overflow: "auto", border: "2px inset #c0c0c0", background: "#fff", padding: 6 }}>
              {project.transcript.segments.slice(0, 40).map((s: any, i: number) => (
                <div key={i} className="muted">{Number(s.start).toFixed(1)}s — {s.text}</div>
              ))}
            </div>
          )}
        </fieldset>
      )
    }
    return (
      <fieldset className="group">
        <legend>{step}</legend>
        <p className="muted">This stage lands in a later Studio v2 phase (treatment → element image lock → storyboard → linked clips → Modal lip sync).</p>
      </fieldset>
    )
  }, [project, step, bpm, key, lyricsText, busy, jobRunning, segCount, id])

  if (!project) {
    return (
      <div className="app">
        <div className="titlebar"><span>Loading…</span></div>
        {error && <div className="alert" style={{ margin: 12 }}>{error}</div>}
        <div style={{ padding: 12 }}><Link href="/">← Library</Link></div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="titlebar">
        <span>HTXpunk Studio v2 — {project.title}</span>
        <span>{jobRunning ? `Job: ${activeJob?.progress?.toFixed?.(0) ?? activeJob?.progress}%` : "Idle"}</span>
      </div>
      <div className="toolbar">
        <Link href="/" className="btn" style={{ textDecoration: "none", color: "inherit" }}>Library</Link>
        <button type="button" className="btn" onClick={refresh}>Refresh</button>
        <span className="muted">stage: {project.stage}</span>
      </div>

      {(error || project.error_message) && (
        <div className="alert" style={{ margin: 8 }}>{error || project.error_message}</div>
      )}
      {info && <div className="alert ok" style={{ margin: 8 }}>{info}</div>}

      <div className="desk">
        <div className="pane">
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>STEPS</div>
          {STEPS.map(s => (
            <button
              key={s.id}
              type="button"
              className={`step ${step === s.id ? "active" : ""}`}
              onClick={() => setStep(s.id)}
            >
              {s.label}
              <div className="meta">{stepsState[s.id] || "pending"}</div>
            </button>
          ))}
        </div>

        <div className="pane">
          <fieldset className="group">
            <legend>Foundation (edit anytime)</legend>
            <div className="row">
              <label style={{ flex: 1 }}>Title<input value={title} onChange={e => setTitle(e.target.value)} /></label>
              <label style={{ flex: 1 }}>Artist<input value={artist} onChange={e => setArtist(e.target.value)} /></label>
            </div>
            <button type="button" className="btn" disabled={busy} onClick={saveFoundation}>Save foundation fields</button>
          </fieldset>
          {workspace}
        </div>

        <div className="pane">
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>ACTIVITY</div>
          {activeJob ? (
            <div className="job-card">
              <div><strong>{activeJob.type}</strong></div>
              <div className="meta">{activeJob.status}</div>
              <div className="progress"><div style={{ width: `${activeJob.progress || 0}%` }} /></div>
              <div>{activeJob.message}</div>
              {activeJob.error && <div className="alert" style={{ marginTop: 6 }}>{activeJob.error}</div>}
            </div>
          ) : (
            <p className="muted">No jobs yet. Start a step action — progress appears here.</p>
          )}
          <div style={{ fontWeight: "bold", margin: "12px 0 6px" }}>Recent jobs</div>
          {jobs.slice(0, 8).map(j => (
            <div key={j.id} className="meta" style={{ marginBottom: 4 }}>
              {j.type} · {j.status} · {Math.round(j.progress || 0)}%
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
