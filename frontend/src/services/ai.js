const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export async function requestGardenPlan(input) {
  const response = await fetch(`${apiBaseUrl}/ai/garden-plan`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.message || 'The Garden Planning Assistant request failed.')
  return data
}
