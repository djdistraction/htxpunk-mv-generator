"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "../lib/api"
import { RefreshCw, Trash2, RotateCcw } from "lucide-react"

const STAGE_LABELS: Record<string, string> = {
  uploaded: "⬆️ Uploaded",
  analyzing: "🔄 Analyzing audio…",
  analyzed: "✅ Analyzed",
  treatment_pending: "🎨 Generating treatment…",
  awaiting_treatment_approval: "✋ Review your creative vision",
  treatment_approved: "✅ Treatment approved",
  extracting_elements: "🧩 Designing elements…",
  elements_ready: "🧩 Elements ready",
  generating_images: "🖼️ Generating images…",
  images_ready: "🖼️ Images ready",
  building_storyboard: "📋 Building storyboard…",
  awaiting_storyboard_approval: "✋ Review storyboard",
  storyboard_approved: "✅ Storyboard approved",
  assembling: "🎬 Assembling video…",
  complete: "✅ Complete",
  error: "❌ Error",
}

export default function Home() {
  const router = useRouter()
  const [projectList, setProjectList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadProjects = async () => {
    setRefreshing(true)
    try {
      const data = await api.projects.list()
      setProjectList(data)
      setError("")
    } catch (err) {
      setError("Failed to load projects. Is the backend running? (http://localhost:8000)")
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
    const interval = setInterval(loadProjects, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete "${title}"? This can't be undone — the project, its assets, and generated video will be permanently removed. (Your exported "HTXpunk Projects" folder, if you saved one, is untouched.)`)) {
      return
    }
    setBusyId(id)
    try {
      await api.projects.delete(id)
      setProjectList(prev => prev.filter(p => p.id !== id))
    } catch {
      alert('Could not delete project — is the backend running?')
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
      alert('Could not retry project — is the backend running?')
      setBusyId(null)
    }
  }

  return (
    <main className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-purple-600">🎬 HTXpunk Productions</h1>
          <p className="text-gray-400 mt-1">AI Music Video Generator</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadProjects}
            disabled={refreshing}
            className="p-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition disabled:opacity-50"
            title="Refresh project list"
          >
            <RefreshCw size={20} className={refreshing ? "animate-spin" : ""} />
          </button>
          <Link
            href="/settings"
            className="px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition text-sm"
            title="API Settings"
          >
            ⚙️ Settings
          </Link>
          <Link
            href="/projects/new"
            className="bg-purple-600 hover:bg-purple-700 px-5 py-2 rounded-lg font-medium transition"
          >
            + New Video
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-pulse text-4xl mb-3">🎬</div>
          <p className="text-gray-500">Loading projects…</p>
        </div>
      ) : projectList.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-5xl mb-4">🎵</p>
          <p className="text-xl">No videos yet. Upload a song to get started.</p>
          <Link
            href="/projects/new"
            className="mt-6 inline-block bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg font-medium transition"
          >
            Create your first video
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {projectList.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-purple-600 transition flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <h2 className="text-xl font-semibold truncate">{p.title}</h2>
                <p className="text-gray-400 text-sm">{p.artist || "Unknown Artist"}</p>
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
                    className="p-2 rounded-lg border border-gray-700 text-gray-400 hover:text-yellow-400 hover:border-yellow-600 transition disabled:opacity-50"
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
                <button
                  onClick={(e) => handleDelete(e, p.id, p.title)}
                  disabled={busyId === p.id}
                  title="Delete project"
                  className="p-2 rounded-lg border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-600 transition disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
