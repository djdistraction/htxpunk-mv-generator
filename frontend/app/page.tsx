"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { api } from "../lib/api"

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
  const [projectList, setProjectList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.projects.list().then(setProjectList).finally(() => setLoading(false))
  }, [])

  return (
    <main className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-voodoo-purple">🎬 HTXpunk Productions</h1>
          <p className="text-gray-400 mt-1">Music Video Generator</p>
        </div>
        <Link
          href="/projects/new"
          className="bg-purple-600 hover:bg-purple-700 px-5 py-2 rounded-lg font-medium transition"
        >
          + New Video
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading projects…</p>
      ) : projectList.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-5xl mb-4">🎵</p>
          <p className="text-xl">No videos yet. Upload a song to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {projectList.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-purple-600 transition flex items-center justify-between"
            >
              <div>
                <h2 className="text-xl font-semibold">{p.title}</h2>
                <p className="text-gray-400 text-sm">{p.artist}</p>
              </div>
              <span className={`text-sm ${
                p.stage === 'complete' ? 'text-green-400' :
                p.stage === 'error' ? 'text-red-400' :
                p.stage?.includes('awaiting') ? 'text-yellow-400' :
                'text-gray-400'
              }`}>
                {STAGE_LABELS[p.stage] ?? p.stage}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
