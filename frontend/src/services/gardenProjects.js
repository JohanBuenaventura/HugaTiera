import { apiRequest } from './api'
import { uploadRequestImage } from './requestImages'

export const gardenProjectsApi = {
  list: () => apiRequest('/garden-projects'),
  create: (payload) => apiRequest('/garden-projects', { method: 'POST', body: JSON.stringify(payload) }),
  get: (projectId) => apiRequest(`/garden-projects/${projectId}`),
  update: (projectId, payload) => apiRequest(`/garden-projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  remove: (projectId) => apiRequest(`/garden-projects/${projectId}`, { method: 'DELETE' }),
  uploadImage: (projectId, file) => uploadRequestImage(file, projectId),
  generate: (projectId) => apiRequest(`/garden-projects/${projectId}/generate`, { method: 'POST' }),
  analyze: (projectId) => apiRequest(`/garden-projects/${projectId}/analyze`, { method: 'POST' }),
  matches: (projectId) => apiRequest(`/garden-projects/${projectId}/matches`, { method: 'POST' }),
}
