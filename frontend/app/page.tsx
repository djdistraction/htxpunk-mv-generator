"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, mediaUrl } from "../lib/api"
import {
  Win95Alert,
  Win95Button,
  Win95GroupBox,
  Win95Input,
  Win95Select,
  Win95StatusBadge,
} from "../components/win95/Win95Primitives"

const STAGE_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  preprocessing_audio: "Processing audio",
  awaiting_project_info_review: "Review song info",
  info_confirmed: "Saved",
  interpreting_song: "Interpreting song",
  analyzing: "Analyzing audio",
  analyzed: "Analyzed",
  treatment_pending: "Generating treatment",
  awaiting_treatment_approval: "Review creative vision",
  treatment_approved: "Treatment approved",
  extracting_elements: "Designing elements",
  elements_ready: "Elements ready",
  generating_images: "Generating images",
  images_ready: "Images ready",
  building_storyboard: "Building storyboard",
  awaiting_manifest_approval: "Review production plan",
  awaiting_storyboard_approval: "Review storyboard",
  storyboard_approved: "Storyboard approved",
  assembling: "Assembling video",
  base_video_ready: "Review base video",
  complete: "Final approved",
  error: "Error",
  audio_uploaded: "Song uploaded",
  rhythm_key_analyzed: "Rhythm & key",
  audio_prepared: "Audio prepared",
  metadata_ready: "Metadata ready",
  vocals_ready: "Vocals ready",
}

type StageCategory = "review" | "progress" | "complete" | "error"

function stageCategory(stage: string): StageCategory {
  if (stage === "complete") return "complete"
  if (stage === "base_video_ready") return "review"
  if (stage === "error") return "error"
  if (stage?.includes("awaiting")) return "review"
  return "progress"
}

function statusTone(stage: string): "ok" | "warn" | "error" | "info" | "running" | "muted" {
  const cat = stageCategory(stage)
  if (cat === "complete") return "ok"
  if (cat === "error") return "error"
  if (cat === "review") return "warn"
  return "running"
}

const CATEGORY_LABELS: Record<StageCategory, string> = {
  review: "Needs Review",
  progress: "In Progress",
  complete: "Complete",
  error: "Error",
}

type SortKey = "newest" | "oldest" | "artist" | "title"
type GroupKey = "none" | "stage" | "series"

