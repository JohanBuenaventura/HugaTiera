const apiBaseUrl = import.meta.env?.VITE_API_URL || '/api'

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.message || 'The clerk request could not be completed.')
    error.status = response.status
    error.code = data?.code
    throw error
  }
  return data
}

export const clerkApi = {
  workspace: () => request('/clerk/workspace'),
  updateSchedule: (gardenerId, payload) => request(`/clerk/gardeners/${gardenerId}/schedule`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }),
  addUnavailableDate: (gardenerId, payload) => request(`/clerk/gardeners/${gardenerId}/unavailable-dates`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  removeUnavailableDate: (gardenerId, blockId) => request(`/clerk/gardeners/${gardenerId}/unavailable-dates/${blockId}`, {
    method: 'DELETE',
  }),
  createService: (gardenerId, payload) => request(`/clerk/gardeners/${gardenerId}/services`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  toggleServiceStatus: (gardenerId, serviceId, isActive) => request(`/clerk/gardeners/${gardenerId}/services/${serviceId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  }),
  verifyPayment: (gardenerId, bookingId, paymentId, payload) => request(`/clerk/gardeners/${gardenerId}/bookings/${bookingId}/payments/${paymentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
}
