import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Leaf } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  MIN_REGISTRATION_AGE,
  calculateAgeFromDob,
  getMaxBirthDateForAge,
} from '../services/profiles'
import StructuredAddressFields from '../components/StructuredAddressFields'
import {
  DEFAULT_ADDRESS_PARTS,
  composeStructuredAddress,
  formatAddressPreview,
  validateStructuredAddress,
} from '../utils/zamboangaAddress'
import { validatePhilippineMobileNumber } from '../utils/philippineMobileNumber'
import { LoginBotanicalScene, RegisterBotanicalScene } from '../components/BotanicalIllustrations'

function AuthLayout({ title, children, footer, wide = false, mode = 'login' }) {
  const isRegister = mode === 'register'
  return (
    <main className="auth-page editorial-auth-page">
      <div className={wide ? 'auth-layout auth-layout-register' : 'auth-layout'}>
        <aside className="auth-visual">
          <Link className="brand auth-visual-brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link>
          <div className="auth-visual-scene-card">
            {isRegister ? <RegisterBotanicalScene /> : <LoginBotanicalScene />}
          </div>
          <div className="auth-visual-copy">
            <p className="editorial-kicker editorial-kicker-light">
              {isRegister ? 'Plant your first seed' : 'Welcome back to your garden'}
            </p>
            <h2>
              {isRegister ? <>Start growing<br /><em>with HugaTiera.</em></> : <>Step back into<br /><em>something green.</em></>}
            </h2>
            <p>
              {isRegister
                ? 'Create your free account in 3 quick steps to connect with local Zamboanga City gardeners or offer your services.'
                : 'Sign in to check your garden inquiries, compare offers, and manage upcoming bookings.'}
            </p>
          </div>
          <span className="auth-visual-caption">Local gardens · thoughtful conversations</span>
        </aside>
        <div className={wide ? 'auth-panel auth-panel-register' : 'auth-panel'}>
          <Link className="auth-mobile-brand brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link>
          <Link className="back-link" to="/" style={{ marginBottom: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={14} /> Back to home
          </Link>
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

  return <AuthLayout mode="login" title="Welcome back." footer={<>New to HugaTiera? <Link to="/register">Create an account</Link></>}>
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

const REGISTER_STEPS = [
  { id: 1, label: 'About you' },
  { id: 2, label: 'Details' },
  { id: 3, label: 'Account' },
]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const roleParam = params.get('role')
  const initialRole = (roleParam === 'gardener' || roleParam === 'both') ? 'gardener' : 'client'

  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    role: initialRole,
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '',
    phone: '',
    addressParts: { ...DEFAULT_ADDRESS_PARTS },
    businessName: '',
    serviceArea: 'Zamboanga City',
    yearsOfExperience: '',
    description: '',
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

  const fullNameDisplay = [form.firstName, form.middleName, form.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')

  const roleSummaryLabel = form.role === 'gardener'
    ? 'Offer services (Gardener + Client mode)'
    : 'Find a gardener (Client)'

  const clientAddressSummary = formatAddressPreview(form.addressParts)

  function updateField(field) {
    return (event) => {
      setError('')
      setForm((current) => ({ ...current, [field]: event.target.value }))
    }
  }

  function updateAddressParts(nextParts) {
    setError('')
    setForm((current) => ({ ...current, addressParts: nextParts }))
  }

  function selectRole(nextRole) {
    setError('')
    setForm((current) => ({ ...current, role: nextRole }))
    if (params.get('role')) {
      setParams({}, { replace: true })
    }
  }

  function validateStepOne() {
    if (!form.firstName.trim()) return 'Please enter your first name.'
    if (!form.lastName.trim()) return 'Please enter your last name.'
    if (computedAge === null) return 'Please enter a valid birthday.'
    if (computedAge < MIN_REGISTRATION_AGE) {
      return `You must be at least ${MIN_REGISTRATION_AGE} years old to create an account.`
    }
    return ''
  }

  function validateStepTwo() {
    const phoneError = validatePhilippineMobileNumber(form.phone, { required: true })
    if (phoneError) return phoneError
    if (form.role === 'client') {
      const addrError = validateStructuredAddress(form.addressParts, { requireFields: true })
      if (addrError) return addrError
    }
    if (form.role === 'gardener' && !form.serviceArea.trim()) {
      return 'Please enter your service area.'
    }
    return ''
  }

  function validateStepThree() {
    if (!EMAIL_PATTERN.test(form.email.trim())) {
      return 'Please enter a valid email address.'
    }
    if (form.password.length < 8 || form.password.length > 72) {
      return 'Password must be between 8 and 72 characters.'
    }
    if (form.password !== form.confirmPassword) {
      return 'Passwords do not match. Please re-enter your password.'
    }
    return ''
  }

  function handleNextStep() {
    const stepError = step === 1 ? validateStepOne() : validateStepTwo()
    if (stepError) {
      setError(stepError)
      return
    }
    setError('')
    setStep((current) => Math.min(3, current + 1))
  }

  function handleBackStep() {
    setError('')
    setStep((current) => Math.max(1, current - 1))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (step < 3) {
      handleNextStep()
      return
    }

    const validationError = validateStepOne() || validateStepTwo() || validateStepThree()
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    const includeClientFields = form.role === 'client'
    const includeGardenerFields = form.role === 'gardener'

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
          address: composeStructuredAddress(form.addressParts),
          city: (form.addressParts.city || 'Zamboanga City').trim(),
        }
        : {}),
      ...(includeGardenerFields
        ? {
          businessName: form.businessName,
          serviceArea: form.serviceArea,
          yearsOfExperience: form.yearsOfExperience === '' ? null : Number(form.yearsOfExperience),
          description: form.description,
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
      mode="register"
      title="Create your account."
      footer={<>Already have an account? <Link to="/login">Sign in</Link></>}
    >
      <form className="auth-form auth-form-register" onSubmit={handleSubmit}>
        <nav className="register-stepper" aria-label="Registration steps">
          {REGISTER_STEPS.map((item) => {
            const isActive = step === item.id
            const isDone = step > item.id
            return (
              <button
                key={item.id}
                type="button"
                className={`register-step-pill${isActive ? ' is-active' : ''}${isDone ? ' is-done is-clickable' : ''}`}
                disabled={!isDone}
                aria-current={isActive ? 'step' : undefined}
                onClick={() => {
                  if (isDone) {
                    setError('')
                    setStep(item.id)
                  }
                }}
              >
                <span className="register-step-num" aria-hidden="true">
                  {isDone ? <Check size={12} strokeWidth={3} /> : item.id}
                </span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {error && <div className="form-error" role="alert">{error}</div>}

        {step === 1 && (
          <>
            <fieldset>
              <legend>I want to...</legend>
              <div className="role-options role-options-2">
                <label className={form.role === 'client' ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="role"
                    value="client"
                    checked={form.role === 'client'}
                    onChange={() => selectRole('client')}
                  />
                  <span className="role-option-copy">
                    <strong>Find a gardener</strong>
                    <small>Hire &amp; book gardening services</small>
                  </span>
                </label>
                <label className={form.role === 'gardener' ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="role"
                    value="gardener"
                    checked={form.role === 'gardener'}
                    onChange={() => selectRole('gardener')}
                  />
                  <span className="role-option-copy">
                    <strong>Offer services</strong>
                    <small>Gardener (includes Client mode &amp; staff clerks)</small>
                  </span>
                </label>
              </div>
              {form.role === 'gardener' && (
                <p className="field-note" style={{ marginTop: '6px' }}>
                  Gardener accounts include Client mode (switch anytime in your sidebar) and let you add Clerk staff under Dashboard → My Clerks.
                </p>
              )}
            </fieldset>

            <div className="auth-form-section">
              <p className="auth-section-title">Step 1 of 3 · Personal information</p>
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
            </div>

            <div className="register-step-actions">
              <button className="button" type="submit" disabled={isUnderage}>
                <span>Continue to details</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="auth-form-section">
              <p className="auth-section-title">Step 2 of 3 · Contact &amp; {form.role === 'gardener' ? 'gardener' : 'location'} details</p>
              <label>
                Mobile number
                <input
                  name="phone"
                  type="tel"
                  required
                  maxLength="30"
                  autoComplete="tel"
                  placeholder="0917 123 4567 or +63 917 123 4567"
                  value={form.phone}
                  onChange={updateField('phone')}
                />
              </label>

              {form.role === 'client' && (
                <StructuredAddressFields
                  value={form.addressParts}
                  onChange={updateAddressParts}
                  required
                />
              )}

              {form.role === 'gardener' && (
                <>
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
                      placeholder="e.g., Tetuan, Zamboanga City"
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
                </>
              )}
            </div>

            <div className="register-step-actions">
              <button type="button" className="register-back-btn" onClick={handleBackStep}>
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <button className="button" type="submit">
                <span>Continue to account</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="register-summary-strip">
              <div>
                <strong>{fullNameDisplay || 'New account'}</strong>
                <small>
                  {roleSummaryLabel}
                  {form.role === 'client' && clientAddressSummary ? ` · ${clientAddressSummary}` : ''}
                  {form.role === 'gardener' && form.serviceArea ? ` · ${form.serviceArea}` : ''}
                </small>
              </div>
              <button
                type="button"
                className="register-inline-link"
                onClick={() => {
                  setError('')
                  setStep(1)
                }}
              >
                Edit info
              </button>
            </div>

            <div className="auth-form-section">
              <p className="auth-section-title">Step 3 of 3 · Account credentials</p>
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

            <div className="register-step-actions">
              <button type="button" className="register-back-btn" onClick={handleBackStep} disabled={submitting}>
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <button className="button" type="submit" disabled={submitting || isUnderage || passwordsMismatch}>
                {submitting ? 'Creating account...' : 'Create account'}
              </button>
            </div>
          </>
        )}
      </form>
    </AuthLayout>
  )
}
