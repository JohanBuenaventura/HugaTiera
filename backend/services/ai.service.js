const DEFAULT_MODEL = 'gemini-3.8-flash'
const MAX_INPUT_LENGTH = 3000
const MAX_OUTPUT_TOKENS = 2048
const PHOTO_ANALYSIS_MAX_OUTPUT_TOKENS = 1024
const REQUEST_TIMEOUT_MS = 30000
const VALID_THINKING_LEVELS = new Set(['minimal', 'low', 'medium', 'high'])
const FALLBACK_HTTP_STATUSES = new Set([429, 500, 502, 503, 504])
const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

// Explicit legacy mappings only for retired Gemini 1.x / early placeholder identifiers.
// Valid Gemini 3.x (e.g. gemini-3.8-flash, gemini-3.5-flash-lite) and 2.5 models are preserved as configured.
const LEGACY_MODEL_MAP = Object.freeze({
  'gemini-pro': DEFAULT_MODEL,
  'gemini-pro-vision': DEFAULT_MODEL,
  'gemini-1.0-pro': DEFAULT_MODEL,
  'gemini-1.5-flash': DEFAULT_MODEL,
  'gemini-1.5-pro': DEFAULT_MODEL,
})

const AI_SAFETY_DISCLAIMER = 'AI suggestions are informational and editable; verify important plant, safety, and site decisions with a qualified local gardening professional.'

function normalizeModelName(configuredModel) {
  const trimmed = typeof configuredModel === 'string' ? configuredModel.trim() : ''
  if (!trimmed) {
    return DEFAULT_MODEL
  }
  const lower = trimmed.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(LEGACY_MODEL_MAP, lower)) {
    return LEGACY_MODEL_MAP[lower]
  }
  return trimmed
}

function getModelName() {
  return normalizeModelName(process.env.GEMINI_MODEL)
}

function getFallbackModelName(primaryModel = getModelName()) {
  const rawFallback = process.env.GEMINI_FALLBACK_MODEL
  const trimmed = typeof rawFallback === 'string' ? rawFallback.trim() : ''
  if (!trimmed) {
    return null
  }
  const normalizedFallback = normalizeModelName(trimmed)
  if (
    !normalizedFallback ||
    normalizedFallback.toLowerCase() === String(primaryModel || '').trim().toLowerCase()
  ) {
    return null
  }
  return normalizedFallback
}

function getProviderFailureCode(error) {
  if (!error) return 'UNKNOWN_ERROR'
  if (error.code === 'IMAGE_GENERATION_POSTPONED' || error.statusCode === 501) {
    return 'IMAGE_GENERATION_POSTPONED'
  }
  if (error.message === 'GEMINI_API_KEY is not configured.') {
    return 'NO_API_KEY'
  }
  if (error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.code === 'ETIMEDOUT') {
    return 'TIMEOUT'
  }
  if (Number.isInteger(error.providerStatus)) {
    if (error.providerStatus === 404) return 'MODEL_UNAVAILABLE'
    return `PROVIDER_${error.providerStatus}`
  }
  if (
    error.isNetworkError === true ||
    NETWORK_ERROR_CODES.has(error.code) ||
    (error.name === 'TypeError' && /fetch failed|network/i.test(String(error.message)))
  ) {
    return 'NETWORK_ERROR'
  }
  return 'INTERNAL_ERROR'
}

function isEligibleForFallback(error) {
  if (!error) return false
  if (error.code === 'IMAGE_GENERATION_POSTPONED' || error.statusCode === 501) {
    return false
  }
  if (error.message === 'GEMINI_API_KEY is not configured.') {
    return false
  }
  if (error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.code === 'ETIMEDOUT') {
    return true
  }
  if (Number.isInteger(error.providerStatus)) {
    return FALLBACK_HTTP_STATUSES.has(error.providerStatus)
  }
  if (
    error.isNetworkError === true ||
    NETWORK_ERROR_CODES.has(error.code) ||
    (error.name === 'TypeError' && /fetch failed|network/i.test(String(error.message)))
  ) {
    return true
  }
  return false
}

function isGemini3Model(model) {
  return /^gemini-3(\.|-)/i.test(String(model || '').trim())
}

