import { Link, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ProtectedRoute({ roles }) {
  const { user, loading, authError, retryAuth } = useAuth()

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
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />

  return <Outlet />
}
