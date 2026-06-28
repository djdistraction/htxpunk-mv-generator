import axios, { AxiosError } from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const apiBaseUrl = API_URL

/**
 * Resolve an asset URL for use in <img src>. Backend returns relative
 * "/storage/..." paths served by FastAPI on the API origin (:8000), but the
 * frontend runs on a different origin (:3000), so relative URLs would 404.
 * Prefix them with the API base. Absolute URLs (http/https, e.g. R2) pass through.
 */
export function mediaUrl(url?: string | null): string {
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`
}

const client = axios.create({
  baseURL: API_URL,
  timeout: 120000, // 2 minute timeout for long uploads
})

// Log errors for debugging
client.interceptors.response.use(
  response => response,
  error => {
    if (!error.response) {
      console.error('Network error:', error.message)
      console.error(`Make sure the backend is running at ${API_URL}`)
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
    uploadAudio: async (formData: FormData) => {
      const { data } = await client.post('/api/projects/upload-audio', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
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
  },

  pipeline: {
    approveTreatment: async (id: string, payload?: { treatment?: object; notes?: string }) => {
      const { data } = await client.post(`/api/pipeline/${id}/approve-treatment`, payload ?? {})
      return data
    },
    reviseTreatment: async (id: string, feedback: string) => {
      const { data } = await client.post(`/api/pipeline/${id}/revise-treatment`, { feedback })
      return data
    },
    getShotManifests: async (id: string) => {
      const { data } = await client.get(`/api/pipeline/${id}/shot-manifests`)
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
    approveStoryboard: async (id: string, payload: { panel_order: string[] }) => {
      const { data } = await client.post(`/api/pipeline/${id}/approve-storyboard`, payload)
      return data
    },
    regenerateImage: async (id: string, payload: { asset_id: string; new_prompt: string }) => {
      const { data } = await client.post(`/api/pipeline/${id}/regenerate-image`, payload)
      return data
    },
  },

  assets: {
    list: async (projectId: string, assetType?: string) => {
      const params = assetType ? { asset_type: assetType } : {}
      const { data } = await client.get(`/api/assets/${projectId}`, { params })
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
