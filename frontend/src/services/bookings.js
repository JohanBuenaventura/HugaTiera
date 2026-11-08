const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(data?.message || 'The booking request failed.')
  return data
}

export const bookingsApi = {
  list: () => request('/bookings'),
  get: (id) => request(`/bookings/${id}`),
  create: (details) => request('/bookings', { method: 'POST', body: JSON.stringify(details) }),
  status: (id, status) => request(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
}
