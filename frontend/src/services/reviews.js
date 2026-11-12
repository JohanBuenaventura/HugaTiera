const apiBaseUrl = import.meta.env.VITE_API_URL || '/api'

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(data?.message || 'The review request failed.')
  return data
}

export const reviewsApi = {
  gardener: (id) => request(`/reviews/gardeners/${id}`),
  booking: (id) => request(`/reviews/bookings/${id}`),
  create: (details) => request('/reviews', { method: 'POST', body: JSON.stringify(details) }),
}
