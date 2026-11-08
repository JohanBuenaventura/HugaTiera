import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Leaf } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

function AuthLayout({ title, children, footer }) {
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <Link className="brand auth-brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link>
        <p className="eyebrow">A better way to grow</p>
        <h1>{title}</h1>
        {children}
        <p className="auth-footer">{footer}</p>
      </div>
    </main>
  )
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try { await login(form); navigate('/dashboard') } catch (submitError) { setError(submitError.message) } finally { setSubmitting(false) }
  }

  return <AuthLayout title="Welcome back." footer={<>New to HugaTiera? <Link to="/register">Create an account</Link></>}>
    <form className="auth-form" onSubmit={handleSubmit}>
      {error && <div className="form-error" role="alert">{error}</div>}
      <label>Email address<input type="email" required autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Password<input type="password" required autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
      <button className="button" type="submit" disabled={submitting}>{submitting ? 'Signing in...' : 'Sign in'}</button>
    </form>
  </AuthLayout>
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'client' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try { await register(form); navigate('/dashboard') } catch (submitError) { setError(submitError.message) } finally { setSubmitting(false) }
  }

  return <AuthLayout title="Create your account." footer={<>Already have an account? <Link to="/login">Sign in</Link></>}>
    <form className="auth-form" onSubmit={handleSubmit}>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-row"><label>First name<input required value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label><label>Last name<input required value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label></div>
      <label>Email address<input type="email" required autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>Password <span className="label-note">(8–72 characters)</span><input type="password" required minLength="8" maxLength="72" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
      <fieldset><legend>I want to...</legend><div className="role-options"><label className={form.role === 'client' ? 'selected' : ''}><input type="radio" name="role" value="client" checked={form.role === 'client'} onChange={(event) => setForm({ ...form, role: event.target.value })} /> Find a gardener</label><label className={form.role === 'gardener' ? 'selected' : ''}><input type="radio" name="role" value="gardener" checked={form.role === 'gardener'} onChange={(event) => setForm({ ...form, role: event.target.value })} /> Offer services</label></div></fieldset>
      <button className="button" type="submit" disabled={submitting}>{submitting ? 'Creating account...' : 'Create account'}</button>
      {location.pathname && <p className="form-note">Your account is protected with a secure session cookie.</p>}
    </form>
  </AuthLayout>
}