function resolveThinkingLevel(preferredLevel = null) {
  const raw = preferredLevel || process.env.GEMINI_THINKING_LEVEL || 'low'
  const normalized = String(raw).trim().toLowerCase()
  return VALID_THINKING_LEVELS.has(normalized) ? normalized : 'low'
}

function buildGenerationConfig({
  model,
  temperature = 0.4,
  maxOutputTokens = MAX_OUTPUT_TOKENS,
  responseMimeType = null,
  thinkingLevel = null,
}) {
  const generationConfig = {
    temperature,
    maxOutputTokens,
  }
  if (responseMimeType) {
    generationConfig.responseMimeType = responseMimeType
  }
  if (isGemini3Model(model)) {
    generationConfig.thinkingConfig = {
      thinkingLevel: resolveThinkingLevel(thinkingLevel),
    }
  }
  return generationConfig
}

function extractCandidateText(data) {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts) || parts.length === 0) {
    return ''
  }
  const nonThoughtParts = parts.filter((part) => !part?.thought && typeof part?.text === 'string')
  const targetParts = nonThoughtParts.length > 0 ? nonThoughtParts : parts
  return targetParts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()
}

function getConfig(requestedModel = null) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('GEMINI_API_KEY is not configured.')
  }
  return {
    apiKey: String(apiKey).trim(),
    model: requestedModel ? normalizeModelName(requestedModel) : getModelName(),
  }
}

async function callGeminiGenerateContent({
  model: requestedModel = null,
  parts,
  temperature = 0.4,
  maxOutputTokens = MAX_OUTPUT_TOKENS,
  responseMimeType = null,
  thinkingLevel = null,
}) {
  const { apiKey, model } = getConfig(requestedModel)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const generationConfig = buildGenerationConfig({
      model,
      temperature,
      maxOutputTokens,
      responseMimeType,
      thinkingLevel,
    })

    let response
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig,
          }),
        },
      )
    } catch (fetchErr) {
      if (fetchErr && fetchErr.name !== 'AbortError') {
        fetchErr.isNetworkError = true
      }
      throw fetchErr
    }

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const error = new Error(data?.error?.message || 'The AI provider rejected the request.')
      error.providerStatus = response.status
      throw error
    }

    const text = extractCandidateText(data)
    if (!text) {
      throw new Error('The AI provider returned an empty response.')
    }
    return { text, model }
  } finally {
    clearTimeout(timeout)
  }
}

function buildGardenPlanPrompt(input) {
  return `You are HugaTiera's gardening planning assistant for Zamboanga City, Philippines.
Give practical, concise, text-only gardening suggestions based on the user's request.
You may recommend plants, garden styles, small-space arrangements, and basic care.
Ask up to three useful follow-up questions if the request lacks important details.
Do not diagnose plant diseases, guarantee outcomes, provide dangerous chemical instructions,
or present suggestions as professional horticultural advice.
Mention local climate considerations when relevant. Structure the response with short headings
and bullet points where helpful. End with: "AI suggestions are informational; verify important
plant, safety, and site decisions with a qualified local gardening professional."

User request:
${input}`
}

function buildRequirementsPrompt({ subject, description, location, categories = [], photoDescriptions = [] }) {
  const categoryListText = categories.length > 0
    ? categories.map((c) => `- ID ${c.id}: ${c.name}${c.description ? ` (${c.description})` : ''}`).join('\n')
    : '- None provided'

  const photoContextText = photoDescriptions.length > 0
    ? photoDescriptions.map((desc, idx) => `Photo ${idx + 1}: ${desc}`).join('\n')
    : 'No photo descriptions provided.'

  return `You are HugaTiera's Gardening Requirement Assistant for Zamboanga City, Philippines.
Your job is to help a client organize their gardening request into a clear, structured summary for local gardeners, suggest the best matching service category from the provided list, and offer practical gardening ideas.
Do NOT approve requests, select a provider, set a final price, diagnose plant diseases, or guarantee outcomes.

Available Service Categories:
${categoryListText}

Client Subject: ${subject || 'Not specified'}
Client Area/Location: ${location || 'Zamboanga City'}
Client Raw Description:
${description}

Attached Garden Photo Descriptions:
${photoContextText}

Respond ONLY with a valid JSON object matching this exact structure:
{
  "structuredSummary": "A concise 2 to 4 sentence summary of the scope, space, and goals suitable for gardeners evaluating feasibility.",
  "refinedDescription": "A clear, well-organized version of the client's project description.",
  "suggestedCategoryId": null,
  "suggestedCategoryName": null,
  "gardeningIdeas": ["Practical suggestion 1 for Zamboanga City climate", "Practical suggestion 2"],
  "followUpQuestions": ["Useful detail the client might want to clarify 1", "Question 2"]
}`
}

