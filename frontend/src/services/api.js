const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export async function getHealthStatus() {
  const response = await fetch(`${apiBaseUrl}/health`)

  if (!response.ok) {
    throw new Error('Backend health check failed.')
  }

  return response.json()
}
