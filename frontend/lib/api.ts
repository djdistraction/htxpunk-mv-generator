import axios from 'axios'

const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
})

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
