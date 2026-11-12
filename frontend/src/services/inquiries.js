const apiBaseUrl = import.meta.env.VITE_API_URL || '/api'

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
  listOpen: (params = {}) => {
    const query = new URLSearchParams()
    if (params.categoryId) query.set('categoryId', params.categoryId)
    if (params.area) query.set('area', params.area)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return request(`/inquiries/open${suffix}`)
  },
  get: (id) => request(`/inquiries/${id}`),
  create: (details) => request('/inquiries', { method: 'POST', body: JSON.stringify(details) }),
  renew: (id, expiresInDays = 14) => request(`/inquiries/${id}/renew`, { method: 'POST', body: JSON.stringify({ expiresInDays }) }),
  close: (id, status) => request(`/inquiries/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  quote: (id, details) => request(`/inquiries/${id}/quotations`, { method: 'POST', body: JSON.stringify(details) }),
  reviseQuote: (quotationId, details) => request(`/inquiries/quotations/${quotationId}`, { method: 'PUT', body: JSON.stringify(details) }),
  withdrawQuote: (quotationId) => request(`/inquiries/quotations/${quotationId}/withdraw`, { method: 'POST' }),
  quoteStatus: (id, status) => request(`/inquiries/quotations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
}
