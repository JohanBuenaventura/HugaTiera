const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'The profile request failed.')
  return data
}

export const profileApi = {
  get: () => request('/profiles/me'),
  update: (profile) => request('/profiles/me', { method: 'PUT', body: JSON.stringify(profile) }),
  adminSummary: () => request('/admin/summary'),
  updateUserStatus: (userId, isActive) => request(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  }),
  adminPendingGardeners: () => request('/admin/gardeners/pending'),
  updateGardenerApproval: (userId, isApproved, reason = '') => request(`/admin/gardeners/${userId}/approval`, {
    method: 'PATCH',
    body: JSON.stringify({ isApproved, reason }),
  }),
  adminCategories: () => request('/admin/categories'),
  createCategory: (details) => request('/admin/categories', { method: 'POST', body: JSON.stringify(details) }),
  updateCategory: (id, details) => request(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(details) }),
  adminServices: () => request('/admin/services'),
  updateServiceStatus: (id, isActive) => request(`/admin/services/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  adminActivity: () => request('/admin/activity'),
  adminReports: () => request('/admin/reports'),
  updateReport: (id, status) => request(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  createReport: (details) => request('/profiles/reports', { method: 'POST', body: JSON.stringify(details) }),
}
