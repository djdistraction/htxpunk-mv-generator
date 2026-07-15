"use client"

/**
 * Linear foundation flow:
 * One big Next button — disabled while work runs; when ready, Next finishes
 * this step and starts the next. No vague "approve" buttons.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { studioApi } from "@/lib/api"
import { analyzeAudioFromUrl } from "@/lib/audioAnalysis"

const FLOW = ["song", "rhythm", "vocals", "lyrics", "lyric_video"] as const
type FlowStep = (typeof FLOW)[number]

const LABELS: Record<FlowStep, string> = {
  song: "1. Prepare song",
  rhythm: "2. Detect BPM & key",
  vocals: "3. Vocal stem",
  lyrics: "4. Lyrics + timestamps",
  lyric_video: "5. Render lyric video",
}

export default function ProjectConsole() {
  const params = useParams()
  const id = String(params.id || "")
  const [project, setProject] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [activeJob, setActiveJob] = useState<any>(null)
  const [step, setStep] = useState<FlowStep>("song")
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [busy, setBusy] = useState(false)
  const [localProgress, setLocalProgress] = useState("")
  const [title, setTitle] = useState("")
  const [artist, setArtist] = useState("")
  const [lyricsText, setLyricsText] = useState("")
  const autoStarted = useRef<Record<string, boolean>>({})

  const refresh = useCallback(async () => {
    if (!id) return
    const p = await studioApi.getProject(id)
    setProject(p)
    setTitle(p.title || "")
    setArtist(p.artist || "")
    if (p.user_lyrics_text) setLyricsText(p.user_lyrics_text)
    else if (p.transcript?.segments?.length) {
      setLyricsText(p.transcript.segments.map((s: any) => s.text || "").join("\n"))
    }
    const j = await studioApi.listJobs(id)
    setJobs(j)
    const running = j.find((x: any) => x.status === "running" || x.status === "queued")
    setActiveJob(running || j[0] || null)
    return p
  }, [id])

  useEffect(() => {
    refresh().catch((e: any) => setError(e.message || "Load failed"))
  }, [refresh])

  // Poll jobs while running
  useEffect(() => {
    if (!id) return
    const t = setInterval(async () => {
      try {
        const j = await studioApi.listJobs(id)
        setJobs(j)
        const running = j.find((x: any) => x.status === "running" || x.status === "queued")
        if (running) {
          const live = await studioApi.getJob(running.id)
          setActiveJob(live)
          if (live.status === "succeeded" || live.status === "failed") {
            const p = await refresh()
            if (live.status === "failed") setError(live.error || "Job failed")
            else setError("")
            // stay on step; Next becomes enabled from derived state
            setProject(p)
          }
        } else {
          setActiveJob(j[0] || null)
        }
      } catch {
        /* ignore */
      }
    }, 1200)
    return () => clearInterval(t)
  }, [id, refresh])

  const jobRunning = Boolean(
    activeJob && (activeJob.status === "running" || activeJob.status === "queued")
  )
  const segCount = project?.transcript?.segments?.length || 0

  const hasVideo = (p: any) =>
    Boolean(p?.video_url || p?.base_video_url || p?.final_video_url)

  const stepDone = (p: any, s: FlowStep): boolean => {
    if (!p) return false
    if (s === "song") return Boolean(p.converted_audio_url)
    if (s === "rhythm") return Boolean(p.bpm || p.musical_key)
    if (s === "vocals") return Boolean(p.vocals_url)
    if (s === "lyrics") return segCount > 0 || Boolean(p.transcript?.segments?.length)
    if (s === "lyric_video") return hasVideo(p)
    return false
  }

  /** Visit any completed step, or the first incomplete one (no skipping ahead). */
  const canVisitStep = (p: any, s: FlowStep): boolean => {
    if (!p) return false
    const idx = FLOW.indexOf(s)
    if (idx <= 0) return true
    // All previous steps must be done to open this one
    for (let i = 0; i < idx; i++) {
      if (!stepDone(p, FLOW[i])) return false
    }
    return true
  }

  const goToStep = (s: FlowStep, reason?: string) => {
    if (!project || !canVisitStep(project, s)) return
    if (busy || jobRunning) {
      setError("Wait for the current job to finish before changing steps.")
      return
    }
    setStep(s)
    setError("")
    if (reason) setInfo(reason)
    else if (s !== step) setInfo(`Viewing: ${LABELS[s]}. You can edit and re-run work here.`)
  }

  // On first load of a project, open the earliest incomplete step.
  // Manual navigation (Back / sidebar) is not overridden after that.
  useEffect(() => {
    if (!project) return
    for (const s of FLOW) {
      if (!stepDone(project, s)) {
        setStep(s)
        return
      }
    }
    setStep("lyric_video")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const waitJob = async (jobId: string) => {
    for (;;) {
      await new Promise(r => setTimeout(r, 1200))
      const live = await studioApi.getJob(jobId)
      setActiveJob(live)
      if (live.status === "succeeded") return live
      if (live.status === "failed") throw new Error(live.error || "Job failed")
    }
  }

  const startJobAndWait = async (type: string) => {
    const job = await studioApi.startJob(id, type)
    setActiveJob(job)
    await waitJob(job.id)
    await refresh()
  }

  /** Run the work for the current step. force=true re-runs even if already done. */
  const runCurrentStep = async (p: any, s: FlowStep, force = false) => {
    if (s === "song") {
      if (p.converted_audio_url && !force) return
      setInfo("Converting song to project audio…")
      await startJobAndWait("prepare_audio")
      setInfo("Song prepared.")
      return
    }
    if (s === "rhythm") {
      if ((p.bpm || p.musical_key) && !force) return
      setInfo("Detecting BPM and key in the browser…")
      setLocalProgress("Loading audio…")
      const url = studioApi.mediaUrl(id, p.converted_audio_url ? "converted" : "original")
      const result = await analyzeAudioFromUrl(url, stepName => {
        setLocalProgress(
          stepName === "bpm" ? "Detecting BPM…" : stepName === "beatgrid" ? "Building beat grid…" : "Detecting key…"
        )
      })
      setLocalProgress("")
      if (!result) throw new Error("Could not detect BPM/key from this file. You can still type values and continue.")
      await studioApi.saveRhythm(id, {
        bpm: result.bpm,
        musical_key: result.musicalKey,
        beat_grid: result.beatGrid,
      })
      setInfo(`Detected BPM ${result.bpm}, key ${result.musicalKey}.`)
      await refresh()
      return
    }
    if (s === "vocals") {
      if (p.vocals_url && !force) return
      setInfo("Isolating vocals on CPU (slow). Watch Activity for progress…")
      await startJobAndWait("isolate_vocals")
      setInfo("Vocal stem ready.")
      return
    }
    if (s === "lyrics") {
      if (p.transcript?.segments?.length && !force) return
      // Save any pasted lyrics first
      if (lyricsText.trim()) {
        await studioApi.patchFoundation(id, { user_lyrics_text: lyricsText.trim() })
      }
      const latest = await studioApi.getProject(id)
      if (!latest.vocals_url) {
        throw new Error("Vocal stem required for lyrics. Upload a stem or run isolation on step 3.")
      }
      if ((latest.user_lyrics_text || lyricsText).trim()) {
        setInfo("Aligning your lyrics to the vocal stem…")
        await startJobAndWait("align_lyrics")
      } else {
        setInfo("Transcribing lyrics with Whisper (CPU)…")
        await startJobAndWait("transcribe_lyrics")
      }
      setInfo("Lyrics ready. Review timestamps, then Next to render the lyric video.")
      await refresh()
      return
    }
    if (s === "lyric_video") {
      if (hasVideo(p) && !force) return
      const segs = p.transcript?.segments?.length || 0
      if (!segs) throw new Error("No timed lyrics yet. Finish step 4 first.")
      setInfo("Rendering lyric video with Remotion (Node)… watch Activity for progress.")
      await startJobAndWait("render_lyric_video")
      setInfo("Lyric video ready — play it below.")
      await refresh()
    }
  }

  // Auto-start current step work once when entering a step
  useEffect(() => {
    if (!project || busy || jobRunning) return
    const key = `${project.id}:${step}`
    if (autoStarted.current[key]) return
    if (stepDone(project, step)) return
    // Don't auto-run steps that need user choice or are slow/expensive
    if (step === "vocals" || step === "lyrics" || step === "lyric_video") return
    autoStarted.current[key] = true
    ;(async () => {
      setBusy(true)
      setError("")
      try {
        await runCurrentStep(project, step)
      } catch (e: any) {
        setError(e.message || String(e))
        autoStarted.current[key] = false
      } finally {
        setBusy(false)
        setLocalProgress("")
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, step, project?.converted_audio_url, project?.bpm, jobRunning])

  const stepIndex = FLOW.indexOf(step)
  const isLastStep = stepIndex >= FLOW.length - 1
  const doneHere = Boolean(project && stepDone(project, step))

  const nextLabel = (() => {
    if (busy || jobRunning) return "Working… wait for this step to finish"
    if (!project) return "Loading…"
    if (!doneHere) {
      if (step === "vocals" && !project.vocals_url) return "Upload a stem or start isolation"
      if (step === "lyrics" && !segCount) {
        return lyricsText.trim() ? "Next — align lyrics" : "Next — transcribe lyrics"
      }
      if (step === "lyric_video") return "Next — render lyric video"
      return "Finish this step first"
    }
    if (isLastStep) return "All steps complete"
    return `Next: ${LABELS[FLOW[stepIndex + 1]]}`
  })()

  const canPressNext = (() => {
    if (!project || busy || jobRunning) return false
    if (doneHere) return !isLastStep // advance to later step
    if (step === "lyrics") return Boolean(project.vocals_url)
    if (step === "lyric_video") return segCount > 0
    if (step === "vocals") return false // need upload or isolation button
    return true
  })()

  /** Advance when current step is done; otherwise run this step's work. */
  const onNext = async () => {
    if (!project || busy || jobRunning) return
    setError("")

    // Still need to run work on this step
    if (!stepDone(project, step)) {
      setBusy(true)
      try {
        if (step === "lyrics") await runCurrentStep(await refresh(), "lyrics", false)
        else if (step === "lyric_video") await runCurrentStep(await refresh(), "lyric_video", false)
        else await runCurrentStep(await refresh(), step, false)
      } catch (e: any) {
        setError(e.message || String(e))
      } finally {
        setBusy(false)
        setLocalProgress("")
      }
      return
    }

    if (isLastStep) {
      setInfo("All steps complete. Use ← Back or the progress list to correct earlier steps.")
      return
    }

    const next = FLOW[stepIndex + 1]
    setStep(next)
    setInfo(`Moved to ${LABELS[next]}`)
    // Auto-run only cheap early steps; vocals/lyrics/video wait for user
    if (next === "song" || next === "rhythm") {
      setBusy(true)
      try {
        const p = await refresh()
        await runCurrentStep(p, next)
      } catch (e: any) {
        setError(e.message || String(e))
      } finally {
        setBusy(false)
        setLocalProgress("")
      }
    } else if (next === "vocals") {
      setInfo("Optional: upload a pre-separated vocal file, or start isolation.")
    }
  }

  const startLyricVideo = async (force = false) => {
    setBusy(true)
    setError("")
    try {
      await runCurrentStep(await refresh(), "lyric_video", force)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const startVocalsIsolation = async () => {
    setBusy(true)
    setError("")
    try {
      await runCurrentStep(await refresh(), "vocals")
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const startLyrics = async (force = false) => {
    setBusy(true)
    setError("")
    try {
      await runCurrentStep(await refresh(), "lyrics", force)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

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
        <span>
          {jobRunning
            ? `${activeJob?.type}: ${Math.round(activeJob?.progress || 0)}%`
            : busy
              ? localProgress || "Working…"
              : "Ready"}
        </span>
      </div>
      <div className="toolbar">
        <Link href="/" className="btn" style={{ textDecoration: "none", color: "inherit" }}>Library</Link>
        <button type="button" className="btn" onClick={() => refresh()}>Refresh</button>
        <span className="muted">Click any unlocked step to go back · Next advances when ready</span>
      </div>

      {(error || project.error_message) && (
        <div className="alert" style={{ margin: 8 }}>{error || project.error_message}</div>
      )}
      {info && <div className="alert ok" style={{ margin: 8 }}>{info}</div>}
      {localProgress && <div className="alert info" style={{ margin: 8 }}>{localProgress}</div>}

      <div className="desk">
        <div className="pane">
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>PROGRESS</div>
          <p className="muted" style={{ marginBottom: 8, fontSize: 11 }}>
            Click a step to revisit and correct it.
          </p>
          {FLOW.map(s => {
            const done = stepDone(project, s)
            const active = step === s
            const unlocked = canVisitStep(project, s)
            return (
              <button
                type="button"
                key={s}
                className={`step ${active ? "active" : ""}`}
                disabled={!unlocked || busy || jobRunning}
                title={
                  !unlocked
                    ? "Finish earlier steps first"
                    : active
                      ? "Current step"
                      : done
                        ? "Open to review or correct"
                        : "Open this step"
                }
                onClick={() => goToStep(s)}
              >
                {done ? "✓ " : active ? "► " : unlocked ? "○ " : "· "}
                {LABELS[s]}
                <div className="meta">
                  {active ? "current" : done ? "done — click to edit" : unlocked ? "ready" : "locked"}
                </div>
              </button>
            )
          })}
        </div>

        <div className="pane">
          <fieldset className="group">
            <legend>{LABELS[step]}</legend>

            {step === "song" && (
              <>
                <p>
                  This step converts your upload into a standard project audio file used for
                  analysis and later video. It runs automatically when you open the project.
                </p>
                <p className="muted">Original: {project.audio_url ? PathName(project.audio_url) : "—"}</p>
                <p className="muted">Converted: {project.converted_audio_url ? "yes ✓" : "not yet"}</p>
                {!project.converted_audio_url && !busy && !jobRunning && (
                  <button type="button" className="btn" onClick={() => runCurrentStep(project, "song").catch((e: any) => setError(e.message))}>
                    Retry prepare audio
                  </button>
                )}
              </>
            )}

            {step === "rhythm" && (
              <>
                <p>
                  BPM and musical key are <strong>detected automatically</strong> in your browser
                  from the song (essentia.js). You can correct them below if needed.
                </p>
                <label>BPM <input value={project.bpm || ""} onChange={async e => {
                  await studioApi.saveRhythm(id, { bpm: e.target.value, musical_key: project.musical_key || "", beat_grid: project.beat_grid || [] })
                  refresh()
                }} /></label>
                <label>Key <input value={project.musical_key || ""} onChange={async e => {
                  await studioApi.saveRhythm(id, { bpm: project.bpm || "", musical_key: e.target.value, beat_grid: project.beat_grid || [] })
                  refresh()
                }} /></label>
                <p className="muted">Beats detected: {(project.beat_grid || []).length}. Edit fields anytime, then continue.</p>
                {!busy && !jobRunning && (
                  <button type="button" className="btn" onClick={() => runCurrentStep(project, "rhythm", true).catch((e: any) => setError(e.message))}>
                    Re-detect BPM & key
                  </button>
                )}
              </>
            )}

            {step === "vocals" && (
              <>
                <p>
                  Lyrics work best on a clean vocal track. If you already exported vocals from
                  another tool, upload them here and skip the slow CPU isolation.
                </p>
                <p>
                  Stem: <strong>{project.vocals_url ? "ready" : "needed"}</strong>
                  {project.vocals_source ? ` (${project.vocals_source})` : ""}
                </p>
                <label>
                  Upload pre-isolated vocals (optional)
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.mp4,.m4a,.flac"
                    disabled={busy || jobRunning}
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      e.target.value = ""
                      if (!f) return
                      setBusy(true)
                      setError("")
                      try {
                        await studioApi.uploadVocals(id, f)
                        setInfo(`Using uploaded stem: ${f.name}`)
                        await refresh()
                      } catch (err: any) {
                        setError(err.message)
                      } finally {
                        setBusy(false)
                      }
                    }}
                  />
                </label>
                {!project.vocals_url && (
                  <button type="button" className="btn btn-primary" disabled={busy || jobRunning} onClick={startVocalsIsolation}>
                    Start auto vocal isolation (CPU — can take several minutes)
                  </button>
                )}
              </>
            )}

            {step === "lyrics" && (
              <>
                <p>
                  Paste exact lyrics if you have them (more accurate). Next maps them onto the vocal
                  stem with Whisper word timestamps (not speech-only aeneas). If the box is empty,
                  Next runs Whisper transcription instead. Bad/collapsed timestamps fail clearly.
                </p>
                <label>
                  Lyrics (optional)
                  <textarea rows={8} value={lyricsText} onChange={e => setLyricsText(e.target.value)} />
                </label>
                <div className="row">
                  <button type="button" className="btn" disabled={busy} onClick={async () => {
                    await studioApi.patchFoundation(id, { title, artist, user_lyrics_text: lyricsText })
                    setInfo("Saved title / artist / lyrics text.")
                  }}>Save text</button>
                  {!segCount && (
                    <button type="button" className="btn btn-primary" disabled={busy || jobRunning || !project.vocals_url} onClick={startLyrics}>
                      {lyricsText.trim() ? "Align lyrics now" : "Transcribe now"}
                    </button>
                  )}
                  {segCount > 0 && (
                    <button type="button" className="btn" disabled={busy || jobRunning || !project.vocals_url} onClick={() => startLyrics(true)}>
                      Re-align / re-transcribe
                    </button>
                  )}
                </div>
                <p>Timed segments: {segCount}{project.transcript?.segments?.length ? ` · first ${Number(project.transcript.segments[0].start).toFixed(1)}s · last ${Number(project.transcript.segments[project.transcript.segments.length - 1].end).toFixed(1)}s` : ""}</p>
                {segCount > 0 && (
                  <div style={{ maxHeight: 180, overflow: "auto", border: "2px inset #c0c0c0", background: "#fff", padding: 6 }}>
                    {project.transcript.segments.map((s: any, i: number) => (
                      <div key={i} className="muted">{Number(s.start).toFixed(1)}–{Number(s.end).toFixed(1)}s — {s.text}</div>
                    ))}
                  </div>
                )}
              </>
            )}

            {step === "lyric_video" && (
              <>
                <p>
                  Renders a caption lyric video (Remotion) from your timed lyrics and the full song mix.
                  Needs Node/npx and <code>remotion-composer</code> packages installed once.
                </p>
                <p>
                  Video: <strong>{hasVideo(project) ? "ready" : "not rendered yet"}</strong>
                  {" · "}Timed lines: {segCount}
                </p>
                {!hasVideo(project) && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || jobRunning || !segCount}
                    onClick={startLyricVideo}
                  >
                    Render lyric video
                  </button>
                )}
                {hasVideo(project) && (
                  <>
                    <video
                      controls
                      style={{ width: "100%", maxHeight: 360, background: "#000", marginTop: 8 }}
                      src={studioApi.mediaUrl(id, "video")}
                    />
                    <div className="row" style={{ marginTop: 8 }}>
                      <a className="btn" href={studioApi.mediaUrl(id, "video")} download>
                        Download video
                      </a>
                      <button type="button" className="btn" disabled={busy || jobRunning} onClick={() => startLyricVideo(true)}>
                        Re-render
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </fieldset>

          <fieldset className="group">
            <legend>Project name</legend>
            <div className="row">
              <label style={{ flex: 1 }}>Title<input value={title} onChange={e => setTitle(e.target.value)} /></label>
              <label style={{ flex: 1 }}>Artist<input value={artist} onChange={e => setArtist(e.target.value)} /></label>
            </div>
          </fieldset>

          <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              style={{ minWidth: 100 }}
              disabled={busy || jobRunning || stepIndex <= 0}
              onClick={() => {
                if (stepIndex > 0) goToStep(FLOW[stepIndex - 1], `Back to ${LABELS[FLOW[stepIndex - 1]]}`)
              }}
            >
              ← Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ minWidth: 220, fontSize: 13, padding: "8px 16px" }}
              disabled={!canPressNext}
              onClick={() => onNext()}
            >
              {nextLabel}
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            Use <strong>← Back</strong> or click any unlocked step on the left to correct earlier work.
            Re-aligning lyrics invalidates the video — re-render step 5 after changes.
          </p>
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
            <p className="muted">{localProgress || "No background job right now."}</p>
          )}
          <div style={{ fontWeight: "bold", margin: "12px 0 6px" }}>Recent</div>
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

function PathName(p: string) {
  try {
    return p.split(/[/\\]/).pop() || p
  } catch {
    return p
  }
}
