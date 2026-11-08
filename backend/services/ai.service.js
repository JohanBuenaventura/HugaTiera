const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
const MAX_INPUT_LENGTH = 3000
const MAX_OUTPUT_TOKENS = 700

function getConfig() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.')
  return {
    apiKey,
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
  }
}

function buildPrompt(input) {
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

async function generateGardenPlan(input) {
  const { apiKey, model } = getConfig()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(input) }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
      },
    )
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const error = new Error(data?.error?.message || 'The AI provider rejected the request.')
      error.providerStatus = response.status
      throw error
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim()
    if (!text) throw new Error('The AI provider returned an empty response.')
    return text
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = {
  MAX_INPUT_LENGTH,
  generateGardenPlan,
}
