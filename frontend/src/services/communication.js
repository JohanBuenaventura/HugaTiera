const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(data?.message || 'The communication request failed.')
  return data
}

export const communicationApi = {
  conversations: () => request('/conversations'),
  createConversation: (inquiryId) => request('/conversations', { method: 'POST', body: JSON.stringify({ inquiryId }) }),
  messages: (id) => request(`/conversations/${id}/messages`),
  sendMessage: (id, message) => request(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
  notifications: () => request('/notifications'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PATCH' }),
}
