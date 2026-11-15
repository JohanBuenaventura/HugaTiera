function getBaseUrl() {
  return String(process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '')
}

function getWorkflow() {
  const raw = String(process.env.COMFYUI_WORKFLOW_JSON || '').trim()
  if (!raw) {
    const error = new Error('COMFYUI_WORKFLOW_JSON is not configured for the local image provider.')
    error.code = 'COMFYUI_WORKFLOW_NOT_CONFIGURED'
    error.statusCode = 503
    throw error
  }
  try {
    return JSON.parse(raw)
  } catch {
    const error = new Error('COMFYUI_WORKFLOW_JSON is not valid JSON.')
    error.code = 'COMFYUI_WORKFLOW_INVALID'
    error.statusCode = 503
    throw error
  }
}

function replacePlaceholders(value, imageName, prompt) {
  if (typeof value === 'string') return value.replaceAll('{{INPUT_IMAGE}}', imageName).replaceAll('{{PROMPT}}', prompt)
  if (Array.isArray(value)) return value.map((item) => replacePlaceholders(item, imageName, prompt))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePlaceholders(item, imageName, prompt)]))
  }
  return value
}

async function requestJson(url, options) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `ComfyUI request failed with status ${response.status}.`)
    error.providerStatus = response.status
    throw error
  }
  return data
}

async function generateImage({ imageBuffer, prompt, fileName = 'garden-input.jpg' }) {
  const baseUrl = getBaseUrl()
  const form = new FormData()
  form.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), fileName)
  const uploaded = await requestJson(`${baseUrl}/upload/image`, { method: 'POST', body: form })
  const workflow = replacePlaceholders(getWorkflow(), uploaded.name, prompt)
  const queued = await requestJson(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  })
  const deadline = Date.now() + (Number(process.env.COMFYUI_TIMEOUT_MS) || 120000)
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const history = await requestJson(`${baseUrl}/history/${encodeURIComponent(queued.prompt_id)}`)
    const entry = history?.[queued.prompt_id]
    const output = Object.values(entry?.outputs || {}).flatMap((node) => node.images || [])
      .find((item) => item?.filename)
    if (!output) continue
    const imageResponse = await fetch(`${baseUrl}/view?filename=${encodeURIComponent(output.filename)}&subfolder=${encodeURIComponent(output.subfolder || '')}&type=${encodeURIComponent(output.type || 'output')}`)
    if (!imageResponse.ok) throw new Error('ComfyUI generated an image but it could not be downloaded.')
    return { imageBuffer: Buffer.from(await imageResponse.arrayBuffer()), mimeType: imageResponse.headers.get('content-type') || 'image/png', model: 'comfyui-local' }
  }
  const error = new Error('ComfyUI did not finish before the configured timeout.')
  error.code = 'COMFYUI_TIMEOUT'
  error.statusCode = 504
  throw error
}

module.exports = { generateImage }
