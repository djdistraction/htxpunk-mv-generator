import axios, { AxiosError } from 'axios'

// Empty by default: API calls use relative paths ("/api/...", "/storage/...")
// that Next's own server proxies to the backend (see next.config.js's
// rewrites, which read BACKEND_INTERNAL_URL — a plain server-side env var,
// not NEXT_PUBLIC_*, so it's resolved at request time, not baked into the
// client bundle at build time). This matters for hosted deployments: the
// browser (e.g. a phone loading htxpunk.com/mvgen) has no way to reach
// "localhost:8000" on the server, but it can always reach the same origin
// it loaded the page from. Set NEXT_PUBLIC_API_URL only if the backend is
// genuinely on a different, browser-reachable origin (no shared proxy).
const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

export const apiBaseUrl = API_URL

/**
 * Resolve an asset URL for use in <img src>. Backend returns relative
 * "/storage/..." paths. If API_URL is set (cross-origin backend), prefix
 * with it; otherwise leave relative so the browser resolves it against the
 * current page's own origin, which next.config.js's rewrites forward to
 * the backend. Absolute URLs (http/https, e.g. R2) always pass through.
 */
export function mediaUrl(url?: string | null): string {
  if (!url) return ''
  if (/^(https?:\/\/|data:|blob:)/i.test(url)) return url
  return API_URL ? new URL(url, API_URL).toString() : url
}

const client = axios.create({
  baseURL: API_URL,
  timeout: 600000, // 10 minutes
})

// Log errors for debugging
client.interceptors.response.use(
  response => response,
  error => {
    if (!error.response) {
      console.error('Network error:', error.message)
      console.error(
        API_URL
          ? `Make sure the backend is running at ${API_URL}`
          : 'Make sure the backend is running and reachable via the /api rewrite (see next.config.js)'
      )
    }
    return Promise.reject(error)
  }
)

