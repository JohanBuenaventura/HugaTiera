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

export async function requestGardenPlanStream(input, { onChunk, signal } = {}) {
  const response = await fetch(`${apiBaseUrl}/ai/garden-plan/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ input }),
    signal,
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.message || 'The Garden Planning Assistant request failed.')
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/event-stream') || !response.body || typeof response.body.getReader !== 'function') {
    const data = await response.json()
    if (typeof onChunk === 'function' && data?.answer) onChunk(data.answer)
    return data
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''
  let finalMeta = null

  const processEventBlock = (block) => {
    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
    if (dataLines.length === 0) return
    let payload
    try {
      payload = JSON.parse(dataLines.join('\n'))
    } catch {
      return
    }
    if (payload.type === 'chunk' && typeof payload.text === 'string') {
      accumulated += payload.text
      if (typeof onChunk === 'function') onChunk(payload.text, accumulated)
    } else if (payload.type === 'done') {
      finalMeta = payload
    } else if (payload.type === 'error') {
      throw new Error(payload.message || 'The Garden Planning Assistant request failed.')
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    for (const block of blocks) {
      processEventBlock(block)
    }
  }

  if (buffer.trim()) {
    processEventBlock(buffer)
  }

  return {
    answer: finalMeta?.answer || accumulated.trim(),
    model: finalMeta?.model || '',
    fallbackUsed: Boolean(finalMeta?.fallbackUsed),
    disclaimer: finalMeta?.disclaimer || 'AI suggestions are informational and may require verification from a qualified local gardening professional.',
  }
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
