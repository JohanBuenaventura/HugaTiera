import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowRight,
  Award,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ImagePlus,
  Leaf,
  MapPin,
  Pencil,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  MIN_REGISTRATION_AGE,
  WEEKDAY_OPTIONS,
  buildProfileForm,
  calculateAgeFromDob,
  formatUserFullName,
  formatWorkingDaysLabel,
  getMaxBirthDateForAge,
  initialProfile,
  parseWorkingDaysArray,
  profileApi,
  resolveDashboardTab,
} from '../services/profiles'
import { servicesApi } from '../services/services'
import { formatEstimateRange, inquiriesApi } from '../services/inquiries'
import {
  bookingsApi,
  formatStatusLabel,
  getStatusBadgeClass,
} from '../services/bookings'
import { reviewsApi } from '../services/reviews'
import { fetchSmartRecommendations, requestRecommendationSummary } from '../services/ai'
import { getRequestImageUrl } from '../services/requestImages'
import AppSidebar from '../components/AppSidebar'
import ClerkDashboard from '../components/ClerkDashboard'
import GardenerClerksPanel from '../components/GardenerClerksPanel'
import GardenerScheduleCalendar from '../components/GardenerScheduleCalendar'
import StructuredAddressFields from '../components/StructuredAddressFields'
import {
  composeStructuredAddress,
  parseStructuredAddress,
  validateStructuredAddress,
} from '../utils/zamboangaAddress'

