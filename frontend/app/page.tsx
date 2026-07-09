"use client"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, mediaUrl } from "../lib/api"

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
}

type StageCategory = "review" | "progress" | "complete" | "error"

function stageCategory(stage: string): StageCategory {
  if (stage === "complete") return "complete"
  if (stage === "base_video_ready") return "review"
  if (stage === "error") return "error"
  if (stage?.includes("awaiting")) return "review"
  return "progress"
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
    } catch (err) {
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
    if (!confirm(`Delete "${title}"? This cannot be undone. The project, assets, and generated video will be permanently removed. Your exported HTXpunk Projects folder is not touched.`)) {
      return
    }
    setBusyId(id)
    try {
      await api.projects.delete(id)
      setProjectList(prev => prev.filter(p => p.id !== id))
    } catch {
      alert('Could not delete project. Confirm the backend is running.')
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
      alert('Could not retry project. Confirm the backend is running.')
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
    <main className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-purple-600">HTXpunk MV Generator</h1>
          <p className="text-gray-400 mt-1">Music video project workstation</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadProjects}
            disabled={refreshing}
            className="px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition disabled:opacity-50"
            title="Refresh project list"
          >
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
          <Link
            href="/settings"
            className="px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition text-sm"
            title="API Settings"
          >
            Settings
          </Link>
          <Link
            href="/projects/new"
            className="bg-purple-600 hover:bg-purple-700 px-5 py-2 rounded-lg font-medium transition"
          >
            New Video
          </Link>
        </div>
      </div>

      {projectList.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-500">Find:</label>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Title, artist, or series"
            className="flex-1 min-w-[220px] bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
          />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as StageCategory | "all")}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All stages</option>
            <option value="review">Needs Review</option>
            <option value="progress">In Progress</option>
            <option value="complete">Complete</option>
            <option value="error">Error</option>
          </select>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-purple-500"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="artist">Artist (A-Z)</option>
            <option value="title">Title (A-Z)</option>
          </select>
          <select
            value={groupKey}
            onChange={e => setGroupKey(e.target.value as GroupKey)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-purple-500"
          >
            <option value="none">No grouping</option>
            <option value="stage">Group by stage</option>
            <option value="series">Group by series</option>
          </select>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading projects...</p>
        </div>
      ) : projectList.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-xl">No videos yet. Upload a song to get started.</p>
          <Link
            href="/projects/new"
            className="mt-6 inline-block bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg font-medium transition"
          >
            Create First Video
          </Link>
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p>No projects match your search or filter.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([groupName, projects]) => (
            <div key={groupName || "all"}>
              {groupName && (
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  {groupName} <span className="text-gray-600 normal-case">({projects.length})</span>
                </h3>
              )}
              <div className="grid gap-4">
                {projects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-purple-600 transition flex items-center gap-4"
                  >
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800 flex items-center justify-center">
                      {p.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrl(p.thumbnail_url)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm text-gray-500">No Image</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-semibold truncate">{p.title}</h2>
                      <p className="text-gray-400 text-sm truncate">
                        {p.artist || "Unknown Artist"}
                        {p.series_id && seriesNameById[p.series_id] && (
                          <span className="text-gray-600"> · {seriesNameById[p.series_id]}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-sm whitespace-nowrap ${
                        p.stage === 'complete' ? 'text-green-400' :
                        p.stage === 'error' ? 'text-red-400' :
                        p.stage?.includes('awaiting') ? 'text-yellow-400' :
                        'text-gray-400'
                      }`}>
                        {STAGE_LABELS[p.stage] ?? p.stage}
                      </span>
                      {p.stage === 'error' && (
                        <button
                          onClick={(e) => handleRetry(e, p.id)}
                          disabled={busyId === p.id}
                          title="Retry from where it failed"
                          className="px-3 py-1 rounded-lg border border-gray-700 text-gray-400 hover:text-yellow-400 hover:border-yellow-600 transition disabled:opacity-50"
                        >
                          Retry
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(e, p.id, p.title)}
                        disabled={busyId === p.id}
                        title="Delete project"
                        className="px-3 py-1 rounded-lg border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-600 transition disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
