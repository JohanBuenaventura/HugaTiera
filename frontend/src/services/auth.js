const apiBaseUrl = import.meta.env.VITE_API_URL || '/api'

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch (networkError) {
    const error = new Error('Cannot connect to the HugaTiera backend server. Please verify the backend is running.')
    error.status = 0
    error.cause = networkError
    throw error
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(data?.message || 'The request could not be completed.')
    error.status = response.status
    throw error
  }

  return data
}

export const authApi = {
  currentUser: () => request('/auth/me'),
  login: (credentials) => request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, password) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  changePassword: (currentPassword, newPassword) => request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  register: (details) => request('/auth/register', { method: 'POST', body: JSON.stringify(details) }),
}
