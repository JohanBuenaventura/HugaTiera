import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Leaf } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import editorialAbout from '../assets/editorial-about.jpg'

function AuthLayout({ title, children, footer }) {
  return (
    <main className="auth-page editorial-auth-page">
      <div className="auth-layout">
        <aside className="auth-visual">
          <Link className="brand auth-visual-brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link>
          <img src={editorialAbout} alt="Lush garden plants in natural light" />
          <div className="auth-visual-copy"><p className="editorial-kicker editorial-kicker-light">A better way to grow</p><h2>Make room for<br /><em>something green.</em></h2><p>Find the right people and ideas to help your outdoor space flourish.</p></div>
          <span className="auth-visual-caption">Local gardens · thoughtful conversations</span>
        </aside>
        <div className="auth-panel">
          <Link className="auth-mobile-brand brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link>
          <p className="eyebrow">Welcome to HugaTiera</p>
          <h1>{title}</h1>
          {children}
          <p className="auth-footer">{footer}</p>
        </div>
      </div>
    </main>
  )
}

const RECENT_EMAILS_KEY = 'hugatiera.recentEmails'

function loadRecentEmails() {
  try {
    const raw = localStorage.getItem(RECENT_EMAILS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.includes('@')).slice(0, 5) : []
  } catch {
    return []
  }
}

function saveRecentEmail(email) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return
  try {
    const next = [normalized, ...loadRecentEmails().filter((item) => item.toLowerCase() !== normalized)].slice(0, 5)
    localStorage.setItem(RECENT_EMAILS_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage errors in private browsing
  }
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [recentEmails, setRecentEmails] = useState(loadRecentEmails)
  const [form, setForm] = useState(() => ({ email: recentEmails[0] || '', password: '' }))
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(form)
      saveRecentEmail(form.email)
      setRecentEmails(loadRecentEmails())
      navigate('/dashboard')
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function removeRecentEmail(emailToRemove) {
    const next = recentEmails.filter((item) => item !== emailToRemove)
    setRecentEmails(next)
    try {
      localStorage.setItem(RECENT_EMAILS_KEY, JSON.stringify(next))
    } catch {
      // Ignore storage errors
    }
  }

  return <AuthLayout title="Welcome back." footer={<>New to HugaTiera? <Link to="/register">Create an account</Link></>}>
    <form className="auth-form" onSubmit={handleSubmit} autoComplete="on">
      {error && <div className="form-error" role="alert">{error}</div>}
      <label>
        Email address
        <input
          name="email"
          type="email"
          list="hugatiera-recent-emails"
          required
          autoComplete="username"
          placeholder="you@example.com"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
        <datalist id="hugatiera-recent-emails">
          {recentEmails.map((savedEmail) => (
            <option value={savedEmail} key={savedEmail} />
          ))}
        </datalist>
      </label>
      {recentEmails.length > 0 && (
        <div className="recent-email-row" aria-label="Recently used emails">
          <span className="field-note">Quick fill:</span>
          {recentEmails.map((savedEmail) => (
            <span className="recent-email-chip" key={savedEmail}>
              <button type="button" onClick={() => setForm((current) => ({ ...current, email: savedEmail }))}>
                {savedEmail}
              </button>
              <button
                type="button"
                className="recent-email-remove"
                aria-label={`Forget ${savedEmail}`}
                onClick={() => removeRecentEmail(savedEmail)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <label>
        Password
        <div className="password-input-wrap">
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
          <button
            className="password-toggle"
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </label>
      <button className="button" type="submit" disabled={submitting}>{submitting ? 'Signing in...' : 'Sign in'}</button>
    </form>
  </AuthLayout>
}

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const initialRole = params.get('role') === 'gardener' ? 'gardener' : 'client'
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', role: initialRole })
  const [showPassword, setShowPassword] = useState(false)
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
      <div className="form-row">
        <label>First name<input required placeholder="First name" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label>
        <label>Last name<input required placeholder="Last name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label>
      </div>
      <label>Email address<input type="email" required autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>
        Password <span className="label-note">(8–72 characters)</span>
        <div className="password-input-wrap">
          <input
            type={showPassword ? 'text' : 'password'}
            required
            minLength="8"
            maxLength="72"
            autoComplete="new-password"
            placeholder="Create a strong password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
          <button
            className="password-toggle"
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </label>
      <fieldset><legend>I want to...</legend><div className="role-options"><label className={form.role === 'client' ? 'selected' : ''}><input type="radio" name="role" value="client" checked={form.role === 'client'} onChange={(event) => setForm({ ...form, role: event.target.value })} /> Find a gardener</label><label className={form.role === 'gardener' ? 'selected' : ''}><input type="radio" name="role" value="gardener" checked={form.role === 'gardener'} onChange={(event) => setForm({ ...form, role: event.target.value })} /> Offer services</label></div></fieldset>
      <button className="button" type="submit" disabled={submitting}>{submitting ? 'Creating account...' : 'Create account'}</button>
      {location.pathname && <p className="form-note">Your account is protected with a secure session cookie.</p>}
    </form>
  </AuthLayout>
}
