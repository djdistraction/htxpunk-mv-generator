"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { projects as projectsApi } from "../lib/api"

const STAGE_LABELS: Record<string, string> = {
  uploaded: "⬆️ Uploaded",
  analyzing: "🔄 Analyzing...",
  analyzed: "✅ Analyzed",
  treatment_pending: "🎨 Awaiting Treatment Approval",
  treatment_approved: "✅ Treatment Approved",
  extracting_elements: "🧩 Extracting Elements...",
  elements_ready: "🧩 Elements Ready",
  generating_backgrounds: "🖼️ Generating Backgrounds...",
  generating_elements: "👤 Generating Elements...",
  building_storyboard: "📋 Building Storyboard...",
  storyboard_approved: "✅ Storyboard Approved",
  generating_clips: "🎬 Generating Clips...",
  assembling: "🔧 Assembling Video...",
  complete: "✅ Complete",
  error: "❌ Error"
}

export default function Home() {
  const [projectList, setProjectList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    projectsApi.list().then(setProjectList).finally(() => setLoading(false))
  }, [])

  return (
    <main className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-voodoo-purple">🎬 VoodooHut</h1>
          <p className="text-gray-400 mt-1">Music Video Generator</p>
        </div>
        <Link
          href="/projects/new"
          className="bg-voodoo-purple hover:bg-purple-700 px-5 py-2 rounded-lg font-medium transition"
        >
          + New Video
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading projects...</p>
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
              className="bg-voodoo-dark border border-gray-800 rounded-xl p-5 hover:border-voodoo-purple transition flex items-center justify-between"
            >
              <div>
                <h2 className="text-xl font-semibold">{p.title}</h2>
                <p className="text-gray-400 text-sm">{p.artist}</p>
              </div>
              <span className="text-sm text-gray-400">
                {STAGE_LABELS[p.stage] ?? p.stage}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