function buildPhotoAnalysisPrompt(clientNotes = '') {
  return `You are HugaTiera's Garden Space Photo Assistant for Zamboanga City, Philippines.
Describe the visible outdoor or garden space in this photo in 2 to 4 clear, practical sentences so a local gardener can understand the current site conditions (for example: approximate layout, overgrown grass, bare soil, shaded wall, container plants, or slope/drainage cues).
Do NOT attempt to identify private addresses or personal identities, do NOT diagnose plant diseases, do NOT quote prices, and do NOT guarantee outcomes.
${clientNotes ? `\nClient notes about this photo: ${clientNotes}` : ''}`
}

function parseRequirementsJson(rawText, categories = []) {
  let cleaned = String(rawText || '').trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  }

  let parsed = null
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
      } catch {
        parsed = null
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      structuredSummary: cleaned.slice(0, 1500),
      refinedDescription: '',
      suggestedCategoryId: null,
      suggestedCategoryName: null,
      gardeningIdeas: [],
      followUpQuestions: [],
    }
  }

  let matchedCategory = null
  if (parsed.suggestedCategoryId !== undefined && parsed.suggestedCategoryId !== null) {
    matchedCategory = categories.find((c) => Number(c.id) === Number(parsed.suggestedCategoryId)) || null
  }
  if (!matchedCategory && typeof parsed.suggestedCategoryName === 'string' && parsed.suggestedCategoryName.trim()) {
    const targetName = parsed.suggestedCategoryName.trim().toLowerCase()
    matchedCategory = categories.find((c) => String(c.name).toLowerCase() === targetName) || null
  }

  const normalizeStringList = (arr, maxItems = 5) => (
    Array.isArray(arr)
      ? arr.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean).slice(0, maxItems)
      : []
  )

  return {
    structuredSummary: typeof parsed.structuredSummary === 'string' ? parsed.structuredSummary.trim().slice(0, 2000) : '',
    refinedDescription: typeof parsed.refinedDescription === 'string' ? parsed.refinedDescription.trim().slice(0, 4000) : '',
    suggestedCategoryId: matchedCategory ? Number(matchedCategory.id) : null,
    suggestedCategoryName: matchedCategory ? matchedCategory.name : null,
    gardeningIdeas: normalizeStringList(parsed.gardeningIdeas, 5),
    followUpQuestions: normalizeStringList(parsed.followUpQuestions, 4),
  }
}

function createGeminiProvider() {
  return {
    name: 'gemini',
    getModel() {
      return getModelName()
    },
    getFallbackModel(primaryModel = getModelName()) {
      return getFallbackModelName(primaryModel)
    },
    async generateGardenPlan(input, options = {}) {
      const { text } = await callGeminiGenerateContent({
        model: options.model || null,
        parts: [{ text: buildGardenPlanPrompt(input) }],
        temperature: 0.4,
      })
      return text
    },
    async generateRequirementAssistance({ subject, description, location, categories = [], photoDescriptions = [] }, options = {}) {
      const prompt = buildRequirementsPrompt({
        subject,
        description,
        location,
        categories,
        photoDescriptions,
      })
      const { text } = await callGeminiGenerateContent({
        model: options.model || null,
        parts: [{ text: prompt }],
        temperature: 0.3,
        responseMimeType: 'application/json',
      })
      return parseRequirementsJson(text, categories)
    },
    async analyzeGardenPhoto({ imageBuffer, mimeType, clientNotes = '' }, options = {}) {
      if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        throw new Error('A valid image buffer is required for photo analysis.')
      }
      const { text } = await callGeminiGenerateContent({
        model: options.model || null,
        parts: [
          {
            inline_data: {
              mime_type: mimeType || 'image/jpeg',
              data: imageBuffer.toString('base64'),
            },
          },
          {
            text: buildPhotoAnalysisPrompt(clientNotes),
          },
        ],
        temperature: 0.3,
        maxOutputTokens: PHOTO_ANALYSIS_MAX_OUTPUT_TOKENS,
      })
      return text.slice(0, 2000)
    },
    async generateGardenImage() {
      const error = new Error(
        'AI image generation and editing are postponed and disabled. Only text and uploaded-photo understanding are enabled.',
      )
      error.statusCode = 501
      error.code = 'IMAGE_GENERATION_POSTPONED'
      throw error
    },
  }
}

