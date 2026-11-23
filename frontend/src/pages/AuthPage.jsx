import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Leaf } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  MIN_REGISTRATION_AGE,
  calculateAgeFromDob,
  getMaxBirthDateForAge,
} from '../services/profiles'
import editorialAbout from '../assets/editorial-about.jpg'

function AuthLayout({ title, children, footer, wide = false }) {
  return (
    <main className="auth-page editorial-auth-page">
      <div className={wide ? 'auth-layout auth-layout-register' : 'auth-layout'}>
        <aside className="auth-visual">
          <Link className="brand auth-visual-brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link>
          <img src={editorialAbout} alt="Lush garden plants in natural light" />
          <div className="auth-visual-copy"><p className="editorial-kicker editorial-kicker-light">A better way to grow</p><h2>Make room for<br /><em>something green.</em></h2><p>Find the right people and ideas to help your outdoor space flourish.</p></div>
          <span className="auth-visual-caption">Local gardens · thoughtful conversations</span>
        </aside>
        <div className={wide ? 'auth-panel auth-panel-register' : 'auth-panel'}>
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
  const [params] = useSearchParams()
  const roleParam = params.get('role')
  const initialRole = ['gardener', 'both', 'clerk'].includes(roleParam) ? roleParam : 'client'
  const [form, setForm] = useState({
    role: initialRole,
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '',
    phone: '',
    address: '',
    city: 'Zamboanga City',
    businessName: '',
    serviceArea: 'Zamboanga City',
    yearsOfExperience: '',
    description: '',
    assignClerkNow: false,
    assignedClerkEmail: '',
    assignedClerkNotes: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const maxBirthDate = getMaxBirthDateForAge(MIN_REGISTRATION_AGE)
  const computedAge = calculateAgeFromDob(form.dateOfBirth)
  const isUnderage = computedAge !== null && computedAge < MIN_REGISTRATION_AGE
  const passwordsMismatch = Boolean(form.confirmPassword && form.password !== form.confirmPassword)

  function updateField(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (computedAge === null) {
      setError('Please enter a valid birthday.')
      return
    }
    if (computedAge < MIN_REGISTRATION_AGE) {
      setError(`You must be at least ${MIN_REGISTRATION_AGE} years old to create an account.`)
      return
    }
    const phoneDigits = form.phone.replace(/\D/g, '')
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      setError('Please enter a valid mobile number (10 to 15 digits).')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.')
      return
    }

    const includeClientFields = form.role === 'client' || form.role === 'both'
    const includeGardenerFields = form.role === 'gardener' || form.role === 'both'

    const payload = {
      role: form.role,
      firstName: form.firstName,
      middleName: form.middleName,
      lastName: form.lastName,
      dateOfBirth: form.dateOfBirth,
      phone: form.phone,
      email: form.email,
      password: form.password,
      confirmPassword: form.confirmPassword,
      ...(includeClientFields
        ? {
          address: form.address,
          city: form.city,
        }
        : {}),
      ...(includeGardenerFields
        ? {
          businessName: form.businessName,
          serviceArea: form.serviceArea,
          yearsOfExperience: form.yearsOfExperience === '' ? null : Number(form.yearsOfExperience),
          description: form.description,
          ...(form.assignClerkNow && form.assignedClerkEmail.trim()
            ? {
              assignedClerkEmail: form.assignedClerkEmail.trim(),
              assignedClerkNotes: form.assignedClerkNotes.trim(),
            }
            : {}),
        }
        : {}),
    }

    setSubmitting(true)
    try {
      await register(payload)
      saveRecentEmail(form.email)
      navigate('/dashboard')
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      wide
      title="Create your account."
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <form className="auth-form auth-form-register" onSubmit={handleSubmit}>
        {error && <div className="form-error" role="alert">{error}</div>}

        <fieldset>
          <legend>I want to...</legend>
          <div className="role-options role-options-4">
            <label className={form.role === 'client' ? 'selected' : ''}>
              <input type="radio" name="role" value="client" checked={form.role === 'client'} onChange={updateField('role')} />
              <span className="role-option-copy">
                <strong>Find a gardener</strong>
                <small>Client account</small>
              </span>
            </label>
            <label className={form.role === 'gardener' ? 'selected' : ''}>
              <input type="radio" name="role" value="gardener" checked={form.role === 'gardener'} onChange={updateField('role')} />
              <span className="role-option-copy">
                <strong>Offer services</strong>
                <small>Gardener (can assign a clerk)</small>
              </span>
            </label>
            <label className={form.role === 'both' ? 'selected' : ''}>
              <input type="radio" name="role" value="both" checked={form.role === 'both'} onChange={updateField('role')} />
              <span className="role-option-copy">
                <strong>Both (Client &amp; Provider)</strong>
                <small>Hire, offer &amp; assign a clerk</small>
              </span>
            </label>
            <label className={form.role === 'clerk' ? 'selected' : ''}>
              <input type="radio" name="role" value="clerk" checked={form.role === 'clerk'} onChange={updateField('role')} />
              <span className="role-option-copy">
                <strong>Work as a Clerk</strong>
                <small>Manage assigned gardeners</small>
              </span>
            </label>
          </div>
          {form.role === 'both' && (
            <p className="field-note" style={{ marginTop: '6px' }}>
              Switch anytime between Client Mode and Gardener / Service Provider Mode with one click inside your dashboard.
            </p>
          )}
          {form.role === 'clerk' && (
            <p className="field-note" style={{ marginTop: '6px' }}>
              Sign up as a Clerk to manage schedules, crew capacity, services, and payment verifications for gardeners who assign you to their account.
            </p>
          )}
        </fieldset>

        <div className="auth-form-section">
          <p className="auth-section-title">Personal information</p>
          <div className="form-row form-row-3">
            <label>
              First name
              <input
                name="firstName"
                required
                maxLength="100"
                autoComplete="given-name"
                placeholder="First name"
                value={form.firstName}
                onChange={updateField('firstName')}
              />
            </label>
            <label>
              Middle name <span className="label-note">(Optional)</span>
              <input
                name="middleName"
                maxLength="100"
                autoComplete="additional-name"
                placeholder="Optional"
                value={form.middleName}
                onChange={updateField('middleName')}
              />
            </label>
            <label>
              Last name
              <input
                name="lastName"
                required
                maxLength="100"
                autoComplete="family-name"
                placeholder="Last name"
                value={form.lastName}
                onChange={updateField('lastName')}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Birthday <span className="label-note">(18+ required)</span>
              <input
                name="dateOfBirth"
                type="date"
                required
                max={maxBirthDate}
                autoComplete="bday"
                value={form.dateOfBirth}
                onChange={updateField('dateOfBirth')}
              />
            </label>
            <label>
              Age <span className="label-note">(Auto-calculated)</span>
              <div
                className={`age-readonly-box${isUnderage ? ' is-invalid' : computedAge !== null ? ' is-valid' : ''}`}
                aria-live="polite"
              >
                {computedAge === null ? (
                  <span className="age-placeholder">Select your birthday</span>
                ) : isUnderage ? (
                  <span>{computedAge} yrs old — Must be 18 or older</span>
                ) : (
                  <span>{computedAge} years old · Qualified (18+)</span>
                )}
              </div>
            </label>
          </div>

          <label>
            Mobile number
            <input
              name="phone"
              type="tel"
              required
              maxLength="30"
              autoComplete="tel"
              placeholder="e.g., 0917 123 4567"
              value={form.phone}
              onChange={updateField('phone')}
            />
          </label>
        </div>

        {(form.role === 'client' || form.role === 'both') && (
          <div className="auth-form-section">
            <p className="auth-section-title">Client location details</p>
            <div className="form-row">
              <label>
                Street / Barangay address
                <input
                  name="address"
                  required
                  maxLength="255"
                  autoComplete="street-address"
                  placeholder="e.g., 123 Tetuan Hwy, Brgy. Tetuan"
                  value={form.address}
                  onChange={updateField('address')}
                />
              </label>
              <label>
                City
                <input
                  name="city"
                  aria-label="City"
                  required
                  maxLength="100"
                  autoComplete="address-level2"
                  placeholder="Zamboanga City"
                  value={form.city}
                  onChange={updateField('city')}
                />
              </label>
            </div>
          </div>
        )}

        {(form.role === 'gardener' || form.role === 'both') && (
          <div className="auth-form-section">
            <p className="auth-section-title">Gardener details</p>
            <div className="form-row">
              <label>
                Business or display name <span className="label-note">(Optional)</span>
                <input
                  name="businessName"
                  maxLength="150"
                  placeholder="Leave blank to use your full name"
                  value={form.businessName}
                  onChange={updateField('businessName')}
                />
              </label>
              <label>
                Years of experience <span className="label-note">(Optional)</span>
                <input
                  name="yearsOfExperience"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="e.g., 3"
                  value={form.yearsOfExperience}
                  onChange={updateField('yearsOfExperience')}
                />
              </label>
            </div>
            <label>
              Service area
              <input
                name="serviceArea"
                required
                maxLength="150"
                placeholder="e.g., Zamboanga City"
                value={form.serviceArea}
                onChange={updateField('serviceArea')}
              />
            </label>
            <label>
              Short bio / specialties <span className="label-note">(Optional)</span>
              <textarea
                name="description"
                rows="2"
                maxLength="2000"
                placeholder="Briefly describe your gardening, lawn care, or landscaping experience"
                value={form.description}
                onChange={updateField('description')}
              />
            </label>

            <div className="signup-clerk-box">
              <label className="signup-clerk-toggle">
                <input
                  type="checkbox"
                  checked={form.assignClerkNow}
                  onChange={(e) => setForm((current) => ({ ...current, assignClerkNow: e.target.checked }))}
                />
                <span>
                  <strong>Assign an existing Clerk to manage my account (Optional)</strong>
                  <small>You can link a clerk right now or create/assign clerks anytime later in Dashboard → My Clerks.</small>
                </span>
              </label>
              {form.assignClerkNow && (
                <div className="form-row" style={{ marginTop: '10px' }}>
                  <label>
                    Clerk email address
                    <input
                      name="assignedClerkEmail"
                      type="email"
                      required
                      maxLength="255"
                      placeholder="clerk@example.com"
                      value={form.assignedClerkEmail}
                      onChange={updateField('assignedClerkEmail')}
                    />
                  </label>
                  <label>
                    Clerk role note <span className="label-note">(Optional)</span>
                    <input
                      name="assignedClerkNotes"
                      maxLength="255"
                      placeholder="e.g., Handles schedules & payment checks"
                      value={form.assignedClerkNotes}
                      onChange={updateField('assignedClerkNotes')}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {form.role === 'clerk' && (
          <div className="auth-form-section">
            <p className="auth-section-title">Clerk account setup</p>
            <p className="field-note" style={{ margin: 0 }}>
              Once your Clerk account is created, share your email address with a Gardener (so they can link you during sign-up or under <strong>Gardener Dashboard → My Clerks</strong>) or with an Administrator. Until assigned, you will have read/write access to zero gardener accounts.
            </p>
          </div>
        )}

        <div className="auth-form-section">
          <p className="auth-section-title">Account credentials</p>
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={updateField('email')}
            />
          </label>
          <div className="form-row">
            <label>
              Password <span className="label-note">(8–72 characters)</span>
              <div className="password-input-wrap">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength="8"
                  maxLength="72"
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  value={form.password}
                  onChange={updateField('password')}
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
            <label>
              Confirm password
              <div className="password-input-wrap">
                <input
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength="8"
                  maxLength="72"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={form.confirmPassword}
                  onChange={updateField('confirmPassword')}
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {passwordsMismatch && <span className="field-error-note">Passwords do not match.</span>}
            </label>
          </div>
        </div>

        <button className="button" type="submit" disabled={submitting || isUnderage || passwordsMismatch}>
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
