import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ProtectedRoute({ roles }) {
  const { user, loading, authError, retryAuth } = useAuth()
  const location = useLocation()

  if (loading) return <div className="route-loading">Checking your session...</div>
  if (authError) {
    return (
      <main className="auth-page">
        <div className="auth-panel">
          <p className="eyebrow">Service status</p>
          <h1>Unable to reach server.</h1>
          <div className="form-error" role="alert">{authError}</div>
          <div className="inline-actions" style={{ marginTop: '18px' }}>
            <button className="button" type="button" onClick={retryAuth}>Try again</button>
            <Link className="text-link" to="/">Return home</Link>
          </div>
        </div>
      </main>
    )
  }
  if (!user) {
    const intended = `${location.pathname || ''}${location.search || ''}`
    const shouldCarryNext = intended && intended !== '/' && !intended.startsWith('/login') && !intended.startsWith('/register')
    return <Navigate to={shouldCarryNext ? `/login?next=${encodeURIComponent(intended)}` : '/login'} replace />
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />

  return <Outlet />
}
