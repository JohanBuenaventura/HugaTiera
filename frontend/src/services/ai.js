const apiBaseUrl = import.meta.env.VITE_API_URL || '/api'

async function aiRequest(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message || 'The Garden Planning Assistant request failed.')
  }
  return data
}

export async function requestGardenPlan(input) {
  return aiRequest('/ai/garden-plan', {
    method: 'POST',
    body: JSON.stringify({ input }),
  })
}

export async function requestRequirementAssistance({
  subject = '',
  description = '',
  location = '',
  imageIds = [],
  inquiryId = null,
}) {
  return aiRequest('/ai/requirements', {
    method: 'POST',
    body: JSON.stringify({
      subject,
      description,
      location,
      imageIds,
      ...(inquiryId ? { inquiryId } : {}),
    }),
  })
}

export async function requestPhotoAnalysis({ imageId, notes = '' }) {
  return aiRequest('/ai/photo-analysis', {
    method: 'POST',
    body: JSON.stringify({ imageId, notes }),
  })
}

export async function fetchAiUsage() {
  return aiRequest('/ai/usage')
}

export async function fetchSmartRecommendations(params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) {
      query.set(key, String(value))
    }
  }
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return aiRequest(`/ai/recommendations${suffix}`)
}

export async function requestRecommendationSummary(payload) {
  return aiRequest('/ai/recommendations/summary', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