let activeProvider = createGeminiProvider()

function getAiProvider() {
  return activeProvider
}

function setAiProviderForTesting(customProvider) {
  if (!customProvider || typeof customProvider !== 'object') {
    throw new Error('A valid provider object is required.')
  }
  activeProvider = customProvider
}

function resetAiProvider() {
  activeProvider = createGeminiProvider()
}

async function executeWithModelFallback(methodName, payload) {
  const provider = getAiProvider()
  if (!provider || typeof provider[methodName] !== 'function') {
    throw new Error(`AI provider does not implement ${methodName}.`)
  }

  const primaryModel = typeof provider.getModel === 'function' ? provider.getModel() : getModelName()
  const fallbackModel = typeof provider.getFallbackModel === 'function'
    ? provider.getFallbackModel(primaryModel)
    : getFallbackModelName(primaryModel)

  try {
    const result = await provider[methodName](payload, {
      model: primaryModel,
      isFallback: false,
    })
    return {
      result,
      model: primaryModel,
      primaryModel,
      fallbackModel: null,
      fallbackUsed: false,
      primaryErrorCode: null,
    }
  } catch (primaryError) {
    const primaryErrorCode = getProviderFailureCode(primaryError)
    primaryError.attemptedModel = primaryModel
    primaryError.primaryModel = primaryModel
    primaryError.primaryErrorCode = primaryErrorCode
    primaryError.fallbackAttempted = false

    if (!fallbackModel || !isEligibleForFallback(primaryError)) {
      throw primaryError
    }

    try {
      const fallbackResult = await provider[methodName](payload, {
        model: fallbackModel,
        isFallback: true,
        primaryModel,
        primaryErrorCode,
      })
      return {
        result: fallbackResult,
        model: fallbackModel,
        primaryModel,
        fallbackModel,
        fallbackUsed: true,
        primaryErrorCode,
      }
    } catch (fallbackError) {
      const fallbackErrorCode = getProviderFailureCode(fallbackError)
      fallbackError.primaryError = primaryError
      fallbackError.primaryModel = primaryModel
      fallbackError.primaryErrorCode = primaryErrorCode
      fallbackError.fallbackModel = fallbackModel
      fallbackError.fallbackErrorCode = fallbackErrorCode
      fallbackError.attemptedModel = fallbackModel
      fallbackError.fallbackAttempted = true
      throw fallbackError
    }
  }
}

async function generateGardenPlan(input, options = {}) {
  return getAiProvider().generateGardenPlan(input, options)
}

async function generateRequirementAssistance(payload, options = {}) {
  return getAiProvider().generateRequirementAssistance(payload, options)
}

async function analyzeGardenPhoto(payload, options = {}) {
  return getAiProvider().analyzeGardenPhoto(payload, options)
}

async function generateGardenImage(payload) {
  return getAiProvider().generateGardenImage(payload)
}

module.exports = {
  AI_SAFETY_DISCLAIMER,
  DEFAULT_MODEL,
  LEGACY_MODEL_MAP,
  MAX_INPUT_LENGTH,
  MAX_OUTPUT_TOKENS,
  PHOTO_ANALYSIS_MAX_OUTPUT_TOKENS,
  analyzeGardenPhoto,
  buildGenerationConfig,
  createGeminiProvider,
  executeWithModelFallback,
  extractCandidateText,
  generateGardenImage,
  generateGardenPlan,
  generateRequirementAssistance,
  getAiProvider,
  getFallbackModelName,
  getModelName,
  getProviderFailureCode,
  isEligibleForFallback,
  isGemini3Model,
  normalizeModelName,
  parseRequirementsJson,
  resetAiProvider,
  setAiProviderForTesting,
}
