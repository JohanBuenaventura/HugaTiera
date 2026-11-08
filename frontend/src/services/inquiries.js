const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(data?.message || 'The inquiry request failed.')
  return data
}

export const inquiriesApi = {
  list: () => request('/inquiries'),
  get: (id) => request(`/inquiries/${id}`),
  create: (details) => request('/inquiries', { method: 'POST', body: JSON.stringify(details) }),
  close: (id, status) => request(`/inquiries/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  quote: (id, details) => request(`/inquiries/${id}/quotations`, { method: 'POST', body: JSON.stringify(details) }),
  quoteStatus: (id, status) => request(`/inquiries/quotations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
}