function ProfileForm({ role, profile, userId, onSaved }) {
  const [form, setForm] = useState(profile)
  const [addressParts, setAddressParts] = useState(() => parseStructuredAddress(profile.address, profile.city))
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [unavailableDates, setUnavailableDates] = useState(() => (Array.isArray(profile.unavailableDates) ? profile.unavailableDates : []))
  const [blockForm, setBlockForm] = useState({ startDate: '', endDate: '', reason: '' })
  const [blockBusy, setBlockBusy] = useState(false)

  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  function toggleWorkingDay(code) {
    const current = parseWorkingDaysArray(form.workingDays)
    const exists = current.includes(code)
    if (exists && current.length <= 1) {
      setError('Select at least one working day.')
      return
    }
    setError('')
    const next = exists ? current.filter((d) => d !== code) : [...current, code]
    setForm({ ...form, workingDays: next })
  }

  async function handleAddUnavailableDate() {
    if (!blockForm.startDate) {
      setError('Please pick a start date to mark unavailable.')
      return
    }
    setBlockBusy(true); setMessage(''); setError('')
    try {
      const res = await profileApi.addUnavailableDate({
        startDate: blockForm.startDate,
        endDate: blockForm.endDate || blockForm.startDate,
        reason: blockForm.reason,
      })
      if (res?.unavailableDate) {
        setUnavailableDates((prev) => [...prev, res.unavailableDate].sort((a, b) => a.start_date.localeCompare(b.start_date)))
      }
      setBlockForm({ startDate: '', endDate: '', reason: '' })
      setMessage('Unavailable date added to your schedule.')
    } catch (blockErr) {
      setError(blockErr.message)
    } finally {
      setBlockBusy(false)
    }
  }

  async function handleRemoveUnavailableDate(blockId) {
    setBlockBusy(true); setMessage(''); setError('')
    try {
      await profileApi.deleteUnavailableDate(blockId)
      setUnavailableDates((prev) => prev.filter((item) => item.id !== blockId))
      setMessage('Unavailable date removed.')
    } catch (blockErr) {
      setError(blockErr.message)
    } finally {
      setBlockBusy(false)
    }
  }
  function handleAddressPartsChange(nextParts) {
    setError('')
    setAddressParts(nextParts)
    setForm((current) => ({
      ...current,
      address: composeStructuredAddress(nextParts),
      city: (nextParts.city || '').trim(),
    }))
  }

  async function submit(event) {
    event.preventDefault()
    setMessage(''); setError('')

    let payload = form
    if (role === 'client') {
      const hasAnyAddressInput = Boolean(
        addressParts.street?.trim()
        || addressParts.barangay?.trim()
        || addressParts.customBarangay?.trim()
        || addressParts.landmark?.trim(),
      )
      const addrError = validateStructuredAddress(addressParts, { requireFields: hasAnyAddressInput })
      if (addrError) {
        setError(addrError)
        return
      }
      payload = {
        ...form,
        address: hasAnyAddressInput ? composeStructuredAddress(addressParts) : '',
        city: (addressParts.city || 'Zamboanga City').trim(),
      }
    }

    setSaving(true)
    try {
      const result = await profileApi.update(payload)
      onSaved(result)
      setMessage('Profile saved successfully.')
    } catch (saveError) { setError(saveError.message) } finally { setSaving(false) }
  }

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarBusy(true); setMessage(''); setError('')
    try {
      const result = await profileApi.uploadAvatar(file)
      const nextForm = { ...form, avatarPath: result.avatarPath }
      setForm(nextForm)
      setAvatarVersion((v) => v + 1)
      onSaved({ user: { ...nextForm, avatarPath: result.avatarPath } })
      setMessage('Profile picture updated.')
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setAvatarBusy(false)
    }
  }

  async function handleRemoveAvatar() {
    setAvatarBusy(true); setMessage(''); setError('')
    try {
      await profileApi.deleteAvatar()
      const nextForm = { ...form, avatarPath: null }
      setForm(nextForm)
      setAvatarVersion((v) => v + 1)
      onSaved({ user: { ...nextForm, avatarPath: null } })
      setMessage('Profile picture removed.')
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setAvatarBusy(false)
    }
  }

  const initials = `${(form.firstName || 'U')[0] || ''}${(form.lastName || '')[0] || ''}`.toUpperCase()
  const maxBirthDate = getMaxBirthDateForAge(MIN_REGISTRATION_AGE)
  const computedAge = calculateAgeFromDob(form.dateOfBirth)
  const isUnderage = computedAge !== null && computedAge < MIN_REGISTRATION_AGE

  return <form className="profile-form" onSubmit={submit}>
    {message && <div className="form-success" role="status">{message}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="avatar-upload-row">
      <div className="avatar-preview">
        {form.avatarPath ? (
          <img src={`${profileApi.avatarUrl(userId)}?v=${avatarVersion}`} alt="Profile" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className="avatar-upload-controls">
        <strong>Profile picture</strong>
        <span className="field-note">JPEG, PNG, or WebP up to 5 MB</span>
        <div className="inline-actions">
          <label className="button button-outline avatar-file-label">
            <ImagePlus size={15} />
            {avatarBusy ? 'Uploading...' : (form.avatarPath ? 'Change photo' : 'Upload photo')}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={avatarBusy} onChange={handleAvatarChange} />
          </label>
          {form.avatarPath && (
            <button className="table-action" type="button" disabled={avatarBusy} onClick={handleRemoveAvatar}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
    <div className="form-row form-row-3">
      <label>First name<input required maxLength="100" value={form.firstName} onChange={change('firstName')} /></label>
      <label>Middle name <span className="label-note">(Optional)</span><input maxLength="100" placeholder="Optional" value={form.middleName || ''} onChange={change('middleName')} /></label>
      <label>Last name<input required maxLength="100" value={form.lastName} onChange={change('lastName')} /></label>
    </div>
    <div className="form-row">
      <label>
        Birthday <span className="label-note">(18+ required)</span>
        <input type="date" max={maxBirthDate} value={form.dateOfBirth || ''} onChange={change('dateOfBirth')} />
      </label>
      <label>
        Age <span className="label-note">(Auto-calculated)</span>
        <div className={`age-readonly-box${isUnderage ? ' is-invalid' : computedAge !== null ? ' is-valid' : ''}`}>
          {computedAge === null ? (
            <span className="age-placeholder">Not set</span>
          ) : isUnderage ? (
            <span>{computedAge} yrs old — Must be 18 or older</span>
          ) : (
            <span>{computedAge} years old</span>
          )}
        </div>
      </label>
    </div>
    <div className="form-row"><label>Mobile number<input type="tel" maxLength="30" placeholder="0917 123 4567" value={form.phone || ''} onChange={change('phone')} /></label><label>Email<input value={form.email || ''} disabled /><span className="field-note">Email cannot be changed here</span></label></div>
    {role === 'client' ? (
      <>
        <div className="auth-form-section">
          <p className="auth-section-title">Address details</p>
          <StructuredAddressFields
            value={addressParts}
            onChange={handleAddressPartsChange}
            required={false}
          />
        </div>
        <label>About you<textarea value={form.bio || ''} onChange={change('bio')} rows="4" /></label>
      </>
    ) : (
      <>
        <div className="form-row"><label>Business or display name<input value={form.businessName || ''} onChange={change('businessName')} /></label><label>Years of experience<input type="number" min="0" max="100" value={form.yearsOfExperience ?? ''} onChange={change('yearsOfExperience')} /></label></div>
        <label>Service area<input required value={form.serviceArea || ''} onChange={change('serviceArea')} /></label>
        <label>Professional description<textarea value={form.description || ''} onChange={change('description')} rows="4" /></label>

        <div className="schedule-settings-box">
          <p className="auth-section-title">Working days, hours &amp; simultaneous job capacity</p>
          <div className="weekday-toggle-grid" role="group" aria-label="Working days">
            {WEEKDAY_OPTIONS.map((day) => {
              const checked = parseWorkingDaysArray(form.workingDays).includes(day.code)
              return (
                <label className={`weekday-pill${checked ? ' is-selected' : ''}`} key={day.code}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleWorkingDay(day.code)}
                  />
                  <span>{day.short}</span>
                </label>
              )
            })}
          </div>
          <div className="form-row">
            <label>
              Work starts
              <input type="time" required value={form.workStartTime || '08:00'} onChange={change('workStartTime')} />
            </label>
            <label>
              Work ends
              <input type="time" required value={form.workEndTime || '17:00'} onChange={change('workEndTime')} />
            </label>
          </div>
          <div className="form-row">
            <label>
              Total workers / crew available per day
              <input
                type="number"
                min="1"
                max="50"
                required
                value={form.crewSize ?? form.maxConcurrentJobs ?? 1}
                onChange={(e) => setForm({ ...form, crewSize: Number(e.target.value) })}
              />
              <span className="field-note">When all workers are assigned on a day, it is marked Fully Booked.</span>
            </label>
            <label>
              Simultaneous jobs allowed
              <select
                value={String(form.maxConcurrentJobs || 1)}
                onChange={(e) => {
                  const nextMax = Number(e.target.value)
                  setForm({ ...form, maxConcurrentJobs: nextMax, crewSize: Math.max(Number(form.crewSize || 1), nextMax) })
                }}
              >
                <option value="1">1 — Solo (no overlapping jobs)</option>
                <option value="2">2 — Can work 2 jobs simultaneously</option>
                <option value="3">3 — Can work 3 jobs simultaneously</option>
                <option value="4">4 — Can work 4 jobs simultaneously</option>
                <option value="5">5 — Crew / up to 5 simultaneous jobs</option>
              </select>
            </label>
          </div>
          <label>
            Availability &amp; simultaneous-work note <span className="label-note">(Optional — shown to clients)</span>
            <input
              maxLength="255"
              placeholder="e.g., 2-person crew can handle 2 simultaneous maintenance jobs; closed on holidays"
              value={form.availabilityNotes || ''}
              onChange={change('availabilityNotes')}
            />
          </label>

          <div className="unavailable-dates-section">
            <strong>Unavailable / blocked dates</strong>
            <span className="field-note">Block specific dates when you cannot accept jobs. Clients will be prevented from booking these dates.</span>
            <div className="form-row form-row-3">
              <label>
                Start date
                <input
                  type="date"
                  value={blockForm.startDate}
                  onChange={(e) => setBlockForm({ ...blockForm, startDate: e.target.value })}
                />
              </label>
              <label>
                End date <span className="label-note">(Optional)</span>
                <input
                  type="date"
                  min={blockForm.startDate || undefined}
                  value={blockForm.endDate}
                  onChange={(e) => setBlockForm({ ...blockForm, endDate: e.target.value })}
                />
              </label>
              <label>
                Reason <span className="label-note">(Optional)</span>
                <input
                  maxLength="255"
                  placeholder="e.g., Holiday, off-platform project"
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                />
              </label>
            </div>
            <div>
              <button className="button button-outline" type="button" disabled={blockBusy || !blockForm.startDate} onClick={handleAddUnavailableDate}>
                {blockBusy ? 'Saving...' : 'Add unavailable date'}
              </button>
            </div>
            {unavailableDates.length > 0 && (
              <ul className="unavailable-list">
                {unavailableDates.map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{item.start_date === item.end_date ? item.start_date : `${item.start_date} to ${item.end_date}`}</strong>
                      {item.reason ? ` — ${item.reason}` : ''}
                    </span>
                    <button className="table-action" type="button" disabled={blockBusy} onClick={() => handleRemoveUnavailableDate(item.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </>
    )}
    <button className="button" type="submit" disabled={saving || isUnderage}><Save size={16} />{saving ? 'Saving...' : 'Save profile'}</button>
  </form>
}

function Stats({ role, counts }) {
  const values = role === 'client'
    ? [['Inquiries', counts.inquiries], ['Bookings', counts.bookings], ['Notifications', counts.notifications]]
    : [['Services', counts.services], ['Inquiries', counts.inquiries], ['Bookings', counts.bookings]]
  return <div className="stat-grid">{values.map(([label, value], index) => <div className={`stat-card${index === 0 ? ' stat-card-primary' : ''}`} key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}</div>
}

function GardenerTools({ isApproved, section = 'services' }) {
  const emptyService = { title: '', description: '', categoryId: '', indicativePrice: '', priceUnit: '', serviceArea: 'Zamboanga City', workersRequired: 1 }
  const [serviceForm, setServiceForm] = useState(emptyService)
  const [serviceImageFile, setServiceImageFile] = useState(null)
  const [serviceImageVersion, setServiceImageVersion] = useState(0)
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [portfolios, setPortfolios] = useState([])
  const [editId, setEditId] = useState(null)
  const [portfolioEditId, setPortfolioEditId] = useState(null)
  const [imageForm, setImageForm] = useState({ title: '', description: '', image: null })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([servicesApi.categories(), servicesApi.mine(), servicesApi.portfolios()])
      .then(([categoryResult, serviceResult, portfolioResult]) => {
        setCategories(categoryResult.categories)
        setServices(serviceResult.services)
        setPortfolios(portfolioResult.portfolios)
      })
      .catch((loadError) => setError(loadError.message))
  }, [])

  const serviceChange = (field) => (event) => setServiceForm({ ...serviceForm, [field]: event.target.value })
  async function saveService(event) {
    event.preventDefault(); setMessage(''); setError('')
    try {
      let targetServiceId = editId
      if (editId) {
        await servicesApi.update(editId, serviceForm)
      } else {
        const created = await servicesApi.create(serviceForm)
        targetServiceId = created.id
      }
      if (serviceImageFile && targetServiceId) {
        await servicesApi.uploadServiceImage(targetServiceId, serviceImageFile)
        setServiceImageVersion((v) => v + 1)
      }
      setServices((await servicesApi.mine()).services)
      setServiceForm(emptyService); setServiceImageFile(null); setEditId(null)
      event.target.reset()
      setMessage('Service listing saved.')
    } catch (saveError) { setError(saveError.message) }
  }
  async function removeServiceImage(id) {
    setMessage(''); setError('')
    try {
      await servicesApi.deleteServiceImage(id)
      setServices((await servicesApi.mine()).services)
      setServiceImageVersion((v) => v + 1)
      setMessage('Service photo removed.')
    } catch (removeError) { setError(removeError.message) }
  }
  async function removeService(id) {
    try { await servicesApi.remove(id); setServices((current) => current.map((service) => service.id === id ? { ...service, is_active: 0 } : service)); setMessage('Service listing deactivated.') } catch (removeError) { setError(removeError.message) }
  }
  async function savePortfolio(event) {
    event.preventDefault(); setMessage(''); setError('')
    try {
      if (portfolioEditId) {
        await servicesApi.updatePortfolio(portfolioEditId, { title: imageForm.title, description: imageForm.description })
        setPortfolios((await servicesApi.portfolios()).portfolios)
        setPortfolioEditId(null)
        setImageForm({ title: '', description: '', image: null })
        setMessage('Portfolio entry updated.')
      } else {
        const data = new FormData()
        data.append('title', imageForm.title); data.append('description', imageForm.description); data.append('image', imageForm.image)
        await servicesApi.addPortfolio(data)
        setPortfolios((await servicesApi.portfolios()).portfolios)
        setImageForm({ title: '', description: '', image: null })
        event.target.reset()
        setMessage('Portfolio image uploaded.')
      }
    } catch (uploadError) { setError(uploadError.message) }
  }
  async function removePortfolio(id) {
    try { await servicesApi.removePortfolio(id); setPortfolios((current) => current.filter((portfolio) => portfolio.id !== id)); setMessage('Portfolio entry removed.') } catch (removeError) { setError(removeError.message) }
  }

  if (section === 'portfolio') {
    return (
      <section className="profile-settings-panel">
        <div className="dashboard-panel">
          <div className="activity-heading">
            <div>
              <p className="eyebrow">Portfolio</p>
              <h2>{portfolioEditId ? 'Edit portfolio details.' : 'Show your previous work.'}</h2>
            </div>
            <Link className="text-link" to="/dashboard">Back to overview</Link>
          </div>
          {message && <div className="form-success" role="status">{message}</div>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <form className="profile-form" onSubmit={savePortfolio}>
            <label>Title<input required placeholder="e.g. Tropical patio makeover" value={imageForm.title} onChange={(event) => setImageForm({ ...imageForm, title: event.target.value })} /></label>
            <label>Description<textarea rows="2" placeholder="Describe what you built or maintained" value={imageForm.description} onChange={(event) => setImageForm({ ...imageForm, description: event.target.value })} /></label>
            {!portfolioEditId && <label>Image<input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageForm({ ...imageForm, image: event.target.files[0] })} /><span className="field-note">JPEG, PNG, or WebP up to 5 MB</span></label>}
            <div className="inline-actions">
              <button className="button" type="submit">{portfolioEditId ? <><Save size={16} />Update portfolio</> : <><ImagePlus size={16} />Upload portfolio image</>}</button>
              {portfolioEditId && <button className="table-action" type="button" onClick={() => { setPortfolioEditId(null); setImageForm({ title: '', description: '', image: null }) }}>Cancel edit</button>}
            </div>
          </form>
          <div className="portfolio-list">
            {portfolios.length === 0 && <p className="form-note">No portfolio photos uploaded yet.</p>}
            {portfolios.map((portfolio) => (
              <div className="portfolio-item" key={portfolio.id}>
                <img src={servicesApi.imageUrl(portfolio.id)} alt={portfolio.title} />
                <div><strong>{portfolio.title}</strong><span>{portfolio.description || 'No description'}</span></div>
                <div className="item-actions" style={{ marginLeft: 'auto' }}>
                  <button type="button" aria-label={`Edit ${portfolio.title}`} onClick={() => { setPortfolioEditId(portfolio.id); setImageForm({ title: portfolio.title, description: portfolio.description || '', image: null }) }}><Pencil size={15} /></button>
                  <button type="button" aria-label={`Remove ${portfolio.title}`} onClick={() => removePortfolio(portfolio.id)}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="profile-settings-panel">
      <div className="dashboard-panel">
        <div className="activity-heading">
          <div>
            <p className="eyebrow">Service listings</p>
            <h2>{editId ? 'Edit a service.' : 'Manage your services.'}</h2>
          </div>
          <Link className="text-link" to="/dashboard">Back to overview</Link>
        </div>
        <p className="field-note" style={{ marginBottom: '16px' }}>
          {isApproved ? 'Your active services are visible in the public marketplace.' : 'Your services are saved, but they will remain hidden until an administrator approves your gardener profile.'}
        </p>
        {message && <div className="form-success" role="status">{message}</div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <form className="profile-form" onSubmit={saveService}>
          <div className="form-row">
            <label>Title<input required placeholder="e.g. Weekly lawn & hedge care" value={serviceForm.title} onChange={serviceChange('title')} /></label>
            <label>Category<select required value={serviceForm.categoryId} onChange={serviceChange('categoryId')}><option value="">Choose a category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          </div>
          <label>Description<textarea required rows="3" placeholder="Outline what is included in this service" value={serviceForm.description} onChange={serviceChange('description')} /></label>
          <div className="form-row">
            <label>Indicative price<input type="number" min="0" step="0.01" placeholder="Optional" value={serviceForm.indicativePrice} onChange={serviceChange('indicativePrice')} /><span className="field-note">Optional</span></label>
            <label>Price unit<input placeholder="per visit, per sqm..." value={serviceForm.priceUnit} onChange={serviceChange('priceUnit')} /></label>
          </div>
          <div className="form-row">
            <label>Service area<input required value={serviceForm.serviceArea} onChange={serviceChange('serviceArea')} /></label>
            <label>
              Workers needed for this service
              <input type="number" required min="1" max="20" value={serviceForm.workersRequired ?? 1} onChange={serviceChange('workersRequired')} />
              <span className="field-note">Counts toward your daily crew limit (e.g., 1 for lawn care, 3 for landscaping).</span>
            </label>
          </div>
          <label>
            Cover / business design photo
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setServiceImageFile(event.target.files?.[0] || null)} />
            <span className="field-note">Optional. JPEG, PNG, or WebP up to 5 MB shown on marketplace cards.</span>
          </label>
          <div className="inline-actions">
            <button className="button" type="submit"><Save size={16} />{editId ? 'Update service' : 'Publish service'}</button>
            {editId && <button className="table-action" type="button" onClick={() => { setEditId(null); setServiceForm(emptyService); setServiceImageFile(null) }}>Cancel edit</button>}
          </div>
        </form>
        <div className="managed-list">
          {services.length === 0 && <p className="form-note">No service listings created yet.</p>}
          {services.map((service) => (
            <div className={`managed-item ${service.is_active ? '' : 'is-inactive'}`} key={service.id}>
              <div className="managed-item-main">
                {service.image_path && (
                  <img
                    className="managed-service-thumb"
                    src={`${servicesApi.serviceImageUrl(service.id)}?v=${serviceImageVersion}`}
                    alt={service.title}
                  />
                )}
                <div>
                  <strong>{service.title}</strong>
                  <span>{service.category_name} · {service.workers_required || 1} worker{(service.workers_required || 1) === 1 ? '' : 's'} · {service.is_active ? 'Active' : 'Inactive'}{service.is_active && !isApproved ? ' · Pending approval' : ''}</span>
                </div>
              </div>
              {service.is_active && (
                <div className="item-actions">
                  {service.image_path && (
                    <button type="button" className="table-action" onClick={() => removeServiceImage(service.id)}>Remove photo</button>
                  )}
                  <button type="button" aria-label={`Edit ${service.title}`} onClick={() => { setEditId(service.id); setServiceImageFile(null); setServiceForm({ title: service.title, description: service.description, categoryId: service.category_id, indicativePrice: service.indicative_price || '', priceUnit: service.price_unit || '', serviceArea: service.service_area, workersRequired: service.workers_required || 1 }) }}><Pencil size={15} /></button>
                  <button type="button" aria-label={`Deactivate ${service.title}`} onClick={() => removeService(service.id)}><Trash2 size={15} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function formatInquirySubtitle(inquiry, role) {
  const parts = [
    inquiry.request_type === 'general'
      ? (role === 'gardener' ? 'Open request' : 'General request')
      : 'Direct inquiry',
    inquiry.service_title || inquiry.category_name || 'Service inquiry',
  ]
  if (role === 'client') {
    if (Number(inquiry.offer_count) > 0) {
      parts.push(`${inquiry.offer_count} offer${Number(inquiry.offer_count) === 1 ? '' : 's'}`)
    }
    if (inquiry.status === 'in_agreement') {
      parts.push('Agreement in progress')
    } else if (inquiry.status === 'provider_selected') {
      parts.push('Provider selected')
    }
  } else if (inquiry.my_quotation_id) {
    const offerStatus = formatStatusLabel(inquiry.my_quotation_status || 'sent')
    const amountLabel = inquiry.my_quotation_amount != null
      ? ` (PHP ${Number(inquiry.my_quotation_amount).toLocaleString()})`
      : ''
    parts.push(`Offer ${offerStatus}${amountLabel}`)
  }
  return parts.join(' · ')
}

function ClientDiscoveryShowcase({ defaultLocation = 'Zamboanga City' }) {
  const [services, setServices] = useState([])
  const [categories, setCategories] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [referenceLocation, setReferenceLocation] = useState(defaultLocation || 'Zamboanga City')
  const [locationInput, setLocationInput] = useState(defaultLocation || '')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [sortBy, setSortBy] = useState('smart_ai')
  const [nearbyOnly, setNearbyOnly] = useState(false)
  const [minRating, setMinRating] = useState(0)
  const [goodConductOnly, setGoodConductOnly] = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [aiSummarySource, setAiSummarySource] = useState('')
  const [loadingSummary, setLoadingSummary] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([reviewsApi.recent(4), servicesApi.categories()])
      .then(([revRes, catRes]) => {
        if (!active) return
        setReviews(revRes?.reviews || [])
        setCategories(catRes?.categories || [])
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      if (!active) return
      setLoading(true)
      fetchSmartRecommendations({
        mode: 'services',
        location: locationInput.trim() || defaultLocation || 'Zamboanga City',
        categoryId: selectedCategoryId || undefined,
        sortBy,
        nearbyOnly,
        minRating: minRating || undefined,
        goodConductOnly,
        limit: 6,
      })
        .then((res) => {
          if (!active) return
          setServices(res?.recommendations || [])
          if (res?.referenceLocation) setReferenceLocation(res.referenceLocation)
        })
        .catch(() => {
          if (!active) return
          servicesApi.list({ categoryId: selectedCategoryId || undefined, limit: 6 }).then((fallback) => {
            if (active) setServices(fallback?.services || [])
          }).catch(() => {})
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 180)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [defaultLocation, locationInput, selectedCategoryId, sortBy, nearbyOnly, minRating, goodConductOnly])

  async function handleExplainTopPicks() {
    if (services.length === 0) return
    setLoadingSummary(true)
    try {
      const res = await requestRecommendationSummary({
        mode: 'services',
        referenceLocation,
        items: services.slice(0, 3).map((s) => ({
          title: s.title,
          gardenerName: s.business_name || `${s.first_name || ''} ${s.last_name || ''}`.trim(),
          matchScore: s.ai_match?.matchScore,
          price: s.indicative_price,
          reasons: s.ai_match?.reasons || [],
        })),
      })
      setAiSummary(res?.summary || '')
      setAiSummarySource(res?.source || 'smart_ranking')
    } catch {
      setAiSummary('')
    } finally {
      setLoadingSummary(false)
    }
  }

  return (
    <section className="dashboard-showcase-stack" aria-label="AI recommended gardening services and verified reviews">
      <div className="dashboard-panel showcase-panel">
        <div className="showcase-header">
          <div>
            <p className="eyebrow" style={{ marginBottom: '6px' }}>AI smart recommendations · nearby &amp; high conduct</p>
            <h2 style={{ marginBottom: '4px' }}>Recommended gardening services near you</h2>
            <p className="field-note" style={{ margin: 0 }}>
              Ranked by Zamboanga City barangay proximity ({referenceLocation}), verified review scores, and clean service conduct. Advisory only—you always choose who to inquire or book.
            </p>
          </div>
          <div className="inline-actions">
            {services.length > 0 && (
              <button
                type="button"
                className="table-action"
                disabled={loadingSummary}
                onClick={handleExplainTopPicks}
              >
                <Sparkles size={14} /> {loadingSummary ? 'Summarizing...' : 'AI Explain Top Picks'}
              </button>
            )}
            <Link className="button button-outline" to="/services">
              View all services <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        <div className="ai-filter-bar" role="region" aria-label="AI service filters">
          <div className="ai-filter-inputs">
            <label>
              Your barangay / area
              <input
                maxLength="120"
                placeholder="e.g., Tetuan, Sta. Maria, Pasonanca"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
              />
            </label>
            <label>
              What do you need? <span className="label-note">(Category)</span>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
              >
                <option value="">All gardening categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="ai-filter-controls">
            <div className="ai-filter-pills" role="group" aria-label="Sort recommendations">
              {[
                { key: 'smart_ai', label: 'AI Smart Match' },
                { key: 'nearby', label: 'Nearest First' },
                { key: 'top_rated', label: 'Highest Rated' },
                { key: 'best_conduct', label: 'Best Service Conduct' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`booking-filter-pill${sortBy === opt.key ? ' is-active' : ''}`}
                  onClick={() => setSortBy(opt.key)}
                >
                  {opt.key === 'smart_ai' && <Sparkles size={13} />}
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="ai-filter-toggles">
              <label className="ai-toggle-chip">
                <input type="checkbox" checked={nearbyOnly} onChange={(e) => setNearbyOnly(e.target.checked)} />
                <span>Nearby only</span>
              </label>
              <label className="ai-toggle-chip">
                <input type="checkbox" checked={minRating >= 4} onChange={(e) => setMinRating(e.target.checked ? 4 : 0)} />
                <span>4.0★+ rated</span>
              </label>
              <label className="ai-toggle-chip">
                <input type="checkbox" checked={goodConductOnly} onChange={(e) => setGoodConductOnly(e.target.checked)} />
                <span>Clean conduct only</span>
              </label>
            </div>
          </div>
        </div>

        {aiSummary && (
          <div className="ai-summary-callout" role="status">
            <div className="ai-summary-head">
              <strong><Sparkles size={15} /> AI Advisory Comparison {aiSummarySource === 'gemini' ? '(Gemini)' : '(Smart Match)'}</strong>
              <button type="button" className="table-action" onClick={() => setAiSummary('')}>Dismiss</button>
            </div>
            <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{aiSummary}</p>
          </div>
        )}

        {loading ? (
          <p className="field-note">Finding top-rated and nearby gardening services...</p>
        ) : services.length === 0 ? (
          <div className="empty-state">
            No services match your active AI filters right now. Try turning off &ldquo;4.0★+ rated&rdquo; or &ldquo;Nearby only&rdquo;, or post an open general request with your garden photos.
          </div>
        ) : (
          <div className="marketplace-card-grid dashboard-service-grid">
            {services.map((service) => {
              const providerName = service.business_name || `${service.first_name || ''} ${service.last_name || ''}`.trim()
              const ratingCount = Number(service.review_count || 0)
              const avgRating = service.average_rating != null ? Number(service.average_rating).toFixed(1) : null
              const hasPrice = service.indicative_price !== null && service.indicative_price !== undefined
              const ai = service.ai_match
              return (
                <article className="marketplace-card visual-market-card showcase-card" key={service.id}>
                  <div className="marketplace-card-media">
                    {service.image_path ? (
                      <img src={servicesApi.serviceImageUrl(service.id)} alt={service.title} loading="lazy" />
                    ) : (
                      <div className="marketplace-card-placeholder" aria-hidden="true">
                        <Leaf size={28} />
                        <span>{service.category_name || 'Gardening service'}</span>
                      </div>
                    )}
                    <span className="category-pill media-badge">{service.category_name || 'Gardening'}</span>
                    <span className="showcase-rating-pill" aria-label={ai ? `${ai.matchScore}% AI match` : 'Verified gardener'}>
                      {ai ? (
                        <><Sparkles size={12} /> {ai.matchScore}% Match</>
                      ) : ratingCount > 0 ? (
                        <><Star size={12} fill="currentColor" /> {avgRating} ({ratingCount})</>
                      ) : (
                        <><CheckCircle2 size={12} /> Verified</>
                      )}
                    </span>
                  </div>
                  <div className="marketplace-card-body">
                    <div className="ai-card-badges">
                      {ai?.conduct?.cleanConduct && (
                        <span className="conduct-pill">
                          <ShieldCheck size={12} /> {ai.conduct.tierLabel}
                        </span>
                      )}
                      {ratingCount > 0 && (
                        <span className="rating-inline-pill">
                          <Star size={12} fill="currentColor" /> {avgRating} ({ratingCount})
                        </span>
                      )}
                    </div>
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                    {ai?.reasons?.length > 0 && (
                      <div className="ai-reason-chips">
                        {ai.reasons.slice(0, 3).map((reason) => (
                          <span key={reason}>{reason}</span>
                        ))}
                      </div>
                    )}
                    <div className="service-meta">
                      <Link className="showcase-provider-link" to={`/gardeners/${service.gardener_id}`}>
                        {providerName}
                        {service.years_of_experience ? ` · ${service.years_of_experience} yr exp` : ''}
                      </Link>
                      <strong className="card-price">
                        {hasPrice
                          ? `₱${Number(service.indicative_price).toLocaleString()}${service.price_unit ? ` ${service.price_unit}` : ''}`
                          : 'Quote on request'}
                      </strong>
                    </div>
                    <div className="marketplace-card-footer showcase-card-footer">
                      <span className="card-area">
                        <MapPin size={13} /> {ai?.proximity?.label || service.service_area || 'Zamboanga City'}
                      </span>
                      <div className="showcase-card-actions">
                        <Link className="table-action" to={`/inquiries/new?serviceId=${service.id}`}>
                          Inquire
                        </Link>
                        <Link className="button button-sm" to={`/services/${service.id}`}>
                          View &amp; Book
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <div className="showcase-cta-strip">
          <div>
            <strong>Not sure which gardener to pick?</strong>
            <p>Upload a photo of your yard, get an instant estimate, and let nearby verified gardeners compete with offers.</p>
          </div>
          <div className="inline-actions">
            <Link className="button" to="/inquiries/new?type=general">
              Post a General Request <ArrowRight size={15} />
            </Link>
            <Link className="button button-outline" to="/assistant">
              <Sparkles size={15} /> Plan with AI
            </Link>
          </div>
        </div>
      </div>

      <div className="dashboard-panel showcase-reviews-panel">
        <div className="showcase-header">
          <div>
            <p className="eyebrow" style={{ marginBottom: '6px' }}>Trusted by Zamboanga homeowners</p>
            <h2 style={{ marginBottom: '4px' }}>Recent verified client reviews</h2>
          </div>
          <Link className="text-link" to="/services">
            Browse top gardeners <ArrowRight size={15} />
          </Link>
        </div>

        {reviews.length === 0 ? (
          <div className="trust-highlights-grid">
            <div className="trust-highlight-card">
              <Award size={20} />
              <strong>Verified Local Gardeners</strong>
              <p>Every public gardener profile is reviewed and approved by the administrator before listing services.</p>
            </div>
            <div className="trust-highlight-card">
              <CheckCircle2 size={20} />
              <strong>Mutual Service Agreements</strong>
              <p>Lock in scope, price, schedule, and deposit terms together before work begins—no surprise fees.</p>
            </div>
            <div className="trust-highlight-card">
              <Star size={20} />
              <strong>Verified Completed-Job Ratings</strong>
              <p>Reviews come strictly from clients whose gardening project was completed, paid, and mutually closed.</p>
            </div>
          </div>
        ) : (
          <div className="showcase-reviews-grid">
            {reviews.map((rev) => (
              <article className="showcase-review-card" key={rev.id}>
                <div className="showcase-review-top">
                  <span className="showcase-stars" aria-label={`${rev.rating} out of 5 stars`}>
                    {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                  </span>
                  <small>{new Date(rev.created_at).toLocaleDateString()}</small>
                </div>
                <p className="showcase-review-quote">
                  &ldquo;{rev.review_text || 'Great gardening work and smooth transaction!'}&rdquo;
                </p>
                <div className="showcase-review-footer">
                  <div>
                    <strong>{rev.client_name}</strong>
                    <small>
                      for {rev.gardener_name}{rev.service_title ? ` · ${rev.service_title}` : ''}
                    </small>
                  </div>
                  <Link className="table-action" to={rev.service_id ? `/services/${rev.service_id}` : `/gardeners/${rev.gardener_id}`}>
                    View provider
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function GardenerOpportunityShowcase({ userId, isApproved, defaultArea = 'Zamboanga City' }) {
  const [openRequests, setOpenRequests] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [areaInput, setAreaInput] = useState(defaultArea || '')
  const [sortBy, setSortBy] = useState('smart_ai')
  const [nearbyOnly, setNearbyOnly] = useState(false)
  const [goodConductOnly, setGoodConductOnly] = useState(false)

  useEffect(() => {
    let active = true
    reviewsApi.gardener(userId)
      .then((revRes) => {
        if (active) setReviews(revRes?.reviews || [])
      })
      .catch(() => {})
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (!isApproved) {
      return undefined
    }
    let active = true
    const timer = setTimeout(() => {
      if (!active) return
      setLoading(true)
      fetchSmartRecommendations({
        mode: 'leads',
        location: areaInput.trim() || defaultArea || 'Zamboanga City',
        sortBy,
        nearbyOnly,
        goodConductOnly,
        limit: 6,
      })
        .then((res) => {
          if (active) setOpenRequests(res?.recommendations || [])
        })
        .catch(() => {
          if (!active) return
          inquiriesApi.listOpen().then((fallback) => {
            if (active) setOpenRequests((fallback?.requests || fallback?.inquiries || []).slice(0, 6))
          }).catch(() => {})
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 180)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [isApproved, defaultArea, areaInput, sortBy, nearbyOnly, goodConductOnly])

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length).toFixed(1)
    : null

  return (
    <section className="dashboard-showcase-stack" aria-label="AI filtered open client leads and gardener reviews">
      <div className="dashboard-panel showcase-panel">
        <div className="showcase-header">
          <div>
            <p className="eyebrow" style={{ marginBottom: '6px' }}>AI nearby client lead matching</p>
            <h2 style={{ marginBottom: '4px' }}>Open client service requests near your area</h2>
            <p className="field-note" style={{ margin: 0 }}>
              Automatically ranked by proximity to your Zamboanga City service area, matching service categories, low competition, and client conduct.
            </p>
          </div>
          <Link className="button button-outline" to="/inquiries?tab=open">
            Open full requests board <ArrowRight size={15} />
          </Link>
        </div>

        {isApproved && (
          <div className="ai-filter-bar" role="region" aria-label="AI open lead filters">
            <div className="ai-filter-inputs">
              <label>
                Filter near barangay / service area
                <input
                  maxLength="120"
                  placeholder="e.g., Tetuan, Guiwan, Zamboanga City"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                />
              </label>
            </div>
            <div className="ai-filter-controls">
              <div className="ai-filter-pills" role="group" aria-label="Sort client leads">
                {[
                  { key: 'smart_ai', label: 'AI Best Lead' },
                  { key: 'nearby', label: 'Nearest First' },
                  { key: 'category_match', label: 'Matches My Services' },
                  { key: 'low_competition', label: 'Low Competition' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`booking-filter-pill${sortBy === opt.key ? ' is-active' : ''}`}
                    onClick={() => setSortBy(opt.key)}
                  >
                    {opt.key === 'smart_ai' && <Sparkles size={13} />}
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="ai-filter-toggles">
                <label className="ai-toggle-chip">
                  <input type="checkbox" checked={nearbyOnly} onChange={(e) => setNearbyOnly(e.target.checked)} />
                  <span>Nearby only</span>
                </label>
                <label className="ai-toggle-chip">
                  <input type="checkbox" checked={goodConductOnly} onChange={(e) => setGoodConductOnly(e.target.checked)} />
                  <span>Clean client record</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {!isApproved ? (
          <div className="empty-state">
            Your gardener account is awaiting administrator approval. Once approved, AI-matched nearby client requests in Zamboanga City will appear right here so you can submit offers.
          </div>
        ) : loading ? (
          <p className="field-note">Scanning open client requests near your service area...</p>
        ) : openRequests.length === 0 ? (
          <div className="empty-state">
            No open general client requests match your current filter. Try turning off &ldquo;Nearby only&rdquo; or clearing the area filter.
          </div>
        ) : (
          <div className="marketplace-card-grid dashboard-service-grid">
            {openRequests.map((req) => {
              const firstImg = req.images?.[0]
              const estRange = formatEstimateRange(req.estimated_min_amount, req.estimated_max_amount)
              const hasMyOffer = Boolean(req.my_quotation_id)
              const ai = req.ai_match
              return (
                <article className="marketplace-card visual-market-card showcase-card" key={req.id}>
                  <div className="marketplace-card-media">
                    {firstImg ? (
                      <img src={getRequestImageUrl(firstImg.id)} alt={req.subject} loading="lazy" />
                    ) : (
                      <div className="marketplace-card-placeholder" aria-hidden="true">
                        <Briefcase size={26} />
                        <span>{req.category_name || 'Client service request'}</span>
                      </div>
                    )}
                    <span className="category-pill media-badge">{req.category_name || 'General request'}</span>
                    <span className="showcase-rating-pill">
                      {ai ? <><Sparkles size={12} /> {ai.matchScore}% Fit</> : (hasMyOffer ? 'Offer Sent' : 'Open Lead')}
                    </span>
                  </div>
                  <div className="marketplace-card-body">
                    <div className="ai-card-badges">
                      {ai?.clientConductLabel && (
                        <span className="conduct-pill">
                          <ShieldCheck size={12} /> {ai.clientConductLabel}
                        </span>
                      )}
                      {hasMyOffer && <span className="inquiry-status status-accepted">Offer Sent</span>}
                    </div>
                    <h3>{req.subject}</h3>
                    <p>{req.ai_summary || req.description}</p>
                    {ai?.reasons?.length > 0 && (
                      <div className="ai-reason-chips">
                        {ai.reasons.slice(0, 3).map((reason) => (
                          <span key={reason}>{reason}</span>
                        ))}
                      </div>
                    )}
                    <div className="service-meta">
                      <span>
                        {req.client_first_name || 'Client'}
                        {req.area_sqm ? ` · ${Number(req.area_sqm)} m²` : ''}
                      </span>
                      <strong className="card-price">
                        {estRange ? `Est. ${estRange}` : 'Send quote'}
                      </strong>
                    </div>
                    <div className="marketplace-card-footer showcase-card-footer">
                      <span className="card-area">
                        <MapPin size={13} /> {ai?.proximity?.label || req.location || 'Zamboanga City'}
                      </span>
                      <Link className="button button-sm" to={`/inquiries/${req.id}`}>
                        {hasMyOffer ? 'Manage Offer' : 'Send Offer'} <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      <div className="dashboard-panel showcase-reviews-panel">
        <div className="showcase-header">
          <div>
            <p className="eyebrow" style={{ marginBottom: '6px' }}>Your reputation &amp; social proof</p>
            <h2 style={{ marginBottom: '4px' }}>
              Client reviews {avgRating ? `· ★ ${avgRating} (${reviews.length})` : ''}
            </h2>
          </div>
          <Link className="text-link" to={`/gardeners/${userId}`}>
            View public profile <ArrowRight size={15} />
          </Link>
        </div>
        {reviews.length === 0 ? (
          <p className="field-note" style={{ margin: 0 }}>
            No client reviews yet. Once you complete a paid booking and close the Transaction Completion Agreement, your client&apos;s rating and testimonial will appear here and boost your AI recommendation rank!
          </p>
        ) : (
          <div className="showcase-reviews-grid">
            {reviews.slice(0, 4).map((rev) => (
              <article className="showcase-review-card" key={rev.id}>
                <div className="showcase-review-top">
                  <span className="showcase-stars" aria-label={`${rev.rating} out of 5 stars`}>
                    {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                  </span>
                  <small>{new Date(rev.created_at).toLocaleDateString()}</small>
                </div>
                <p className="showcase-review-quote">
                  &ldquo;{rev.review_text || 'Rated 5 stars by client.'}&rdquo;
                </p>
                <div className="showcase-review-footer">
                  <strong>{rev.client_name}</strong>
                  <small>Verified completed booking</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function DashboardActivity({ role }) {
  const [inquiries, setInquiries] = useState([])
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([inquiriesApi.list(), bookingsApi.list()])
      .then(([inquiryData, bookingData]) => {
        setInquiries(inquiryData.inquiries.slice(0, 5))
        setBookings(bookingData.bookings.slice(0, 5))
      })
      .catch((loadError) => setError(loadError.message))
  }, [])

  const offersWaitingCount = role === 'client'
    ? inquiries.filter((inq) => Number(inq.offer_count || 0) > 0 && ['open', 'responded', 'provider_selected', 'in_agreement'].includes(inq.status)).length
    : inquiries.filter((inq) => inq.status === 'open' && !inq.my_quotation_id).length

  return (
    <section className="dashboard-activity">
      <div className="dashboard-panel">
        <div className="activity-heading">
          <div>
            <p className="eyebrow">{role === 'gardener' ? 'Direct inquiries & submitted offers' : 'Incoming offers & requests'}</p>
            <h2>{role === 'gardener' ? 'Client inquiries & offers.' : 'Your offers & service requests.'}</h2>
          </div>
          <div className="inline-actions">
            {role === 'gardener' && (
              <Link className="table-action" to="/inquiries?tab=open">Open board</Link>
            )}
            <Link className="text-link" to="/inquiries">View all</Link>
          </div>
        </div>
        {offersWaitingCount > 0 && (
          <div className="dashboard-highlight-pill">
            {role === 'client'
              ? `You have ${offersWaitingCount} active request${offersWaitingCount === 1 ? '' : 's'} with gardener offers ready to compare!`
              : `${offersWaitingCount} direct client inquir${offersWaitingCount === 1 ? 'y is' : 'ies are'} waiting for your response!`}
          </div>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
        {!error && inquiries.length === 0 && (
          <p className="form-note">
            {role === 'gardener'
              ? 'No direct inquiries or submitted offers yet. Send an offer on an open client request above to get started.'
              : 'No service requests yet. Click "View & Book" on any featured service above or post a general request.'}
          </p>
        )}
        {inquiries.map((inquiry) => (
          <Link className="activity-row" to={`/inquiries/${inquiry.id}`} key={inquiry.id}>
            <span>
              <strong>{inquiry.subject}</strong>
              <small>{formatInquirySubtitle(inquiry, role)}</small>
            </span>
            <span className={getStatusBadgeClass(inquiry.status)}>
              {formatStatusLabel(inquiry.status)}
            </span>
          </Link>
        ))}
      </div>
      <div className="dashboard-panel">
        <div className="activity-heading">
          <div>
            <p className="eyebrow">Schedule &amp; payments</p>
            <h2>{role === 'gardener' ? 'Reservations & bookings.' : 'Your reservations & bookings.'}</h2>
          </div>
          <Link className="text-link" to="/bookings">View all</Link>
        </div>
        {!error && bookings.length === 0 && (
          <p className="form-note">
            No reservations or bookings yet. Reservations are created automatically when both parties approve a mutual service agreement.
          </p>
        )}
        {bookings.map((booking) => {
          const badgeKey = booking.transaction_status === 'closed'
            ? 'closed'
            : booking.transaction_status === 'pending_closure'
              ? 'pending_closure'
              : (booking.status === 'completed' || booking.status === 'cancelled'
                ? booking.status
                : (booking.booking_stage || 'reserved'))
          const badgeLabel = booking.transaction_status === 'closed'
            ? 'Transaction Closed'
            : formatStatusLabel(badgeKey)
          return (
            <Link className="activity-row" to={`/bookings/${booking.id}`} key={booking.id}>
              <span>
                <strong>{booking.service_title || 'Gardening service'}</strong>
                <small>
                  <CalendarDays size={12} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                  {[
                    role === 'gardener' ? booking.client_name : booking.gardener_name,
                    booking.scheduled_start ? new Date(booking.scheduled_start).toLocaleDateString() : 'Schedule TBD',
                    formatStatusLabel(booking.payment_status),
                    Number(booking.pending_reschedule_count) > 0 ? 'Reschedule Pending' : null,
                  ].filter(Boolean).join(' · ')}
                </small>
              </span>
              <span className={getStatusBadgeClass(badgeKey)}>
                {badgeLabel}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function UserDashboard({ user, profileData, onSaved, activeTab }) {
  const { switchRole, enableDualRole } = useAuth()
  const [roleBusy, setRoleBusy] = useState(false)
  const [roleNotice, setRoleNotice] = useState('')
  const [roleError, setRoleError] = useState('')
  const role = user.role
  const roleLabel = role === 'gardener' ? 'Gardener' : 'Client'
  const counts = profileData.counts || {}
  const form = profileData.form || initialProfile
  const isProfileView = activeTab === 'profile'
  const fullPersonName = formatUserFullName({
    firstName: form.firstName || user.firstName,
    middleName: form.middleName ?? user.middleName,
    lastName: form.lastName || user.lastName,
  })
  const displayName = role === 'gardener' ? (form.businessName || fullPersonName) : fullPersonName
  const summaryAge = calculateAgeFromDob(form.dateOfBirth || user.dateOfBirth)

  async function handleQuickSwitchRole() {
    if (!user.isDualRole || roleBusy) return
    setRoleBusy(true); setRoleError(''); setRoleNotice('')
    try {
      const nextRole = role === 'client' ? 'gardener' : 'client'
      await switchRole(nextRole)
      setRoleNotice(`Switched workspace to ${nextRole === 'gardener' ? 'Gardener' : 'Client'} Mode.`)
    } catch (err) {
      setRoleError(err.message)
    } finally {
      setRoleBusy(false)
    }
  }

  async function handleEnableDualRole() {
    if (roleBusy) return
    setRoleBusy(true); setRoleError(''); setRoleNotice('')
    try {
      await enableDualRole({
        address: form.address || '',
        city: form.city || 'Zamboanga City',
        businessName: form.businessName || '',
        serviceArea: form.serviceArea || 'Zamboanga City',
      })
      setRoleNotice('Dual Role enabled! You can now switch anytime between Client Mode and Gardener Mode.')
    } catch (err) {
      setRoleError(err.message)
    } finally {
      setRoleBusy(false)
    }
  }

  return (
    <main className="dashboard-page">
      <AppSidebar />
      <section className="container dashboard-content">
        <div className="dashboard-topbar">
          <p className="eyebrow" style={{ margin: 0 }}>{roleLabel} dashboard</p>
          <div className="dashboard-tabs dashboard-tabs-top" role="tablist" aria-label="Dashboard sections">
            <Link
              className={`dashboard-tab${activeTab === 'overview' ? ' is-active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'overview'}
              to="/dashboard"
            >
              Overview & activity
            </Link>
            {role === 'gardener' && (
              <>
                <Link
                  className={`dashboard-tab${activeTab === 'services' ? ' is-active' : ''}`}
                  role="tab"
                  aria-selected={activeTab === 'services'}
                  to="/dashboard?tab=services"
                >
                  My services
                </Link>
                <Link
                  className={`dashboard-tab${activeTab === 'portfolio' ? ' is-active' : ''}`}
                  role="tab"
                  aria-selected={activeTab === 'portfolio'}
                  to="/dashboard?tab=portfolio"
                >
                  Portfolio
                </Link>
                <Link
                  className={`dashboard-tab${activeTab === 'clerks' ? ' is-active' : ''}`}
                  role="tab"
                  aria-selected={activeTab === 'clerks'}
                  to="/dashboard?tab=clerks"
                >
                  My Clerks
                </Link>
              </>
            )}
            <Link
              className={`dashboard-tab${isProfileView ? ' is-active' : ''}`}
              role="tab"
              aria-selected={isProfileView}
              to="/dashboard?tab=profile"
            >
              Profile & settings
            </Link>
          </div>
        </div>
        <div className="dashboard-hero-row">
          <div>
            <h1>{isProfileView ? 'Profile & settings.' : activeTab === 'services' ? 'My services.' : activeTab === 'portfolio' ? 'Portfolio.' : activeTab === 'clerks' ? 'My Clerks.' : `Welcome, ${user.firstName}.`}</h1>
            <p className="dashboard-lead" style={{ marginBottom: 0 }}>
              {isProfileView
                ? 'Review and update your contact details and public profile information.'
                : activeTab === 'services'
                  ? 'Create, edit, and manage the gardening services you offer.'
                  : activeTab === 'portfolio'
                    ? 'Showcase your completed garden projects to build client trust.'
                    : activeTab === 'clerks'
                      ? 'Add or revoke trusted clerks who can manage your schedules, services, and payment verifications.'
                      : role === 'gardener'
                        ? 'Manage open client requests, submitted offers, mutual agreements, and bookings.'
                        : 'Track your service requests, compare provider offers, review mutual agreements, and manage upcoming bookings.'}
            </p>
          </div>
          {activeTab === 'overview' && (
            <div className="inline-actions dashboard-hero-actions">
              {user.isDualRole && (
                <button
                  className="button button-outline dual-role-switch-btn"
                  type="button"
                  disabled={roleBusy}
                  onClick={handleQuickSwitchRole}
                >
                  <ArrowLeftRight size={15} />
                  {roleBusy ? 'Switching...' : `Switch to ${role === 'client' ? 'Gardener' : 'Client'} Mode`}
                </button>
              )}
              {role === 'client' ? (
                <>
                  <Link className="button" to="/services">Explore services</Link>
                  <Link className="button button-outline" to="/inquiries/new?type=general">Post general request</Link>
                  <Link className="button button-outline" to="/assistant"><Sparkles size={15} /> AI Garden Assistant</Link>
                </>
              ) : (
                <>
                  <Link className="button" to="/inquiries?tab=open">Browse open requests</Link>
                  <Link className="button button-outline" to="/dashboard?tab=services">My services</Link>
                  <Link className="button button-outline" to="/dashboard?tab=portfolio">Portfolio</Link>
                  <Link className="button button-outline" to="/dashboard?tab=clerks">My Clerks</Link>
                </>
              )}
            </div>
          )}
        </div>
        {roleError && <div className="form-error" role="alert" style={{ marginBottom: '12px' }}>{roleError}</div>}
        {roleNotice && <div className="form-success" role="status" style={{ marginBottom: '12px' }}>{roleNotice}</div>}
        {role === 'gardener' && (
          <div className={`form-note ${form.is_approved ? 'form-success' : 'form-error'}`}>
            {form.is_approved
              ? 'Your gardener profile is approved and active services are visible publicly.'
              : 'Your gardener profile is waiting for administrator approval. Your active services are not public yet.'}
          </div>
        )}

        {isProfileView ? (
          <>
            <section className="dashboard-panel dual-role-card" style={{ marginBottom: '20px' }}>
              <div className="activity-heading">
                <div>
                  <p className="eyebrow">Account capabilities</p>
                  <h2>{user.isDualRole ? 'Dual Role Active (Client & Gardener)' : 'Use HugaTiera as Both Client & Gardener'}</h2>
                </div>
                {user.isDualRole ? (
                  <button
                    className="button"
                    type="button"
                    disabled={roleBusy}
                    onClick={handleQuickSwitchRole}
                  >
                    <ArrowLeftRight size={15} />
                    {roleBusy ? 'Switching...' : `Switch to ${role === 'client' ? 'Gardener' : 'Client'} Mode`}
                  </button>
                ) : (
                  <button
                    className="button"
                    type="button"
                    disabled={roleBusy}
                    onClick={handleEnableDualRole}
                  >
                    <UserPlus size={15} />
                    {roleBusy ? 'Enabling...' : 'Enable Dual Role'}
                  </button>
                )}
              </div>
              <p className="field-note" style={{ margin: 0 }}>
                {user.isDualRole
                  ? `You are currently in ${roleLabel} Mode. Switch anytime from the sidebar or here. Your approved gardener services remain visible publicly even while browsing in Client Mode, and self-booking your own service is automatically prevented.`
                  : 'Want to both hire gardeners for your own property and offer gardening services on one account? Enable Dual Role to unlock instant Client ⇄ Gardener switching (new gardener profiles still require administrator approval before appearing publicly).'}
              </p>
            </section>
            <section className="dashboard-panel profile-settings-panel">
              <div className="activity-heading">
                <div>
                  <p className="eyebrow">Your profile</p>
                  <h2>Update your {roleLabel.toLowerCase()} information.</h2>
                </div>
                <Link className="text-link" to="/dashboard">Back to overview</Link>
              </div>
              <ProfileForm key={`${form.id || user.id}-${form.email || ''}-${form.businessName || ''}`} role={role} profile={form} userId={user.id} onSaved={onSaved} />
            </section>
          </>
        ) : role === 'gardener' && activeTab === 'clerks' ? (
          <GardenerClerksPanel />
        ) : role === 'gardener' && (activeTab === 'services' || activeTab === 'portfolio') ? (
          <GardenerTools isApproved={form.is_approved} section={activeTab} />
        ) : (
          <>
            <Stats role={role} counts={counts} />
            {role === 'gardener' && (
              <GardenerScheduleCalendar
                profileForm={form}
                onUnavailableDatesChange={(nextDates) => onSaved({ profile: { ...form, unavailableDates: nextDates } })}
              />
            )}
            {role === 'client' ? (
              <ClientDiscoveryShowcase defaultLocation={[form.address, form.city].filter(Boolean).join(', ') || 'Zamboanga City'} />
            ) : (
              <GardenerOpportunityShowcase
                userId={user.id}
                isApproved={Boolean(form.is_approved)}
                defaultArea={form.serviceArea || 'Zamboanga City'}
              />
            )}
            <DashboardActivity role={role} />
            <div className="dashboard-grid dashboard-overview-grid" style={{ marginTop: '22px' }}>
              <section className="dashboard-panel dashboard-next">
                <p className="eyebrow">{role === 'gardener' ? 'Provider workspace' : 'Quick actions'}</p>
                <h2>{role === 'gardener' ? 'Respond to requests and grow your profile.' : 'Start or manage a garden project.'}</h2>
                <p>
                  {role === 'gardener'
                    ? 'Browse open client requests in Zamboanga City to submit offers, manage your services and portfolio in dedicated tabs, and coordinate confirmed bookings.'
                    : 'Browse local gardening services for a direct inquiry, post an open general request with garden photos to compare offers, or chat with the AI Garden Assistant on the bottom right.'}
                </p>
                {role === 'client' && (
                  <div className="inline-actions dashboard-action-wrap">
                    <Link className="button" to="/services">Explore services</Link>
                    <Link className="button button-outline" to="/inquiries/new?type=general">Post general request</Link>
                    <Link className="button button-outline" to="/assistant"><Sparkles size={15} /> AI Garden Assistant</Link>
                  </div>
                )}
                {role === 'gardener' && (
                  <div className="inline-actions dashboard-action-wrap">
                    <Link className="button" to="/inquiries?tab=open">Browse open requests</Link>
                    <Link className="button button-outline" to="/dashboard?tab=services">Manage services</Link>
                    <Link className="button button-outline" to="/dashboard?tab=portfolio">Manage portfolio</Link>
                    <Link className="text-link" to={`/gardeners/${user.id}`}>View public profile</Link>
                  </div>
                )}
              </section>
              <aside className="dashboard-panel profile-summary-card">
                <p className="eyebrow">Account & profile</p>
                <h2>{displayName || 'Your profile'}</h2>
                <dl className="profile-summary-list">
                  <div>
                    <dt>Email</dt>
                    <dd>{form.email || user.email}</dd>
                  </div>
                  <div>
                    <dt>Mobile</dt>
                    <dd>{form.phone || 'Not set'}</dd>
                  </div>
                  <div>
                    <dt>Birthday / Age</dt>
                    <dd>
                      {form.dateOfBirth
                        ? `${form.dateOfBirth}${summaryAge !== null ? ` (${summaryAge} yrs old)` : ''}`
                        : 'Not set'}
                    </dd>
                  </div>
                  {role === 'client' ? (
                    <div>
                      <dt>Location</dt>
                      <dd>{[form.address, form.city].filter(Boolean).join(', ') || 'Zamboanga City'}</dd>
                    </div>
                  ) : (
                    <>
                      <div>
                        <dt>Service area</dt>
                        <dd>{form.serviceArea || 'Zamboanga City'}</dd>
                      </div>
                      <div>
                        <dt>Experience</dt>
                        <dd>{form.yearsOfExperience !== '' && form.yearsOfExperience !== null ? `${form.yearsOfExperience} yr(s)` : 'Not set'}</dd>
                      </div>
                      <div>
                        <dt>Working schedule</dt>
                        <dd>{formatWorkingDaysLabel(form.workingDays)} · {form.workStartTime || '08:00'}–{form.workEndTime || '17:00'}</dd>
                      </div>
                      <div>
                        <dt>Simultaneous capacity</dt>
                        <dd>{Number(form.maxConcurrentJobs) > 1 ? `Up to ${form.maxConcurrentJobs} jobs simultaneously` : 'Solo (1 job at a time)'}</dd>
                      </div>
                    </>
                  )}
                </dl>
                <Link className="button button-outline" to="/dashboard?tab=profile">
                  <Pencil size={15} /> Edit profile & settings
                </Link>
              </aside>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

function AdminDashboard({ summary, onStatusChange, onUserUpdated, onUserDeleted, activeTab }) {
  const counts = summary.counts || {}
  const [categories, setCategories] = useState([])
  const [pricingAddons, setPricingAddons] = useState([])
  const [addonForm, setAddonForm] = useState({
    name: '',
    itemType: 'plant',
    unit: 'per plant',
    unitPriceMin: '',
    unitPriceMax: '',
    description: '',
  })
  const [editingCategoryRate, setEditingCategoryRate] = useState(null)
  const [editingAddon, setEditingAddon] = useState(null)
  const [pricingSaving, setPricingSaving] = useState(false)
  const [services, setServices] = useState([])
  const [pendingGardeners, setPendingGardeners] = useState([])
  const [activity, setActivity] = useState({ inquiries: [], bookings: [] })
  const [reports, setReports] = useState([])
  const [clerkAssignments, setClerkAssignments] = useState([])
  const [clerkAssignForm, setClerkAssignForm] = useState({ clerkId: '', gardenerId: '', notes: '' })
  const [clerkAssignBusy, setClerkAssignBusy] = useState(false)
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' })
  const [editingAccount, setEditingAccount] = useState(null)
  const [deleteAccountTarget, setDeleteAccountTarget] = useState(null)
  const [accountSaving, setAccountSaving] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [adminMessage, setAdminMessage] = useState('')
  const [approvalInProgress, setApprovalInProgress] = useState(null)

  async function saveAccountEdit(event) {
    event.preventDefault()
    if (!editingAccount) return
    setAccountSaving(true); setAdminError(''); setAdminMessage('')
    try {
      const result = await profileApi.adminUpdateUser(editingAccount.id, {
        firstName: editingAccount.firstName,
        middleName: editingAccount.middleName,
        lastName: editingAccount.lastName,
        phone: editingAccount.phone,
        dateOfBirth: editingAccount.dateOfBirth,
        role: editingAccount.role,
        isActive: editingAccount.isActive,
      })
      onUserUpdated(result.user)
      setEditingAccount(null)
      setAdminMessage('Account updated successfully.')
    } catch (saveError) {
      setAdminError(saveError.message)
    } finally {
      setAccountSaving(false)
    }
  }

  async function confirmDeleteAccount() {
    if (!deleteAccountTarget) return
    setAccountSaving(true); setAdminError(''); setAdminMessage('')
    try {
      await profileApi.adminDeleteUser(deleteAccountTarget.id)
      onUserDeleted(deleteAccountTarget.id)
      if (editingAccount?.id === deleteAccountTarget.id) setEditingAccount(null)
      setDeleteAccountTarget(null)
      setAdminMessage('Account deleted successfully.')
    } catch (deleteError) {
      setAdminError(deleteError.message)
      setDeleteAccountTarget(null)
    } finally {
      setAccountSaving(false)
    }
  }

  const loadAdminData = useCallback(() => Promise.all([
    profileApi.adminCategories(),
    profileApi.adminPricingAddons(),
    profileApi.adminServices(),
    profileApi.adminActivity(),
    profileApi.adminReports(),
    profileApi.adminPendingGardeners(),
    profileApi.adminClerkAssignments().catch(() => ({ assignments: [] })),
  ]).then(([categoryData, addonData, serviceData, activityData, reportData, gardenerData, clerkData]) => {
    setCategories(categoryData.categories)
    setPricingAddons(addonData.addons || [])
    setServices(serviceData.services)
    setActivity(activityData)
    setReports(reportData.reports)
    setPendingGardeners(gardenerData.gardeners)
    setClerkAssignments(clerkData.assignments || [])
  }).catch((error) => setAdminError(error.message)), [])

  async function handleAssignClerk(event) {
    event.preventDefault()
    if (!clerkAssignForm.clerkId || !clerkAssignForm.gardenerId) {
      setAdminError('Please choose both a clerk account and a gardener account.')
      return
    }
    setClerkAssignBusy(true); setAdminError(''); setAdminMessage('')
    try {
      await profileApi.adminCreateClerkAssignment({
        clerkId: Number(clerkAssignForm.clerkId),
        gardenerId: Number(clerkAssignForm.gardenerId),
        notes: clerkAssignForm.notes,
      })
      setClerkAssignForm({ clerkId: '', gardenerId: '', notes: '' })
      setAdminMessage('Clerk assigned to gardener successfully.')
      await loadAdminData()
    } catch (assignErr) {
      setAdminError(assignErr.message)
    } finally {
      setClerkAssignBusy(false)
    }
  }

  async function handleRemoveClerkAssignment(assignmentId) {
    setClerkAssignBusy(true); setAdminError(''); setAdminMessage('')
    try {
      await profileApi.adminDeleteClerkAssignment(assignmentId)
      setAdminMessage('Clerk assignment removed.')
      await loadAdminData()
    } catch (delErr) {
      setAdminError(delErr.message)
    } finally {
      setClerkAssignBusy(false)
    }
  }

  useEffect(() => { loadAdminData() }, [loadAdminData])

  async function addCategory(event) { event.preventDefault(); try { await profileApi.createCategory(categoryForm); setCategoryForm({ name: '', description: '' }); loadAdminData() } catch (error) { setAdminError(error.message) } }
  async function toggleCategory(category) { try { await profileApi.updateCategory(category.id, { name: category.name, description: category.description, isActive: !category.is_active }); loadAdminData() } catch (error) { setAdminError(error.message) } }
  async function saveCategoryRate(event) {
    event.preventDefault()
    if (!editingCategoryRate) return
    setPricingSaving(true); setAdminError(''); setAdminMessage('')
    try {
      await profileApi.updateCategory(editingCategoryRate.id, {
        name: editingCategoryRate.name,
        description: editingCategoryRate.description,
        isActive: editingCategoryRate.isActive,
        ratePerSqmMin: Number(editingCategoryRate.ratePerSqmMin),
        ratePerSqmMax: Number(editingCategoryRate.ratePerSqmMax),
        minBaseFee: Number(editingCategoryRate.minBaseFee),
      })
      setEditingCategoryRate(null)
      setAdminMessage('Category labor rates updated.')
      await loadAdminData()
    } catch (error) {
      setAdminError(error.message)
    } finally {
      setPricingSaving(false)
    }
  }
  async function addPricingAddon(event) {
    event.preventDefault()
    setPricingSaving(true); setAdminError(''); setAdminMessage('')
    try {
      await profileApi.createPricingAddon({
        name: addonForm.name,
        itemType: addonForm.itemType,
        unit: addonForm.unit,
        unitPriceMin: Number(addonForm.unitPriceMin),
        unitPriceMax: Number(addonForm.unitPriceMax),
        description: addonForm.description,
      })
      setAddonForm({ name: '', itemType: 'plant', unit: 'per plant', unitPriceMin: '', unitPriceMax: '', description: '' })
      setAdminMessage('Plant/material pricing item added.')
      await loadAdminData()
    } catch (error) {
      setAdminError(error.message)
    } finally {
      setPricingSaving(false)
    }
  }
  async function savePricingAddonEdit(event) {
    event.preventDefault()
    if (!editingAddon) return
    setPricingSaving(true); setAdminError(''); setAdminMessage('')
    try {
      await profileApi.updatePricingAddon(editingAddon.id, {
        name: editingAddon.name,
        itemType: editingAddon.itemType,
        unit: editingAddon.unit,
        unitPriceMin: Number(editingAddon.unitPriceMin),
        unitPriceMax: Number(editingAddon.unitPriceMax),
        description: editingAddon.description,
        isActive: editingAddon.isActive,
      })
      setEditingAddon(null)
      setAdminMessage('Pricing item updated.')
      await loadAdminData()
    } catch (error) {
      setAdminError(error.message)
    } finally {
      setPricingSaving(false)
    }
  }
  async function togglePricingAddon(addon) {
    setAdminError(''); setAdminMessage('')
    try {
      await profileApi.updatePricingAddon(addon.id, {
        name: addon.name,
        itemType: addon.item_type,
        unit: addon.unit,
        unitPriceMin: Number(addon.unit_price_min),
        unitPriceMax: Number(addon.unit_price_max),
        description: addon.description || '',
        isActive: !addon.is_active,
      })
      await loadAdminData()
    } catch (error) {
      setAdminError(error.message)
    }
  }
  async function toggleService(service) { try { await profileApi.updateServiceStatus(service.id, !service.is_active); loadAdminData() } catch (error) { setAdminError(error.message) } }
  async function updateReport(id, status) { try { await profileApi.updateReport(id, status); loadAdminData() } catch (error) { setAdminError(error.message) } }
  async function updateGardenerApproval(userId, isApproved) {
    const gardener = pendingGardeners.find((item) => item.id === userId)
    if (!gardener || !window.confirm(isApproved ? 'Approve this gardener profile and publish its active services?' : 'Keep this gardener profile pending and request changes?')) return
    const reason = isApproved ? '' : window.prompt('Optional feedback for the gardener:', '') || ''
    setApprovalInProgress(userId); setAdminError(''); setAdminMessage('')
    try {
      await profileApi.updateGardenerApproval(userId, isApproved, reason)
      await loadAdminData()
      setAdminMessage(isApproved ? 'Gardener approved successfully.' : 'Feedback sent. The gardener remains pending.')
    } catch (error) { setAdminError(error.message) } finally { setApprovalInProgress(null) }
  }

  const sectionMeta = {
    overview: {
      title: 'Platform overview.',
      lead: 'Monitor accounts, marketplace content, reports, and platform activity.',
    },
    analytics: {
      title: 'Analytics & summary reports.',
      lead: 'Review platform conversion metrics, marketplace supply health, and structured operational logs.',
    },
    approvals: {
      title: 'Approvals & catalog.',
      lead: 'Review pending gardener applications, manage service categories, and moderate marketplace listings.',
    },
    pricing: {
      title: 'Pricing settings.',
      lead: 'Configure per-sq.m labor rates and separate reference prices for plants, soil, turf, equipment, and hauling used by the Inquiry Amount Predictor.',
    },
    activity: {
      title: 'Platform activity.',
      lead: 'Inspect recent client inquiries, provider offers, and booking statuses across Zamboanga City.',
    },
    reports: {
      title: 'Reported content.',
      lead: 'Review and resolve flagged listings, profiles, or messages.',
    },
    accounts: {
      title: 'Account management.',
      lead: 'Review registered clients and gardeners and update account access status.',
    },
  }[activeTab] || {
    title: 'Platform overview.',
    lead: 'Monitor accounts, marketplace content, reports, and platform activity.',
  }

  return (
    <main className="dashboard-page">
      <AppSidebar />
      <section className="container dashboard-content">
        <div className="dashboard-topbar">
          <p className="eyebrow" style={{ margin: 0 }}>Administrator dashboard</p>
          <div className="dashboard-tabs dashboard-tabs-top" role="tablist" aria-label="Administrator sections">
            <Link className={`dashboard-tab${activeTab === 'overview' ? ' is-active' : ''}`} role="tab" aria-selected={activeTab === 'overview'} to="/dashboard">Overview</Link>
            <Link className={`dashboard-tab${activeTab === 'analytics' ? ' is-active' : ''}`} role="tab" aria-selected={activeTab === 'analytics'} to="/dashboard?tab=analytics">Analytics</Link>
            <Link className={`dashboard-tab${activeTab === 'approvals' ? ' is-active' : ''}`} role="tab" aria-selected={activeTab === 'approvals'} to="/dashboard?tab=approvals">Approvals</Link>
            <Link className={`dashboard-tab${activeTab === 'pricing' ? ' is-active' : ''}`} role="tab" aria-selected={activeTab === 'pricing'} to="/dashboard?tab=pricing">Pricing</Link>
            <Link className={`dashboard-tab${activeTab === 'activity' ? ' is-active' : ''}`} role="tab" aria-selected={activeTab === 'activity'} to="/dashboard?tab=activity">Activity</Link>
            <Link className={`dashboard-tab${activeTab === 'reports' ? ' is-active' : ''}`} role="tab" aria-selected={activeTab === 'reports'} to="/dashboard?tab=reports">Reports</Link>
            <Link className={`dashboard-tab${activeTab === 'accounts' ? ' is-active' : ''}`} role="tab" aria-selected={activeTab === 'accounts'} to="/dashboard?tab=accounts">Accounts</Link>
          </div>
        </div>
        <div className="dashboard-hero-row">
          <div>
            <h1>{sectionMeta.title}</h1>
            <p className="dashboard-lead" style={{ marginBottom: 0 }}>{sectionMeta.lead}</p>
          </div>
          {activeTab === 'overview' && (
            <div className="inline-actions dashboard-hero-actions">
              <Link className="button" to="/dashboard?tab=approvals">Review approvals</Link>
              <Link className="button button-outline" to="/dashboard?tab=analytics">Analytics & reports</Link>
              <Link className="button button-outline" to="/dashboard?tab=accounts">Manage accounts</Link>
            </div>
          )}
        </div>

        {adminError && <div className="form-error" role="alert">{adminError}</div>}
        {adminMessage && <div className="form-success" role="status">{adminMessage}</div>}

        {activeTab === 'overview' && (
          <>
            <div className="stat-grid admin-stats">
              {[
                ['Clients', counts.clients],
                ['Gardeners', counts.gardeners],
                ['Pending gardeners', counts.pending_gardeners],
                ['Services', counts.services],
                ['Bookings', counts.bookings],
                ['Open reports', counts.open_reports],
              ].map(([label, value], index) => (
                <div className={`stat-card${index === 0 ? ' stat-card-primary' : ''}`} key={label}>
                  <strong>{value ?? 0}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <section className="dashboard-overview-grid">
              <div className="dashboard-panel">
                <div className="activity-heading">
                  <div>
                    <p className="eyebrow">Moderation queue</p>
                    <h2>Pending approvals & reports.</h2>
                  </div>
                  <Link className="text-link" to="/dashboard?tab=approvals">Open approvals</Link>
                </div>
                {pendingGardeners.length === 0 ? (
                  <p className="form-note">No gardener profiles are waiting for approval.</p>
                ) : (
                  pendingGardeners.slice(0, 4).map((gardener) => (
                    <Link className="activity-row" to="/dashboard?tab=approvals" key={gardener.id}>
                      <span>
                        <strong>{gardener.business_name || `${gardener.first_name} ${gardener.last_name}`}</strong>
                        <small>{gardener.first_name} {gardener.last_name} · {gardener.service_area}</small>
                      </span>
                      <span className="status-badge status-pending">Pending</span>
                    </Link>
                  ))
                )}
                <div className="inline-actions dashboard-action-wrap">
                  <Link className="button button-outline" to="/dashboard?tab=reports">
                    Review reports ({reports.filter((r) => r.status === 'open').length} open)
                  </Link>
                  <Link className="text-link" to="/dashboard?tab=accounts">Manage accounts ({summary.users.length})</Link>
                </div>
              </div>
              <div className="dashboard-panel">
                <div className="activity-heading">
                  <div>
                    <p className="eyebrow">Activity snapshot</p>
                    <h2>Recent inquiries & bookings.</h2>
                  </div>
                  <Link className="text-link" to="/dashboard?tab=activity">View all activity</Link>
                </div>
                {activity.inquiries.length === 0 && activity.bookings.length === 0 && (
                  <p className="form-note">No inquiries or bookings recorded yet.</p>
                )}
                {activity.inquiries.slice(0, 4).map((item) => (
                  <Link className="activity-row" to={`/inquiries/${item.id}`} key={`inq-${item.id}`}>
                    <span>
                      <strong>{item.subject}</strong>
                      <small>{item.client_name} → {item.gardener_name}</small>
                    </span>
                    <span className={getStatusBadgeClass(item.status)}>{formatStatusLabel(item.status)}</span>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === 'analytics' && (() => {
          const totalInquiries = activity.inquiries.length
          const openInquiries = activity.inquiries.filter((i) => i.status === 'open' || i.status === 'responded').length
          const confirmedInquiries = activity.inquiries.filter((i) => i.status === 'confirmed' || i.status === 'accepted').length
          const totalBookings = activity.bookings.length
          const completedBookings = activity.bookings.filter((b) => b.status === 'completed').length
          const activeBookings = activity.bookings.filter((b) => b.status === 'confirmed' || b.status === 'in_progress' || b.status === 'pending').length
          const completionRate = totalBookings > 0 ? Math.round((completedBookings / totalBookings) * 100) : 0

          const activeServices = services.filter((s) => s.is_active).length
          const activeCategories = categories.filter((c) => c.is_active).length
          const activeAccounts = summary.users.filter((u) => u.is_active).length
          const openReportsCount = reports.filter((r) => r.status === 'open' || r.status === 'reviewing').length
          const resolvedReportsCount = reports.filter((r) => r.status === 'resolved' || r.status === 'dismissed').length

          const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0)

          const summaryRows = [
            {
              metric: 'Inquiries — Open / Responded',
              count: openInquiries,
              total: totalInquiries,
              note: 'Awaiting offer review or mutual agreement',
            },
            {
              metric: 'Inquiries — Confirmed / Accepted',
              count: confirmedInquiries,
              total: totalInquiries,
              note: 'Progressed to agreement or confirmed booking',
            },
            {
              metric: 'Bookings — Completed',
              count: completedBookings,
              total: totalBookings,
              note: `${completionRate}% completion rate across all bookings`,
            },
            {
              metric: 'Bookings — Active / Pending',
              count: activeBookings,
              total: totalBookings,
              note: 'Scheduled or awaiting completion',
            },
            {
              metric: 'Services — Active Listings',
              count: activeServices,
              total: services.length,
              note: 'Published and active in catalog',
            },
            {
              metric: 'Categories — Active',
              count: activeCategories,
              total: categories.length,
              note: 'Available for gardener service listings',
            },
            {
              metric: 'Accounts — Active',
              count: activeAccounts,
              total: summary.users.length,
              note: `${counts.clients ?? 0} clients · ${counts.gardeners ?? 0} approved gardeners`,
            },
            {
              metric: 'Reports — Open / Reviewing',
              count: openReportsCount,
              total: reports.length,
              note: `${resolvedReportsCount} resolved or dismissed`,
            },
          ]

          return (
            <>
              <section className="admin-analytics-grid" aria-label="Platform analytics summary">
                <div className="dashboard-panel admin-analytics-card">
                  <div className="activity-heading">
                    <div>
                      <p className="eyebrow">Pipeline analytics</p>
                      <h2>Requests & bookings.</h2>
                    </div>
                    <span className="panel-count">{completionRate}% completed</span>
                  </div>
                  <div className="analytics-meter-list">
                    <div className="analytics-meter-row">
                      <div className="analytics-meter-label">
                        <span>Active inquiries (open / responded)</span>
                        <strong>{openInquiries} / {totalInquiries}</strong>
                      </div>
                      <div className="analytics-bar-track">
                        <div className="analytics-bar-fill is-amber" style={{ width: `${pct(openInquiries, totalInquiries)}%` }} />
                      </div>
                    </div>
                    <div className="analytics-meter-row">
                      <div className="analytics-meter-label">
                        <span>Converted / confirmed inquiries</span>
                        <strong>{confirmedInquiries} / {totalInquiries}</strong>
                      </div>
                      <div className="analytics-bar-track">
                        <div className="analytics-bar-fill" style={{ width: `${pct(confirmedInquiries, totalInquiries)}%` }} />
                      </div>
                    </div>
                    <div className="analytics-meter-row">
                      <div className="analytics-meter-label">
                        <span>Completed bookings</span>
                        <strong>{completedBookings} / {totalBookings}</strong>
                      </div>
                      <div className="analytics-bar-track">
                        <div className="analytics-bar-fill" style={{ width: `${pct(completedBookings, totalBookings)}%` }} />
                      </div>
                    </div>
                    <div className="analytics-meter-row">
                      <div className="analytics-meter-label">
                        <span>Upcoming / active bookings</span>
                        <strong>{activeBookings} / {totalBookings}</strong>
                      </div>
                      <div className="analytics-bar-track">
                        <div className="analytics-bar-fill is-amber" style={{ width: `${pct(activeBookings, totalBookings)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="dashboard-panel admin-analytics-card">
                  <div className="activity-heading">
                    <div>
                      <p className="eyebrow">Supply health</p>
                      <h2>Marketplace catalog.</h2>
                    </div>
                    <Link className="text-link" to="/dashboard?tab=approvals">Manage</Link>
                  </div>
                  <div className="analytics-meter-list">
                    <div className="analytics-meter-row">
                      <div className="analytics-meter-label">
                        <span>Active service listings</span>
                        <strong>{activeServices} / {services.length}</strong>
                      </div>
                      <div className="analytics-bar-track">
                        <div className="analytics-bar-fill" style={{ width: `${pct(activeServices, services.length)}%` }} />
                      </div>
                    </div>
                    <div className="analytics-meter-row">
                      <div className="analytics-meter-label">
                        <span>Active service categories</span>
                        <strong>{activeCategories} / {categories.length}</strong>
                      </div>
                      <div className="analytics-bar-track">
                        <div className="analytics-bar-fill" style={{ width: `${pct(activeCategories, categories.length)}%` }} />
                      </div>
                    </div>
                    <div className="analytics-meter-row">
                      <div className="analytics-meter-label">
                        <span>Pending gardener reviews</span>
                        <strong>{pendingGardeners.length} waiting</strong>
                      </div>
                      <div className="analytics-bar-track">
                        <div className="analytics-bar-fill is-amber" style={{ width: `${pct(pendingGardeners.length, (counts.gardeners || 0) + pendingGardeners.length)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="dashboard-panel admin-analytics-card">
                  <div className="activity-heading">
                    <div>
                      <p className="eyebrow">Trust & accounts</p>
                      <h2>Safety & access.</h2>
                    </div>
                    <Link className="text-link" to="/dashboard?tab=accounts">Accounts</Link>
                  </div>
                  <div className="analytics-meter-list">
                    <div className="analytics-meter-row">
                      <div className="analytics-meter-label">
                        <span>Active user accounts</span>
                        <strong>{activeAccounts} / {summary.users.length}</strong>
                      </div>
                      <div className="analytics-bar-track">
                        <div className="analytics-bar-fill" style={{ width: `${pct(activeAccounts, summary.users.length)}%` }} />
                      </div>
                    </div>
                    <div className="analytics-meter-row">
                      <div className="analytics-meter-label">
                        <span>Open / reviewing reports</span>
                        <strong>{openReportsCount} / {reports.length}</strong>
                      </div>
                      <div className="analytics-bar-track">
                        <div className="analytics-bar-fill is-amber" style={{ width: `${pct(openReportsCount, reports.length)}%` }} />
                      </div>
                    </div>
                    <div className="analytics-meter-row">
                      <div className="analytics-meter-label">
                        <span>Resolved / dismissed reports</span>
                        <strong>{resolvedReportsCount} / {reports.length}</strong>
                      </div>
                      <div className="analytics-bar-track">
                        <div className="analytics-bar-fill" style={{ width: `${pct(resolvedReportsCount, reports.length)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="dashboard-panel user-management">
                <div className="activity-heading">
                  <div>
                    <p className="eyebrow">Summary log</p>
                    <h2>Operational breakdown report.</h2>
                  </div>
                  <Link className="text-link" to="/dashboard?tab=activity">Inspect activity log</Link>
                </div>
                <div className="user-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Count</th>
                        <th>Share</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryRows.map((row) => (
                        <tr key={row.metric}>
                          <td><strong>{row.metric}</strong></td>
                          <td>{row.count} / {row.total}</td>
                          <td>{pct(row.count, row.total)}%</td>
                          <td><small>{row.note}</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )
        })()}

        {activeTab === 'approvals' && (
          <section className="admin-management-grid" id="admin-approvals">
            <section className="dashboard-panel">
              <p className="eyebrow">Gardener approval</p>
              <h2>Review pending gardeners</h2>
              {pendingGardeners.length === 0 && <p className="form-note">No gardener profiles are waiting for approval.</p>}
              <div className="admin-item-list">
                {pendingGardeners.map((gardener) => (
                  <div className="admin-item" key={gardener.id}>
                    <span>
                      <strong>{gardener.business_name || `${gardener.first_name} ${gardener.last_name}`}</strong>
                      <small>{gardener.first_name} {gardener.last_name} · {gardener.service_area}</small>
                    </span>
                    <div className="inline-actions">
                      <button className="button" type="button" disabled={approvalInProgress === gardener.id} onClick={() => updateGardenerApproval(gardener.id, true)}>
                        {approvalInProgress === gardener.id ? 'Saving...' : 'Approve'}
                      </button>
                      <button className="table-action" type="button" disabled={approvalInProgress === gardener.id} onClick={() => updateGardenerApproval(gardener.id, false)}>
                        Request changes
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="dashboard-panel">
              <p className="eyebrow">Categories</p>
              <h2>Manage service categories</h2>
              <form className="profile-form admin-category-form" onSubmit={addCategory}>
                <input required placeholder="Category name" value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} />
                <input placeholder="Description" value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} />
                <button className="button" type="submit">Add category</button>
              </form>
              <div className="admin-item-list">
                {categories.map((category) => (
                  <div className="admin-item" key={category.id}>
                    <span>
                      <strong>{category.name}</strong>
                      <small>{category.is_active ? 'Active' : 'Inactive'}</small>
                    </span>
                    <button className="table-action" type="button" onClick={() => toggleCategory(category)}>
                      {category.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <section className="dashboard-panel">
              <p className="eyebrow">Service listings</p>
              <h2>Monitor marketplace content</h2>
              <div className="admin-item-list">
                {services.map((service) => (
                  <div className="admin-item" key={service.id}>
                    <span>
                      <strong>{service.title}</strong>
                      <small>{service.gardener_name} · {service.is_active ? 'Active' : 'Inactive'}</small>
                    </span>
                    <button className="table-action" type="button" onClick={() => toggleService(service)}>
                      {service.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </section>
        )}

        {activeTab === 'pricing' && (
          <div className="dashboard-grid" id="admin-pricing">
            <section className="dashboard-panel">
              <p className="eyebrow">Labor baseline rates (per sq.m)</p>
              <h2>Service category rates</h2>
              <p className="field-note">Used by the Inquiry Amount Predictor to estimate labor separately from plants and materials.</p>
              {editingCategoryRate && (
                <form className="profile-form admin-account-edit-form" onSubmit={saveCategoryRate} style={{ marginBottom: '14px' }}>
                  <div className="activity-heading">
                    <h3>Edit {editingCategoryRate.name}</h3>
                    <button className="table-action" type="button" onClick={() => setEditingCategoryRate(null)}>Cancel</button>
                  </div>
                  <div className="form-row form-row-3">
                    <label>Min ₱/m²<input type="number" required min="1" step="0.5" value={editingCategoryRate.ratePerSqmMin} onChange={(e) => setEditingCategoryRate({ ...editingCategoryRate, ratePerSqmMin: e.target.value })} /></label>
                    <label>Max ₱/m²<input type="number" required min="1" step="0.5" value={editingCategoryRate.ratePerSqmMax} onChange={(e) => setEditingCategoryRate({ ...editingCategoryRate, ratePerSqmMax: e.target.value })} /></label>
                    <label>Min base fee (₱)<input type="number" required min="0" step="10" value={editingCategoryRate.minBaseFee} onChange={(e) => setEditingCategoryRate({ ...editingCategoryRate, minBaseFee: e.target.value })} /></label>
                  </div>
                  <button className="button" type="submit" disabled={pricingSaving}><Save size={15} /> {pricingSaving ? 'Saving...' : 'Save rates'}</button>
                </form>
              )}
              <div className="manage-list">
                {categories.map((cat) => (
                  <div className="manage-item" key={cat.id}>
                    <div>
                      <strong>{cat.name}</strong>
                      <small>₱{Number(cat.rate_per_sqm_min).toFixed(0)}–₱{Number(cat.rate_per_sqm_max).toFixed(0)} / m² · Min base ₱{Number(cat.min_base_fee).toFixed(0)}</small>
                    </div>
                    <button
                      className="table-action"
                      type="button"
                      onClick={() => setEditingCategoryRate({
                        id: cat.id,
                        name: cat.name,
                        description: cat.description || '',
                        isActive: Boolean(cat.is_active),
                        ratePerSqmMin: Number(cat.rate_per_sqm_min),
                        ratePerSqmMax: Number(cat.rate_per_sqm_max),
                        minBaseFee: Number(cat.min_base_fee),
                      })}
                    >
                      Edit rates
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="dashboard-panel">
              <p className="eyebrow">Separate plant &amp; material pricing</p>
              <h2>Plants, soil, turf &amp; add-ons</h2>
              <p className="field-note">Reference prices clients can add to inquiries (e.g., plants, grass turf, soil, fertilizer, equipment, or hauling).</p>
              {editingAddon ? (
                <form className="profile-form admin-account-edit-form" onSubmit={savePricingAddonEdit} style={{ marginBottom: '14px' }}>
                  <div className="activity-heading">
                    <h3>Edit {editingAddon.name}</h3>
                    <button className="table-action" type="button" onClick={() => setEditingAddon(null)}>Cancel</button>
                  </div>
                  <label>Item name<input required maxLength="120" value={editingAddon.name} onChange={(e) => setEditingAddon({ ...editingAddon, name: e.target.value })} /></label>
                  <div className="form-row">
                    <label>Type
                      <select value={editingAddon.itemType} onChange={(e) => setEditingAddon({ ...editingAddon, itemType: e.target.value })}>
                        <option value="plant">Plant / Grass</option>
                        <option value="material">Soil / Material</option>
                        <option value="equipment">Equipment</option>
                        <option value="disposal">Hauling / Disposal</option>
                      </select>
                    </label>
                    <label>Unit<input required maxLength="40" value={editingAddon.unit} onChange={(e) => setEditingAddon({ ...editingAddon, unit: e.target.value })} /></label>
                  </div>
                  <div className="form-row">
                    <label>Min price (₱)<input type="number" required min="0" step="1" value={editingAddon.unitPriceMin} onChange={(e) => setEditingAddon({ ...editingAddon, unitPriceMin: e.target.value })} /></label>
                    <label>Max price (₱)<input type="number" required min="0" step="1" value={editingAddon.unitPriceMax} onChange={(e) => setEditingAddon({ ...editingAddon, unitPriceMax: e.target.value })} /></label>
                  </div>
                  <label>Description<input maxLength="255" value={editingAddon.description} onChange={(e) => setEditingAddon({ ...editingAddon, description: e.target.value })} /></label>
                  <button className="button" type="submit" disabled={pricingSaving}><Save size={15} /> {pricingSaving ? 'Saving...' : 'Save item'}</button>
                </form>
              ) : (
                <form className="profile-form" onSubmit={addPricingAddon} style={{ marginBottom: '14px' }}>
                  <div className="form-row">
                    <label>New item name<input required maxLength="120" placeholder="e.g., Palm tree sapling" value={addonForm.name} onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })} /></label>
                    <label>Type
                      <select value={addonForm.itemType} onChange={(e) => setAddonForm({ ...addonForm, itemType: e.target.value })}>
                        <option value="plant">Plant / Grass</option>
                        <option value="material">Soil / Material</option>
                        <option value="equipment">Equipment</option>
                        <option value="disposal">Hauling / Disposal</option>
                      </select>
                    </label>
                  </div>
                  <div className="form-row form-row-3">
                    <label>Unit<input required maxLength="40" placeholder="per plant" value={addonForm.unit} onChange={(e) => setAddonForm({ ...addonForm, unit: e.target.value })} /></label>
                    <label>Min ₱<input type="number" required min="0" step="1" placeholder="100" value={addonForm.unitPriceMin} onChange={(e) => setAddonForm({ ...addonForm, unitPriceMin: e.target.value })} /></label>
                    <label>Max ₱<input type="number" required min="0" step="1" placeholder="300" value={addonForm.unitPriceMax} onChange={(e) => setAddonForm({ ...addonForm, unitPriceMax: e.target.value })} /></label>
                  </div>
                  <button className="button" type="submit" disabled={pricingSaving}>Add pricing item</button>
                </form>
              )}
              <div className="manage-list">
                {pricingAddons.map((addon) => (
                  <div className="manage-item" key={addon.id}>
                    <div>
                      <strong>{addon.name}</strong>
                      <small>{addon.item_type} · ₱{Number(addon.unit_price_min).toFixed(0)}–₱{Number(addon.unit_price_max).toFixed(0)} {addon.unit} · {addon.is_active ? 'Active' : 'Inactive'}</small>
                    </div>
                    <div className="inline-actions">
                      <button
                        className="table-action"
                        type="button"
                        onClick={() => setEditingAddon({
                          id: addon.id,
                          name: addon.name,
                          itemType: addon.item_type,
                          unit: addon.unit,
                          unitPriceMin: Number(addon.unit_price_min),
                          unitPriceMax: Number(addon.unit_price_max),
                          description: addon.description || '',
                          isActive: Boolean(addon.is_active),
                        })}
                      >
                        Edit
                      </button>
                      <button className="table-action" type="button" onClick={() => togglePricingAddon(addon)}>
                        {addon.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'activity' && (
          <section className="dashboard-panel user-management" id="admin-activity">
            <p className="eyebrow">Activity</p>
            <h2>Inquiries and bookings</h2>
            <div className="admin-activity-grid">
              <div className="admin-activity-column">
                <div className="admin-activity-colhead">
                  <h3>Recent inquiries</h3>
                  <span className="panel-count">{activity.inquiries.length}</span>
                </div>
                {activity.inquiries.length === 0 && <p className="form-note">No inquiries recorded yet.</p>}
                {activity.inquiries.slice(0, 20).map((item) => (
                  <Link className="admin-activity-row admin-activity-link" to={`/inquiries/${item.id}`} key={item.id}>
                    <div>
                      <strong>{item.subject}</strong>
                      <span>{item.client_name} → {item.gardener_name}</span>
                    </div>
                    <span className={getStatusBadgeClass(item.status)}>{formatStatusLabel(item.status)}</span>
                  </Link>
                ))}
              </div>
              <div className="admin-activity-column">
                <div className="admin-activity-colhead">
                  <h3>Recent bookings</h3>
                  <span className="panel-count">{activity.bookings.length}</span>
                </div>
                {activity.bookings.length === 0 && <p className="form-note">No bookings recorded yet.</p>}
                {activity.bookings.slice(0, 20).map((item) => (
                  <div className="admin-activity-row" key={item.id}>
                    <div>
                      <strong>{item.service_title || 'Service booking'}</strong>
                      <span>{item.client_name} → {item.gardener_name}</span>
                    </div>
                    <span className={getStatusBadgeClass(item.status)}>{formatStatusLabel(item.status)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'reports' && (
          <section className="dashboard-panel user-management" id="admin-reports">
            <p className="eyebrow">Reports</p>
            <h2>Review reported content</h2>
            <div className="admin-item-list">
              {reports.length === 0 && <p className="form-note">No reports have been submitted.</p>}
              {reports.map((report) => (
                <div className="admin-item admin-report" key={report.id}>
                  <span>
                    <strong>{report.reason}</strong>
                    <small>{report.reporter_name} · {report.status}</small>
                    {report.details && <em>{report.details}</em>}
                  </span>
                  <select value={report.status} onChange={(event) => updateReport(report.id, event.target.value)}>
                    <option value="open" disabled>Open</option>
                    <option value="reviewing">Reviewing</option>
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'accounts' && (
          <section className="dashboard-panel user-management" id="admin-accounts">
            <p className="eyebrow">Account management</p>
            <h2>Manage accounts</h2>
            {editingAccount && (
              <form className="profile-form admin-account-edit-form" onSubmit={saveAccountEdit}>
                <div className="activity-heading">
                  <h3>Edit {editingAccount.email}</h3>
                  <button className="table-action" type="button" onClick={() => setEditingAccount(null)}>Cancel</button>
                </div>
                <div className="form-row form-row-3">
                  <label>First name<input required maxLength="100" value={editingAccount.firstName} onChange={(e) => setEditingAccount({ ...editingAccount, firstName: e.target.value })} /></label>
                  <label>Middle name <span className="label-note">(Optional)</span><input maxLength="100" placeholder="Optional" value={editingAccount.middleName || ''} onChange={(e) => setEditingAccount({ ...editingAccount, middleName: e.target.value })} /></label>
                  <label>Last name<input required maxLength="100" value={editingAccount.lastName} onChange={(e) => setEditingAccount({ ...editingAccount, lastName: e.target.value })} /></label>
                </div>
                <div className="form-row form-row-3">
                  <label>Mobile number<input type="tel" maxLength="30" value={editingAccount.phone} onChange={(e) => setEditingAccount({ ...editingAccount, phone: e.target.value })} /></label>
                  <label>Birthday <span className="label-note">(18+ if set)</span><input type="date" max={getMaxBirthDateForAge(MIN_REGISTRATION_AGE)} value={editingAccount.dateOfBirth || ''} onChange={(e) => setEditingAccount({ ...editingAccount, dateOfBirth: e.target.value })} /></label>
                  <label>
                    Role
                    <select value={editingAccount.role} onChange={(e) => setEditingAccount({ ...editingAccount, role: e.target.value })}>
                      <option value="client">Client</option>
                      <option value="gardener">Gardener</option>
                      <option value="clerk">Clerk (Assigned Gardener Manager)</option>
                      <option value="administrator">Administrator</option>
                    </select>
                  </label>
                </div>
                <div className="inline-actions">
                  <button className="button" type="submit" disabled={accountSaving}>
                    <Save size={15} /> {accountSaving ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </form>
            )}
            <div className="user-table-wrap">
              <table>
                <thead>
                  <tr><th>Name</th><th>Role</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {summary.users.map((account) => {
                    const accountFullName = formatUserFullName({
                      firstName: account.first_name,
                      middleName: account.middle_name,
                      lastName: account.last_name,
                    })
                    return (
                    <tr key={account.id}>
                      <td>
                        {accountFullName}
                        <small>{account.email}{account.age !== null && account.age !== undefined ? ` · Age ${account.age}` : ''}</small>
                      </td>
                      <td>
                        {account.role}
                        {Boolean(account.can_act_as_client) && Boolean(account.can_act_as_gardener) && (
                          <small>Dual role (Client + Gardener)</small>
                        )}
                      </td>
                      <td><span className={account.is_active ? 'status-active' : 'status-inactive'}>{account.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <div className="inline-actions">
                          <button
                            className="table-action"
                            type="button"
                            onClick={() => setEditingAccount({
                              id: account.id,
                              email: account.email,
                              firstName: account.first_name,
                              middleName: account.middle_name || '',
                              lastName: account.last_name,
                              phone: account.phone || '',
                              dateOfBirth: account.date_of_birth ? String(account.date_of_birth).slice(0, 10) : '',
                              role: account.role,
                              isActive: Boolean(account.is_active),
                            })}
                          >
                            Edit
                          </button>
                          <button className="table-action" type="button" onClick={() => onStatusChange(account.id, !account.is_active)}>
                            {account.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button className="table-action table-action-danger" type="button" onClick={() => setDeleteAccountTarget(account)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="admin-clerk-assignments" style={{ marginTop: '28px', paddingTop: '22px', borderTop: '1px solid var(--border-subtle, #e2e8f0)' }}>
              <p className="eyebrow">Assigned clerks</p>
              <h2>Link clerks to specific gardeners</h2>
              <p className="field-note">
                First set a user&apos;s role to <strong>Clerk</strong> above, then assign them to one or more gardener accounts they are authorized to manage (schedules, blocked dates, services, and payment verifications).
              </p>
              {(() => {
                const clerkUsers = summary.users.filter((u) => u.role === 'clerk' && u.is_active)
                const gardenerUsers = summary.users.filter((u) => (u.role === 'gardener' || Boolean(u.can_act_as_gardener)) && u.is_active)
                return (
                  <form className="profile-form" onSubmit={handleAssignClerk} style={{ marginBottom: '16px' }}>
                    <div className="form-row form-row-3">
                      <label>
                        Clerk account
                        <select
                          required
                          value={clerkAssignForm.clerkId}
                          onChange={(e) => setClerkAssignForm({ ...clerkAssignForm, clerkId: e.target.value })}
                        >
                          <option value="">Select clerk...</option>
                          {clerkUsers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.first_name} {c.last_name} ({c.email})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Gardener to manage
                        <select
                          required
                          value={clerkAssignForm.gardenerId}
                          onChange={(e) => setClerkAssignForm({ ...clerkAssignForm, gardenerId: e.target.value })}
                        >
                          <option value="">Select gardener...</option>
                          {gardenerUsers.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.first_name} {g.last_name} ({g.email})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Assignment note <span className="label-note">(Optional)</span>
                        <input
                          maxLength="255"
                          placeholder="e.g., Handles weekday schedules & GCash checks"
                          value={clerkAssignForm.notes}
                          onChange={(e) => setClerkAssignForm({ ...clerkAssignForm, notes: e.target.value })}
                        />
                      </label>
                    </div>
                    <button className="button" type="submit" disabled={clerkAssignBusy || clerkUsers.length === 0 || gardenerUsers.length === 0}>
                      <UserPlus size={15} /> {clerkAssignBusy ? 'Assigning...' : 'Assign clerk to gardener'}
                    </button>
                    {clerkUsers.length === 0 && (
                      <span className="field-note" style={{ marginLeft: '10px' }}>
                        Tip: Click &ldquo;Edit&rdquo; on any account above and set its Role to &ldquo;Clerk&rdquo; first.
                      </span>
                    )}
                  </form>
                )
              })()}
              <div className="managed-list">
                {clerkAssignments.length === 0 ? (
                  <p className="form-note">No clerk-to-gardener assignments created yet.</p>
                ) : (
                  clerkAssignments.map((item) => (
                    <div className="managed-item" key={item.id}>
                      <div>
                        <strong>
                          Clerk: {item.clerk_name || `${item.clerk_first_name || ''} ${item.clerk_last_name || ''}`.trim()} ({item.clerk_email})
                          {' → '}
                          Gardener: {item.gardener_name || item.gardener_business_name || `${item.gardener_first_name || ''} ${item.gardener_last_name || ''}`.trim()}
                        </strong>
                        <span>
                          {item.notes || 'Authorized for schedule, crew capacity, services, and payment verifications.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="table-action table-action-danger"
                        disabled={clerkAssignBusy}
                        onClick={() => handleRemoveClerkAssignment(item.id)}
                      >
                        Unassign
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {deleteAccountTarget && (
              <div
                className="gateway-demo-backdrop"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-account-title"
                onClick={(e) => { if (e.target === e.currentTarget && !accountSaving) setDeleteAccountTarget(null) }}
              >
                <div className="gateway-demo-modal">
                  <p className="eyebrow" style={{ marginBottom: '4px' }}>Permanent action</p>
                  <h2 id="delete-account-title">Delete user account?</h2>
                  <p className="field-note">
                    Delete <strong>{deleteAccountTarget.first_name} {deleteAccountTarget.last_name}</strong> ({deleteAccountTarget.email})? This cannot be undone. Accounts with existing inquiries or bookings are protected and must be deactivated instead.
                  </p>
                  <div className="gateway-demo-actions">
                    <button type="button" className="button button-danger" disabled={accountSaving} onClick={confirmDeleteAccount}>
                      {accountSaving ? 'Deleting...' : 'Yes, delete account'}
                    </button>
                    <button type="button" className="table-action" disabled={accountSaving} onClick={() => setDeleteAccountTarget(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  )
}

export default function DashboardPage({ profileView = false }) {
  const { user } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const hashTab = location.hash?.startsWith('#admin-') ? location.hash.replace('#admin-', '') : ''
  const activeTab = resolveDashboardTab(searchParams.get('tab') || hashTab, profileView)
  const [profileData, setProfileData] = useState({ form: initialProfile, counts: {} })
  const [summary, setSummary] = useState({ counts: {}, users: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const target = document.getElementById(location.hash.slice(1))
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [location.hash, summary])

  useEffect(() => {
    if (user.role === 'administrator') {
      profileApi.adminSummary().then(setSummary).catch((loadError) => setError(loadError.message))
    } else if (user.role !== 'clerk') {
      profileApi.get().then((result) => {
        setProfileData({
          form: buildProfileForm(result, initialProfile),
          counts: result.counts || {},
        })
      }).catch((loadError) => setError(loadError.message))
    }
  }, [user.role])

  async function changeStatus(userId, isActive) {
    try {
      await profileApi.updateUserStatus(userId, isActive)
      setSummary((current) => ({ ...current, users: current.users.map((account) => account.id === userId ? { ...account, is_active: isActive } : account) }))
    } catch (statusError) { setError(statusError.message) }
  }

  function handleUserUpdated(updatedUser) {
    setSummary((current) => ({
      ...current,
      users: current.users.map((account) => (account.id === updatedUser.id ? updatedUser : account)),
    }))
  }

  function handleUserDeleted(deletedUserId) {
    setSummary((current) => ({
      ...current,
      users: current.users.filter((account) => account.id !== deletedUserId),
    }))
  }

  if (error) return <main className="dashboard-page"><AppSidebar /><section className="container dashboard-content"><div className="form-error" role="alert">{error}</div></section></main>
  if (user.role === 'administrator') return <AdminDashboard summary={summary} onStatusChange={changeStatus} onUserUpdated={handleUserUpdated} onUserDeleted={handleUserDeleted} activeTab={activeTab} />
  if (user.role === 'clerk') return <ClerkDashboard activeTab={activeTab} />
  return <UserDashboard user={user} profileData={profileData} activeTab={activeTab} onSaved={(result) => setProfileData((current) => ({ ...current, form: buildProfileForm(result, current.form) }))} />
}
