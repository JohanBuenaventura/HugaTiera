const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(data?.message || 'The service request failed.')
  return data
}

export const servicesApi = {
  categories: () => request('/services/categories'),
  list: (filters = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
    return request(`/services${query.toString() ? `?${query}` : ''}`)
  },
  detail: (id) => request(`/services/${id}`),
  gardener: (id) => request(`/gardeners/${id}`),
  mine: () => request('/services/mine'),
  create: (service) => request('/services', { method: 'POST', body: JSON.stringify(service) }),
  update: (id, service) => request(`/services/${id}`, { method: 'PUT', body: JSON.stringify(service) }),
  remove: (id) => request(`/services/${id}`, { method: 'DELETE' }),
  portfolios: () => request('/portfolios/me'),
  addPortfolio: (formData) => request('/portfolios', { method: 'POST', body: formData }),
  updatePortfolio: (id, details) => request(`/portfolios/${id}`, { method: 'PUT', body: JSON.stringify(details) }),
  removePortfolio: (id) => request(`/portfolios/${id}`, { method: 'DELETE' }),
  imageUrl: (id) => `${apiBaseUrl}/portfolios/${id}/image`,
}