export default function Home() {
  const router = useRouter()
  const [projectList, setProjectList] = useState<any[]>([])
  const [seriesList, setSeriesList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<StageCategory | "all">("all")
  const [sortKey, setSortKey] = useState<SortKey>("newest")
  const [groupKey, setGroupKey] = useState<GroupKey>("none")

  const loadProjects = async () => {
    setRefreshing(true)
    try {
      const data = await api.projects.list()
      setProjectList(data)
      setError("")
    } catch {
      setError("Failed to load projects. Confirm the backend is running at http://localhost:8000.")
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
    api.series.list().then(setSeriesList).catch(() => {})
    const interval = setInterval(loadProjects, 10000)
    return () => clearInterval(interval)
  }, [])

  const seriesNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of seriesList) map[s.id] = s.name
    return map
  }, [seriesList])

  const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete "${title}"? This cannot be undone. The project, assets, and generated video will be permanently removed.`)) {
      return
    }
    setBusyId(id)
    try {
      await api.projects.delete(id)
      setProjectList(prev => prev.filter(p => p.id !== id))
    } catch {
      alert("Could not delete project. Confirm the backend is running.")
    } finally {
      setBusyId(null)
    }
  }

  const handleRetry = async (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setBusyId(id)
    try {
      await api.projects.retry(id)
      router.push(`/projects/${id}`)
    } catch {
      alert("Could not retry project. Confirm the backend is running.")
      setBusyId(null)
    }
  }

  const visibleProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = projectList.filter(p => {
      if (categoryFilter !== "all" && stageCategory(p.stage) !== categoryFilter) return false
      if (!q) return true
      const seriesName = (seriesNameById[p.series_id] || "").toLowerCase()
      return (
        (p.title || "").toLowerCase().includes(q) ||
        (p.artist || "").toLowerCase().includes(q) ||
        seriesName.includes(q)
      )
    })

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case "artist":
          return (a.artist || "").localeCompare(b.artist || "")
        case "title":
          return (a.title || "").localeCompare(b.title || "")
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })
    return list
  }, [projectList, search, categoryFilter, sortKey, seriesNameById])

  const groups = useMemo((): [string, any[]][] => {
    if (groupKey === "none") return [["", visibleProjects]]
    const buckets = new Map<string, any[]>()
    for (const p of visibleProjects) {
      const key = groupKey === "stage"
        ? CATEGORY_LABELS[stageCategory(p.stage)]
        : (seriesNameById[p.series_id] || "Standalone")
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(p)
    }
    return Array.from(buckets.entries())
  }, [visibleProjects, groupKey, seriesNameById])

  return (
    <div className="win95-page">
      <div className="win95-page-header">
        <div>
          <h1 className="win95-page-title">Project Library</h1>
          <p className="win95-page-sub">
            Open an existing production workbook or start a new music video project.
          </p>
        </div>
        <div className="win95-row">
          <Win95Button onClick={loadProjects} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Win95Button>
          <Link href="/settings" className="win95-btn win95-btn-link">Settings</Link>
          <Link href="/projects/new" className="win95-btn win95-btn-link win95-btn-primary">New Project</Link>
        </div>
      </div>

      {projectList.length > 0 && (
        <div className="win95-filters">
          <span className="win95-muted">Find:</span>
          <Win95Input
            className="grow"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Title, artist, or series"
          />
          <Win95Select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as StageCategory | "all")}
          >
            <option value="all">All stages</option>
            <option value="review">Needs Review</option>
            <option value="progress">In Progress</option>
            <option value="complete">Complete</option>
            <option value="error">Error</option>
          </Win95Select>
          <Win95Select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="artist">Artist (A–Z)</option>
            <option value="title">Title (A–Z)</option>
          </Win95Select>
          <Win95Select value={groupKey} onChange={e => setGroupKey(e.target.value as GroupKey)}>
            <option value="none">No grouping</option>
            <option value="stage">Group by stage</option>
            <option value="series">Group by series</option>
          </Win95Select>
        </div>
      )}

      {error && (
        <Win95Alert tone="error" title="Connection problem" onDismiss={() => setError("")}>
          {error}
        </Win95Alert>
      )}

      {loading ? (
        <div className="win95-empty">Loading projects…</div>
      ) : projectList.length === 0 ? (
        <Win95GroupBox title="No projects yet">
          <p className="win95-muted" style={{ marginTop: 0 }}>
            Upload a song to create your first production workbook. The app walks through
            audio prep, creative planning, and final video export one stage at a time.
          </p>
          <Link href="/projects/new" className="win95-btn win95-btn-link win95-btn-primary">
            Create First Video
          </Link>
        </Win95GroupBox>
      ) : visibleProjects.length === 0 ? (
        <div className="win95-empty">No projects match your search or filter.</div>
      ) : (
        <div className="win95-stack">
          {groups.map(([groupName, projects]) => (
            <div key={groupName || "all"}>
              {groupName && (
                <div className="win95-strong" style={{ marginBottom: 6 }}>
                  {groupName}{" "}
                  <span className="win95-muted">({projects.length})</span>
                </div>
              )}
              <div className="win95-project-list">
                {projects.map(p => (
                  <div key={p.id} className="win95-project-row" style={{ cursor: "default" }}>
                    <Link href={`/projects/${p.id}`} className="win95-thumb" style={{ textDecoration: "none" }}>
                      {p.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrl(p.thumbnail_url)} alt="" />
                      ) : (
                        "No Image"
                      )}
                    </Link>
                    <Link href={`/projects/${p.id}`} className="win95-project-meta" style={{ textDecoration: "none", color: "inherit" }}>
                      <div className="win95-project-title">{p.title || "Untitled"}</div>
                      <div className="win95-project-sub">
                        {p.artist || "Unknown Artist"}
                        {p.series_id && seriesNameById[p.series_id]
                          ? ` · ${seriesNameById[p.series_id]}`
                          : ""}
                      </div>
                    </Link>
                    <Win95StatusBadge status={statusTone(p.stage)}>
                      {STAGE_LABELS[p.stage] ?? p.stage}
                    </Win95StatusBadge>
                    {p.stage === "error" && (
                      <Win95Button
                        className="win95-btn-sm"
                        onClick={e => handleRetry(e, p.id)}
                        disabled={busyId === p.id}
                      >
                        Retry
                      </Win95Button>
                    )}
                    <Win95Button
                      className="win95-btn-sm"
                      onClick={e => handleDelete(e, p.id, p.title)}
                      disabled={busyId === p.id}
                    >
                      Delete
                    </Win95Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
