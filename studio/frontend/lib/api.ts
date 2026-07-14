const API = process.env.NEXT_PUBLIC_STUDIO_API || "http://127.0.0.1:8010"

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || JSON.stringify(body)
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail))
  }
  return res.json()
}

export const studioApi = {
  base: API,
  health: () => fetch(`${API}/health`).then(r => r.json()),
  listProjects: () => fetch(`${API}/api/projects`).then(r => json<any[]>(r)),
  getProject: (id: string) => fetch(`${API}/api/projects/${id}`).then(r => json<any>(r)),
  createProject: async (
    title: string,
    file: File,
    lyricsText = "",
    artist = "",
    vocalsFile?: File | null,
  ) => {
    const fd = new FormData()
    fd.append("title", title)
    fd.append("artist", artist)
    fd.append("file", file)
    if (lyricsText) fd.append("lyrics_text", lyricsText)
    // Pre-isolated stem — skips CPU demucs when provided
    if (vocalsFile) fd.append("vocals_file", vocalsFile)
    return fetch(`${API}/api/projects`, { method: "POST", body: fd }).then(r => json<any>(r))
  },
  uploadVocals: async (id: string, vocalsFile: File) => {
    const fd = new FormData()
    fd.append("vocals_file", vocalsFile)
    return fetch(`${API}/api/projects/${id}/vocals`, { method: "POST", body: fd }).then(r => json<any>(r))
  },
  patchFoundation: (id: string, body: Record<string, unknown>) =>
    fetch(`${API}/api/projects/${id}/foundation`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => json<any>(r)),
  saveRhythm: (id: string, body: { bpm: string; musical_key: string; beat_grid: number[] }) =>
    fetch(`${API}/api/projects/${id}/rhythm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => json<any>(r)),
  startJob: (id: string, type: string) =>
    fetch(`${API}/api/projects/${id}/jobs/${type}`, { method: "POST" }).then(r => json<any>(r)),
  getJob: (jobId: string) => fetch(`${API}/api/jobs/${jobId}`).then(r => json<any>(r)),
  listJobs: (id: string) => fetch(`${API}/api/projects/${id}/jobs`).then(r => json<any[]>(r)),
  approveStep: (id: string, step: string) =>
    fetch(`${API}/api/projects/${id}/steps/${step}/approve`, { method: "POST" }).then(r => json<any>(r)),
  mediaUrl: (id: string, kind: "original" | "converted" | "vocals" = "converted") =>
    `${API}/api/projects/${id}/media/${kind}`,
}