export const api = {
  projects: {
    list: async () => {
      const { data } = await client.get('/api/projects')
      return data
    },
    get: async (id: string) => {
      const { data } = await client.get(`/api/projects/${id}`)
      return data
    },
    delete: async (id: string) => {
      const { data } = await client.delete(`/api/projects/${id}`)
      return data
    },
    retry: async (id: string) => {
      const { data } = await client.post(`/api/projects/${id}/retry`)
      return data
    },
    uploadAudio: async (formData: FormData) => {
      const { data } = await client.post('/api/projects/upload-audio', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    saveRhythmKey: async (id: string, payload: { bpm: string; musical_key: string; beat_grid: number[] }) => {
      const { data } = await client.post(`/api/projects/${id}/guided/analyze-rhythm-key`, payload)
      return data
    },
    prepareAudio: async (id: string) => {
      const { data } = await client.post(`/api/projects/${id}/guided/prepare-audio`)
      return data
    },
    readMetadata: async (id: string) => {
      const { data } = await client.post(`/api/projects/${id}/guided/read-metadata`)
      return data
    },
    isolateVocals: async (id: string) => {
      const { data } = await client.post(`/api/projects/${id}/guided/isolate-vocals`)
      return data
    },
    transcribeLyrics: async (id: string) => {
      const { data } = await client.post(`/api/projects/${id}/guided/transcribe-lyrics`)
      return data
    },
    alignLyrics: async (id: string, lyricsText?: string) => {
      const { data } = await client.post(`/api/projects/${id}/guided/align-lyrics`, lyricsText ? { lyrics_text: lyricsText } : {})
      return data
    },
    listReferences: async (id: string) => {
      const { data } = await client.get(`/api/projects/${id}/references`)
      return data
    },
    addReferences: async (id: string, formData: FormData) => {
      const { data } = await client.post(`/api/projects/${id}/references`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    confirmInfo: async (id: string, payload: {
      title?: string; artist?: string; composer?: string; album?: string
      bpm?: string; musical_key?: string; beat_grid?: number[]
      transcript?: object; series_id?: string; brief?: string; production_paths?: string[]
    }) => {
      const { data } = await client.post(`/api/projects/${id}/confirm-info`, payload)
      return data
    },
    approveSection: async (id: string, section: string) => {
      const { data } = await client.post(`/api/projects/${id}/sections/${section}/approve`)
      return data
    },
    rejectSection: async (id: string, section: string, note: string = '') => {
      const { data } = await client.post(`/api/projects/${id}/sections/${section}/reject`, { note })
      return data
    },
  },

  pipeline: {
    runSongAnalysis: async (id: string) => {
      const { data } = await client.post(`/api/pipeline/${id}/run-song-analysis`)
      return data
    },
    generateTreatment: async (id: string) => {
      const { data } = await client.post(`/api/pipeline/${id}/generate-treatment`)
      return data
    },
    approveTreatment: async (id: string, payload?: { treatment?: object; notes?: string }) => {
      const { data } = await client.post(`/api/pipeline/${id}/approve-treatment`, payload ?? {})
      return data
    },
    reviseTreatment: async (id: string, feedback: string) => {
      const { data } = await client.post(`/api/pipeline/${id}/revise-treatment`, { feedback })
      return data
    },
    generateElementPlan: async (id: string) => {
      const { data } = await client.post(`/api/pipeline/${id}/generate-element-plan`)
      return data
    },
    generateElementImages: async (id: string) => {
      const { data } = await client.post(`/api/pipeline/${id}/generate-element-images`)
      return data
    },
    getShotManifests: async (id: string) => {
      const { data } = await client.get(`/api/pipeline/${id}/shot-manifests`)
      return data
    },
    createShotManifest: async (id: string, payload: object) => {
      const { data } = await client.post(`/api/pipeline/${id}/shot-manifests`, payload)
      return data
    },
    updateShotManifest: async (id: string, manifestId: string, payload: object) => {
      const { data } = await client.put(`/api/pipeline/${id}/shot-manifests/${manifestId}`, payload)
      return data
    },
    deleteShotManifest: async (id: string, manifestId: string) => {
      const { data } = await client.delete(`/api/pipeline/${id}/shot-manifests/${manifestId}`)
      return data
    },
    approveManifests: async (id: string, payload?: { revision_notes?: string }) => {
      const { data } = await client.post(`/api/pipeline/${id}/approve-manifests`, payload ?? {})
      return data
    },
    reviseManifests: async (id: string, payload: { revision_notes: string }) => {
      const { data } = await client.post(`/api/pipeline/${id}/revise-manifests`, payload)
      return data
    },
    importProductionGuide: async (id: string, file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await client.post(`/api/pipeline/${id}/import-production-guide`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    buildStoryboard: async (id: string) => {
      const { data } = await client.post(`/api/pipeline/${id}/build-storyboard`)
      return data
    },
    generateManifestImages: async (id: string) => {
      const { data } = await client.post(`/api/pipeline/${id}/generate-manifest-images`)
      return data
    },
    approveStoryboard: async (id: string, payload: { panel_order: string[] }) => {
      const { data } = await client.post(`/api/pipeline/${id}/approve-storyboard`, payload)
      return data
    },
    generateBaseVideo: async (id: string) => {
      const { data } = await client.post(`/api/pipeline/${id}/generate-base-video`)
      return data
    },
    generateLyricVideo: async (id: string) => {
      const { data } = await client.post(`/api/pipeline/${id}/generate-lyric-video`)
      return data
    },
    regenerateImage: async (id: string, payload: { asset_id: string; new_prompt: string }) => {
      const { data } = await client.post(`/api/pipeline/${id}/regenerate-image`, payload)
      return data
    },
    uploadShotImage: async (id: string, assetId: string, file: File) => {
      const formData = new FormData()
      formData.append('asset_id', assetId)
      formData.append('file', file)
      const { data } = await client.post(`/api/pipeline/${id}/upload-shot-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
  },

  assets: {
    list: async (projectId: string, assetType?: string) => {
      const params = assetType ? { asset_type: assetType } : {}
      const { data } = await client.get(`/api/assets/${projectId}`, { params })
      return data
    },
    review: async (projectId: string, assetId: string, payload: { status: string; note?: string }) => {
      const { data } = await client.post(`/api/assets/${projectId}/${assetId}/review`, payload)
      return data
    },
  },

  series: {
    list: async () => {
      const { data } = await client.get('/api/projects/series/list')
      return data
    },
    get: async (id: string) => {
      const { data } = await client.get(`/api/projects/series/${id}`)
      return data
    },
    create: async (name: string, artist: string = '') => {
      const form = new FormData()
      form.append('name', name)
      form.append('artist', artist)
      const { data } = await client.post('/api/projects/series/create', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
  },
}
