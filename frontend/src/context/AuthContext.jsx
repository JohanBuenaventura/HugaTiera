import { useCallback, useEffect, useMemo, useState } from 'react'
import { authApi } from '../services/auth'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  const loadCurrentUser = useCallback(() => authApi.currentUser()
    .then(({ user: currentUser }) => {
      setUser(currentUser)
      setAuthError('')
    })
    .catch((error) => {
      if (error.status === 401) {
        setUser(null)
        setAuthError('')
      } else {
        setAuthError(error.message || 'The backend service is temporarily unavailable.')
      }
    })
    .finally(() => setLoading(false)), [])

  useEffect(() => {
    loadCurrentUser()
  }, [loadCurrentUser])

  const retryAuth = useCallback(() => {
    setLoading(true)
    setAuthError('')
    return loadCurrentUser()
  }, [loadCurrentUser])

  const value = useMemo(() => ({
    user,
    loading,
    authError,
    retryAuth,
    login: async (credentials) => {
      const result = await authApi.login(credentials)
      setUser(result.user)
      setAuthError('')
      return result.user
    },
    logout: async () => {
      await authApi.logout()
      setUser(null)
      setAuthError('')
    },
    register: async (details) => {
      const result = await authApi.register(details)
      setUser(result.user)
      setAuthError('')
      return result.user
    },
  }), [authError, loading, retryAuth, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
