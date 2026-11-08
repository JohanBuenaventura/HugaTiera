import { useEffect, useMemo, useState } from 'react'
import { authApi } from '../services/auth'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authApi.currentUser()
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    login: async (credentials) => {
      const result = await authApi.login(credentials)
      setUser(result.user)
      return result.user
    },
    logout: async () => {
      await authApi.logout()
      setUser(null)
    },
    register: async (details) => {
      const result = await authApi.register(details)
      setUser(result.user)
      return result.user
    },
  }), [loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
