import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ImagePlus, Pencil, Save, Sparkles, Trash2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  buildProfileForm,
  initialProfile,
  profileApi,
  resolveDashboardTab,
} from '../services/profiles'
import { servicesApi } from '../services/services'
import { inquiriesApi } from '../services/inquiries'
import { communicationApi } from '../services/communication'
import { reviewsApi } from '../services/reviews'
import { authApi } from '../services/auth'
import {
  bookingsApi,
  formatBookingStatusLabel,
  formatStatusLabel,
  getStatusBadgeClass,
} from '../services/bookings'
import AppSidebar from '../components/AppSidebar'

function ProfileForm({ role, profile, userId, onSaved }) {
  const [form, setForm] = useState(profile)
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value })
  async function submit(event) {
    event.preventDefault()
    setSaving(true); setMessage(''); setError('')
    try {
      const result = await profileApi.update(form)
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
    <div className="form-row"><label>First name<input required value={form.firstName} onChange={change('firstName')} /></label><label>Last name<input required value={form.lastName} onChange={change('lastName')} /></label></div>
    <label>Middle name <span className="label-note">(optional)</span><input maxLength="100" value={form.middleName || ''} onChange={change('middleName')} /></label>
    <div className="form-row"><label>Phone<input value={form.phone || ''} onChange={change('phone')} /><span className="field-note">Optional</span></label><label>Email<input value={form.email || ''} disabled /><span className="field-note">Email cannot be changed here</span></label></div>
    {role === 'client' ? <><div className="form-row"><label>Address<input required value={form.address || ''} onChange={change('address')} /></label><label>City<input required value={form.city || ''} onChange={change('city')} /></label></div><label>About you<textarea value={form.bio || ''} onChange={change('bio')} rows="4" /></label></> : <><div className="form-row"><label>Business or display name<input value={form.businessName || ''} onChange={change('businessName')} /></label><label>Years of experience<input type="number" min="0" max="100" value={form.yearsOfExperience ?? ''} onChange={change('yearsOfExperience')} /></label></div><label>Service area<input required value={form.serviceArea || ''} onChange={change('serviceArea')} /></label><label>Professional description<textarea value={form.description || ''} onChange={change('description')} rows="4" /></label></>}
    <button className="button" type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving...' : 'Save profile'}</button>
  </form>
}

function ChangePasswordForm() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function change(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    setSaving(true)
    try {
      const result = await authApi.changePassword(form.currentPassword, form.newPassword)
      setMessage(result.message)
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="profile-form" onSubmit={submit}>
      {message && <div className="form-success" role="status">{message}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <label>
        Current password
        <input
          type="password"
          autoComplete="current-password"
          required
          value={form.currentPassword}
          onChange={change('currentPassword')}
        />
      </label>
      <div className="form-row">
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength="8"
            maxLength="72"
            required
            value={form.newPassword}
            onChange={change('newPassword')}
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            minLength="8"
            maxLength="72"
            required
            value={form.confirmPassword}
            onChange={change('confirmPassword')}
          />
        </label>
      </div>
      <span className="field-note">Use 8 to 72 characters. Your current password is required to make this change.</span>
      <button className="button" type="submit" disabled={saving}>
        {saving ? 'Changing password...' : 'Change password'}
      </button>
    </form>
  )
}

function Stats({ role, counts }) {
  const values = role === 'client'
    ? [['Inquiries', counts.inquiries], ['Bookings', counts.bookings], ['Notifications', counts.notifications]]
    : [['Services', counts.services], ['Inquiries', counts.inquiries], ['Bookings', counts.bookings]]
  return <div className="stat-grid">{values.map(([label, value], index) => <div className={`stat-card${index === 0 ? ' stat-card-primary' : ''}`} key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}</div>
}

function GardenerTools({ gardenerId, isApproved, section = 'services' }) {
  const emptyService = { title: '', description: '', categoryId: '', indicativePrice: '', priceUnit: '', serviceArea: 'Zamboanga City' }
  const [serviceForm, setServiceForm] = useState(emptyService)
  const [serviceImageFile, setServiceImageFile] = useState(null)
  const [serviceImageVersion, setServiceImageVersion] = useState(0)
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [portfolios, setPortfolios] = useState([])
  const [reviews, setReviews] = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
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

  useEffect(() => {
    if (section !== 'portfolio' || !gardenerId) return undefined

    let active = true
    reviewsApi.gardener(gardenerId)
      .then((result) => {
        if (active) setReviews(result.reviews || [])
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })
      .finally(() => {
        if (active) setReviewsLoading(false)
      })

    return () => { active = false }
  }, [gardenerId, section])

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

  const averageRating = reviews.length
    ? (reviews.reduce((total, review) => total + Number(review.rating), 0) / reviews.length).toFixed(1)
    : null

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
          <section className="portfolio-feedback-section">
            <div className="activity-heading">
              <div>
                <p className="eyebrow">Customer feedback</p>
                <h2>Reviews from your clients.</h2>
              </div>
              {averageRating && (
                <span className="portfolio-rating-summary">
                  ★ {averageRating} · {reviews.length} review{reviews.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {reviewsLoading && <div className="loading-state" role="status">Loading customer reviews<span /></div>}
            {!reviewsLoading && reviews.length === 0 && (
              <p className="form-note">Completed bookings can receive client feedback. Your reviews will appear here.</p>
            )}
            {!reviewsLoading && reviews.length > 0 && (
              <div className="review-list">
                {reviews.map((review) => (
                  <article className="review-card" key={review.id}>
                    <div className="review-heading">
                      <strong>{'★'.repeat(Number(review.rating))}{'☆'.repeat(5 - Number(review.rating))}</strong>
                      <span>{review.client_name}</span>
                    </div>
                    <p>{review.review_text || 'No written feedback provided.'}</p>
                    <small>{new Date(review.created_at).toLocaleDateString()}</small>
                  </article>
                ))}
              </div>
            )}
          </section>
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
          <label>Service area<input required value={serviceForm.serviceArea} onChange={serviceChange('serviceArea')} /></label>
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
                  <span>{service.category_name} · {service.is_active ? 'Active' : 'Inactive'}{service.is_active && !isApproved ? ' · Pending approval' : ''}</span>
                </div>
              </div>
              {service.is_active && (
                <div className="item-actions">
                  {service.image_path && (
                    <button type="button" className="table-action" onClick={() => removeServiceImage(service.id)}>Remove photo</button>
                  )}
                  <button type="button" aria-label={`Edit ${service.title}`} onClick={() => { setEditId(service.id); setServiceImageFile(null); setServiceForm({ title: service.title, description: service.description, categoryId: service.category_id, indicativePrice: service.indicative_price || '', priceUnit: service.price_unit || '', serviceArea: service.service_area }) }}><Pencil size={15} /></button>
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

function DashboardActivity({ role }) {
  const [inquiries, setInquiries] = useState([])
  const [bookings, setBookings] = useState([])
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      inquiriesApi.list(),
      bookingsApi.list(),
      communicationApi.notifications(),
    ])
      .then(([inquiryData, bookingData, notificationData]) => {
        setInquiries(inquiryData.inquiries)
        setBookings(bookingData.bookings)
        setNotifications(notificationData.notifications || [])
        setUnreadCount(notificationData.unreadCount || 0)
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false))
  }, [])

  const pendingInquiries = inquiries.filter((inquiry) =>
    ['open', 'responded', 'sent', 'pending'].includes(String(inquiry.status || '').toLowerCase())
  ).length
  const agreementCount = inquiries.filter((inquiry) =>
    ['provider_selected', 'in_agreement'].includes(String(inquiry.status || '').toLowerCase())
  ).length
  const upcomingBookings = bookings.filter((booking) =>
    ['pending', 'accepted', 'in_progress'].includes(String(booking.status || '').toLowerCase())
  )
  const sortedUpcomingBookings = [...upcomingBookings].sort((left, right) => {
    const leftTime = left.scheduled_start ? new Date(left.scheduled_start).getTime() : Number.MAX_SAFE_INTEGER
    const rightTime = right.scheduled_start ? new Date(right.scheduled_start).getTime() : Number.MAX_SAFE_INTEGER
    return leftTime - rightTime
  })
  const nextBooking = sortedUpcomingBookings[0]

  const agreementActions = inquiries.filter((inquiry) =>
    ['provider_selected', 'in_agreement'].includes(String(inquiry.status || '').toLowerCase())
  )
  const offerActions = inquiries.filter((inquiry) =>
    role === 'client'
      ? ['responded'].includes(String(inquiry.status || '').toLowerCase()) && Number(inquiry.offer_count) > 0
      : ['sent', 'pending'].includes(String(inquiry.status || '').toLowerCase())
  )
  const unreadNotifications = notifications.filter((notification) => !notification.read_at).slice(0, 3)

  return (
    <section className="dashboard-activity">
      <div className="dashboard-summary-strip">
        <Link className="dashboard-summary-card" to="/inquiries">
          <span>{role === 'gardener' ? 'Pending inquiries' : 'Pending requests'}</span>
          <strong>{loading ? '—' : pendingInquiries}</strong>
        </Link>
        <Link className="dashboard-summary-card" to="/inquiries">
          <span>Needs agreement</span>
          <strong>{loading ? '—' : agreementCount}</strong>
        </Link>
        <Link className="dashboard-summary-card" to="/bookings">
          <span>Active services</span>
          <strong>{loading ? '—' : upcomingBookings.length}</strong>
        </Link>
      </div>
      <div className="dashboard-overview-action-grid">
        <div className="dashboard-panel action-required-panel">
          <div className="activity-heading">
            <div>
              <p className="eyebrow">Priority</p>
              <h2>Action required.</h2>
            </div>
            <span className="panel-count">{loading ? '—' : agreementActions.length + offerActions.length + unreadCount}</span>
          </div>
          {loading && <div className="loading-state" role="status">Checking priorities<span /></div>}
          {!loading && agreementActions.length === 0 && offerActions.length === 0 && unreadCount === 0 && (
            <div className="action-required-empty">
              <strong>You are all caught up.</strong>
              <span>There are no agreements or offers that need action right now.</span>
            </div>
          )}
          {!loading && agreementActions.map((inquiry) => (
            <Link className="action-required-row" to={`/inquiries/${inquiry.id}`} key={`agreement-${inquiry.id}`}>
              <span>
                <strong>Review mutual agreement</strong>
                <small>{inquiry.subject}</small>
              </span>
              <span className={getStatusBadgeClass(inquiry.status)}>
                {formatStatusLabel(inquiry.status)}
              </span>
            </Link>
          ))}
          {!loading && offerActions.map((inquiry) => (
            <Link className="action-required-row" to={`/inquiries/${inquiry.id}`} key={`offer-${inquiry.id}`}>
              <span>
                <strong>{role === 'client' ? 'Compare or accept an offer' : 'Follow up on an offer'}</strong>
                <small>{inquiry.subject}</small>
              </span>
              <span className={getStatusBadgeClass(inquiry.status)}>
                {formatStatusLabel(inquiry.status)}
              </span>
            </Link>
          ))}
          {!loading && unreadCount > 0 && (
            <Link className="action-required-row" to="/notifications">
              <span>
                <strong>Review unread updates</strong>
                <small>{unreadCount} notification{unreadCount === 1 ? '' : 's'} may need your attention.</small>
              </span>
              <span className="inquiry-status status-pending">Unread</span>
            </Link>
          )}
        </div>

        <div className="dashboard-panel next-booking-panel">
          <div className="activity-heading">
            <div>
              <p className="eyebrow">Next service</p>
              <h2>Upcoming booking.</h2>
            </div>
            <Link className="text-link" to="/bookings">View all</Link>
          </div>
          {loading && <div className="loading-state" role="status">Loading schedule<span /></div>}
          {!loading && !nextBooking && (
            <div className="action-required-empty">
              <strong>No upcoming booking.</strong>
              <span>Confirmed bookings appear here after both parties approve an agreement.</span>
            </div>
          )}
          {!loading && nextBooking && (
            <Link className="next-booking-card" to={`/bookings/${nextBooking.id}`}>
              <strong>{nextBooking.service_title || 'Gardening service'}</strong>
              <span>{nextBooking.scheduled_start
                ? new Date(nextBooking.scheduled_start).toLocaleString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : 'Schedule to be confirmed'}
              </span>
              <small>{role === 'gardener' ? nextBooking.client_name : nextBooking.gardener_name}</small>
              <span className={getStatusBadgeClass(nextBooking.status)}>
                {formatBookingStatusLabel(nextBooking.status)}
              </span>
            </Link>
          )}
        </div>

        <div className="dashboard-panel unread-preview-panel">
          <div className="activity-heading">
            <div>
              <p className="eyebrow">Inbox</p>
              <h2>Unread notifications.</h2>
            </div>
            <Link className="text-link" to="/notifications">{unreadCount} unread</Link>
          </div>
          {loading && <div className="loading-state" role="status">Loading notifications<span /></div>}
          {!loading && unreadNotifications.length === 0 && (
            <div className="action-required-empty">
              <strong>No unread notifications.</strong>
              <span>New offers, agreements, and booking updates will appear here.</span>
            </div>
          )}
          {!loading && unreadNotifications.map((notification) => (
            <Link className="notification-preview-row" to="/notifications" key={notification.id}>
              <span className="notification-preview-dot" />
              <span>
                <strong>{notification.title}</strong>
                <small>{notification.message}</small>
              </span>
            </Link>
          ))}
        </div>
      </div>
      <div className="dashboard-panel">
        <div className="activity-heading">
          <div>
            <p className="eyebrow">{role === 'gardener' ? 'Requests & offers' : 'Requests, offers & agreements'}</p>
            <h2>{role === 'gardener' ? 'Client inquiries & offers.' : 'Your service requests.'}</h2>
          </div>
          <div className="inline-actions">
            {role === 'gardener' && (
              <Link className="text-link" to="/inquiries?tab=open">Open board</Link>
            )}
            <Link className="text-link" to="/inquiries">View all</Link>
          </div>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {loading && !error && <div className="loading-state" role="status">Loading activity<span /></div>}
        {!loading && !error && inquiries.length === 0 && (
          <p className="form-note">
            {role === 'gardener'
              ? 'No inquiries or submitted offers yet. Browse the open requests board to submit offers.'
              : 'No service requests yet. Start by exploring local services or posting a general request.'}
          </p>
        )}
        {!loading && inquiries.slice(0, 5).map((inquiry) => (
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
            <p className="eyebrow">Schedule</p>
            <h2>{role === 'gardener' ? 'Booking status.' : 'Upcoming bookings.'}</h2>
          </div>
          <Link className="text-link" to="/bookings">View all</Link>
        </div>
        {loading && !error && <div className="loading-state" role="status">Loading booking status<span /></div>}
        {!loading && !error && bookings.length === 0 && (
          <p className="form-note">
            No confirmed bookings yet. Bookings are created when both parties approve a mutual service agreement.
          </p>
        )}
        {!loading && bookings.slice(0, 5).map((booking) => (
          <Link className="activity-row" to={`/bookings/${booking.id}`} key={booking.id}>
            <span>
              <strong>{booking.service_title || 'Gardening service'}</strong>
              <small>
                {[
                  role === 'gardener' ? booking.client_name : booking.gardener_name,
                  booking.scheduled_start ? new Date(booking.scheduled_start).toLocaleString() : 'Schedule to be confirmed',
                ].filter(Boolean).join(' · ')}
              </small>
            </span>
            <span className={getStatusBadgeClass(booking.status)}>
              {formatBookingStatusLabel(booking.status)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function UserDashboard({ user, profileData, onSaved, activeTab }) {
  const role = user.role
  const roleLabel = role === 'gardener' ? 'Gardener' : 'Client'
  const counts = profileData.counts || {}
  const form = profileData.form || initialProfile
  const isProfileView = activeTab === 'profile'
  const displayName = role === 'gardener'
    ? (form.businessName || `${form.firstName || user.firstName} ${form.lastName || user.lastName}`.trim())
    : `${form.firstName || user.firstName} ${form.lastName || user.lastName}`.trim()
  const profileTasks = role === 'gardener'
    ? [
        { done: Boolean(form.avatarPath), label: 'Add a profile photo', to: '/dashboard?tab=profile' },
        { done: Boolean(form.description), label: 'Add a professional description', to: '/dashboard?tab=profile' },
        { done: Boolean(form.serviceArea), label: 'Confirm your service area', to: '/dashboard?tab=profile' },
        { done: counts.services > 0, label: 'Add an active service', to: '/dashboard?tab=services' },
      ]
    : [
        { done: Boolean(form.avatarPath), label: 'Add a profile photo', to: '/dashboard?tab=profile' },
        { done: Boolean(form.phone), label: 'Add a phone number', to: '/dashboard?tab=profile' },
        { done: Boolean(form.address), label: 'Confirm your address', to: '/dashboard?tab=profile' },
        { done: Boolean(form.bio), label: 'Add a short profile bio', to: '/dashboard?tab=profile' },
      ]
  const profileDoneCount = profileTasks.filter((task) => task.done).length
  const profileCompletion = Math.round((profileDoneCount / profileTasks.length) * 100)

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
            <h1>{isProfileView ? 'Profile & settings.' : activeTab === 'services' ? 'My services.' : activeTab === 'portfolio' ? 'Portfolio.' : `Welcome, ${user.firstName}.`}</h1>
            <p className="dashboard-lead" style={{ marginBottom: 0 }}>
              {isProfileView
                ? 'Review and update your contact details and public profile information.'
                : activeTab === 'services'
                  ? 'Create, edit, and manage the gardening services you offer.'
                  : activeTab === 'portfolio'
                    ? 'Showcase your completed garden projects to build client trust.'
                    : role === 'gardener'
                      ? 'Manage open client requests, submitted offers, mutual agreements, and bookings.'
                      : 'Track your service requests, compare provider offers, review mutual agreements, and manage upcoming bookings.'}
            </p>
          </div>
          {activeTab === 'overview' && (
            <div className="inline-actions dashboard-hero-actions">
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
                </>
              )}
            </div>
          )}
        </div>
        {role === 'gardener' && (
          <div className={`form-note ${form.is_approved ? 'form-success' : 'form-error'}`}>
            {form.is_approved
              ? 'Your gardener profile is approved and active services are visible publicly.'
              : 'Your gardener profile is waiting for administrator approval. Your active services are not public yet.'}
          </div>
        )}

        {isProfileView ? (
          <>
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
            <section className="dashboard-panel profile-settings-panel password-settings-panel">
              <div className="activity-heading">
                <div>
                  <p className="eyebrow">Account security</p>
                  <h2>Change your password.</h2>
                </div>
              </div>
              <ChangePasswordForm />
            </section>
          </>
        ) : role === 'gardener' && (activeTab === 'services' || activeTab === 'portfolio') ? (
          <GardenerTools gardenerId={user.id} isApproved={form.is_approved} section={activeTab} />
        ) : (
          <>
            <Stats role={role} counts={counts} />
            <div className="profile-completion-panel dashboard-panel">
              <div>
                <p className="eyebrow">Profile completion</p>
                <h2>{displayName || 'Your profile'}</h2>
              </div>
              <div className="profile-completion-progress" aria-label={`${profileCompletion}% profile completed`}>
                <span style={{ width: `${profileCompletion}%` }} />
              </div>
              <strong>{profileCompletion}% complete</strong>
              {profileTasks.filter((task) => !task.done).slice(0, 2).map((task) => (
                <Link className="profile-task-link" to={task.to} key={task.label}>
                  {task.label}
                </Link>
              ))}
              {profileCompletion === 100 && <span className="profile-complete-label">Your profile is complete.</span>}
            </div>
            <DashboardActivity role={role} />
          </>
        )}
      </section>
    </main>
  )
}

function AdminDashboard({ summary, onStatusChange, onUserUpdated, onUserDeleted, activeTab }) {
  const counts = summary.counts || {}
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [pendingGardeners, setPendingGardeners] = useState([])
  const [activity, setActivity] = useState({ inquiries: [], bookings: [] })
  const [reports, setReports] = useState([])
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' })
  const [editingAccount, setEditingAccount] = useState(null)
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
        lastName: editingAccount.lastName,
        phone: editingAccount.phone,
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

  async function handleDeleteAccount(account) {
    if (!window.confirm(`Delete account "${account.first_name} ${account.last_name}" (${account.email})? This cannot be undone.`)) return
    setAdminError(''); setAdminMessage('')
    try {
      await profileApi.adminDeleteUser(account.id)
      onUserDeleted(account.id)
      if (editingAccount?.id === account.id) setEditingAccount(null)
      setAdminMessage('Account deleted successfully.')
    } catch (deleteError) {
      setAdminError(deleteError.message)
    }
  }

  const loadAdminData = useCallback(() => Promise.all([
    profileApi.adminCategories(),
    profileApi.adminServices(),
    profileApi.adminActivity(),
    profileApi.adminReports(),
    profileApi.adminPendingGardeners(),
  ]).then(([categoryData, serviceData, activityData, reportData, gardenerData]) => {
    setCategories(categoryData.categories)
    setServices(serviceData.services)
    setActivity(activityData)
    setReports(reportData.reports)
    setPendingGardeners(gardenerData.gardeners)
  }).catch((error) => setAdminError(error.message)), [])

  useEffect(() => { loadAdminData() }, [loadAdminData])

  async function addCategory(event) { event.preventDefault(); try { await profileApi.createCategory(categoryForm); setCategoryForm({ name: '', description: '' }); loadAdminData() } catch (error) { setAdminError(error.message) } }
  async function toggleCategory(category) { try { await profileApi.updateCategory(category.id, { name: category.name, description: category.description, isActive: !category.is_active }); loadAdminData() } catch (error) { setAdminError(error.message) } }
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
                <div className="form-row">
                  <label>First name<input required value={editingAccount.firstName} onChange={(e) => setEditingAccount({ ...editingAccount, firstName: e.target.value })} /></label>
                  <label>Last name<input required value={editingAccount.lastName} onChange={(e) => setEditingAccount({ ...editingAccount, lastName: e.target.value })} /></label>
                </div>
                <div className="form-row">
                  <label>Phone<input value={editingAccount.phone} onChange={(e) => setEditingAccount({ ...editingAccount, phone: e.target.value })} /></label>
                  <label>
                    Role
                    <select value={editingAccount.role} onChange={(e) => setEditingAccount({ ...editingAccount, role: e.target.value })}>
                      <option value="client">Client</option>
                      <option value="gardener">Gardener</option>
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
                  {summary.users.map((account) => (
                    <tr key={account.id}>
                      <td>{account.first_name} {account.last_name}<small>{account.email}</small></td>
                      <td>{account.role}</td>
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
                              lastName: account.last_name,
                              phone: account.phone || '',
                              role: account.role,
                              isActive: Boolean(account.is_active),
                            })}
                          >
                            Edit
                          </button>
                          <button className="table-action" type="button" onClick={() => onStatusChange(account.id, !account.is_active)}>
                            {account.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button className="table-action table-action-danger" type="button" onClick={() => handleDeleteAccount(account)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
    } else {
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
  return <UserDashboard user={user} profileData={profileData} activeTab={activeTab} onSaved={(result) => setProfileData((current) => ({ ...current, form: buildProfileForm(result, current.form) }))} />
}
