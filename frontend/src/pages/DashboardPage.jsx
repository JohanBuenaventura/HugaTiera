import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Clock, ImagePlus, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import Drawer from '../components/Drawer'
import {
  buildProfileForm,
  initialProfile,
  profileApi,
  resolveDashboardTab,
} from '../services/profiles'
import { servicesApi } from '../services/services'
import { inquiriesApi } from '../services/inquiries'
import {
  bookingsApi,
  formatStatusLabel,
  getStatusBadgeClass,
} from '../services/bookings'
import AppSidebar from '../components/AppSidebar'

function ProfileForm({ role, profile, onSaved }) {
  const [form, setForm] = useState(profile)
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

  return <form className="profile-form" onSubmit={submit}>
    {message && <div className="form-success" role="status">{message}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="form-row">
      <label>First name<input required value={form.firstName} onChange={change('firstName')} /></label>
      <label>Last name<input required value={form.lastName} onChange={change('lastName')} /></label>
    </div>
    <div className="form-row">
      <label>Phone<input value={form.phone || ''} onChange={change('phone')} /><span className="field-note">Optional</span></label>
      <label>Email<input value={form.email || ''} disabled /><span className="field-note">Email cannot be changed here</span></label>
    </div>
    {role === 'client' ? <>
      <div className="form-row">
        <label>Address<input value={form.address || ''} onChange={change('address')} /></label>
        <label>City<input required value={form.city || ''} onChange={change('city')} /></label>
      </div>
      <label>About you<textarea value={form.bio || ''} onChange={change('bio')} rows="4" /></label>
    </> : <>
      <div className="form-row">
        <label>Business or display name<input value={form.businessName || ''} onChange={change('businessName')} /></label>
        <label>Years of experience<input type="number" min="0" max="100" value={form.yearsOfExperience ?? ''} onChange={change('yearsOfExperience')} /></label>
      </div>
      <label>Service area<input required value={form.serviceArea || ''} onChange={change('serviceArea')} /></label>
      <label>Professional description<textarea value={form.description || ''} onChange={change('description')} rows="4" /></label>
    </>}
    <div className="profile-actions">
      <button className="button" type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving...' : 'Save profile'}</button>
      <button className="button button-outline" type="button" onClick={() => setForm(profile)}>Cancel</button>
    </div>
  </form>
}

function GardenerTools({ isApproved }) {
  const emptyService = { title: '', description: '', categoryId: '', indicativePrice: '', priceUnit: '', serviceArea: 'Zamboanga City' }
  const [serviceForm, setServiceForm] = useState(emptyService)
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [portfolios, setPortfolios] = useState([])
  const [editId, setEditId] = useState(null)
  const [portfolioEditId, setPortfolioEditId] = useState(null)
  const [imageForm, setImageForm] = useState({ title: '', description: '', image: null })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [drawer, setDrawer] = useState(null)
  const imageInputRef = useRef(null)

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
  function openServiceDrawer(service = null) {
    setError('')
    if (service) {
      setEditId(service.id)
      setServiceForm({
        title: service.title,
        description: service.description,
        categoryId: service.category_id,
        indicativePrice: service.indicative_price || '',
        priceUnit: service.price_unit || '',
        serviceArea: service.service_area,
      })
    } else {
      setEditId(null)
      setServiceForm(emptyService)
    }
    setDrawer('service')
  }
  function openPortfolioDrawer(portfolio = null) {
    setError('')
    if (imageInputRef.current) imageInputRef.current.value = ''
    if (portfolio) {
      setPortfolioEditId(portfolio.id)
      setImageForm({ title: portfolio.title, description: portfolio.description || '', image: null })
    } else {
      setPortfolioEditId(null)
      setImageForm({ title: '', description: '', image: null })
    }
    setDrawer('portfolio')
  }
  function closeDrawer() {
    setDrawer(null)
    setEditId(null)
    setPortfolioEditId(null)
    setServiceForm(emptyService)
    setImageForm({ title: '', description: '', image: null })
    if (imageInputRef.current) imageInputRef.current.value = ''
    setError('')
  }
  function handleImageDrop(event) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (!file) return
    const transfer = new DataTransfer()
    transfer.items.add(file)
    if (imageInputRef.current) imageInputRef.current.files = transfer.files
    setImageForm((current) => ({ ...current, image: file }))
  }

  async function saveService(event) {
    event.preventDefault(); setMessage(''); setError('')
    try {
      if (editId) await servicesApi.update(editId, serviceForm)
      else await servicesApi.create(serviceForm)
      setServices((await servicesApi.mine()).services)
      setServiceForm(emptyService); setEditId(null); setMessage('Service listing saved.')
      setDrawer(null)
    } catch (saveError) { setError(saveError.message) }
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
        setDrawer(null)
      } else {
        const data = new FormData()
        data.append('title', imageForm.title); data.append('description', imageForm.description); data.append('image', imageForm.image)
        await servicesApi.addPortfolio(data)
        setPortfolios((await servicesApi.portfolios()).portfolios)
        setImageForm({ title: '', description: '', image: null })
        event.target.reset()
        setMessage('Portfolio image uploaded.')
        setDrawer(null)
      }
    } catch (uploadError) { setError(uploadError.message) }
  }
  async function removePortfolio(id) {
    try { await servicesApi.removePortfolio(id); setPortfolios((current) => current.filter((portfolio) => portfolio.id !== id)); setMessage('Portfolio entry removed.') } catch (removeError) { setError(removeError.message) }
  }

  return (
    <>
      {message && <div className="form-success" role="status">{message}</div>}
      {error && !drawer && <div className="form-error" role="alert">{error}</div>}
      <section className="gardener-tools" id="gardener-tools">
        <section className="dashboard-panel service-management-card">
          <div className="dashboard-card-heading">
            <h2>Your services</h2>
            <button className="button button-outline button-small" type="button" onClick={() => openServiceDrawer()}>
              <Plus size={16} /> Add a service
            </button>
          </div>
          <p className="form-note">
            {isApproved
              ? 'Your active services are visible in the public marketplace.'
              : 'Your services remain hidden until an administrator approves your profile.'}
          </p>
          {services.length === 0 && <p className="form-note">You have not added any services yet.</p>}
          <div className="managed-list">
            {services.map((service) => (
              <div className={`managed-item ${service.is_active ? '' : 'is-inactive'}`} key={service.id}>
                <div>
                  <strong>{service.title}</strong>
                  <span>{service.category_name} · {service.is_active ? 'Active' : 'Inactive'}{service.is_active && !isApproved ? ' · Pending approval' : ''}</span>
                </div>
                {service.is_active && (
                  <div className="item-actions">
                    <button className="edit-action" type="button" aria-label={`Edit ${service.title}`} onClick={() => openServiceDrawer(service)}>
                      <Pencil size={16} />
                    </button>
                    <button type="button" aria-label={`Deactivate ${service.title}`} onClick={() => removeService(service.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-panel portfolio-management-card">
          <div className="dashboard-card-heading">
            <h2>Portfolio</h2>
            <button className="button button-outline button-small" type="button" onClick={() => openPortfolioDrawer()}>
              <Plus size={16} /> Add project
            </button>
          </div>
          {portfolios.length === 0 ? (
            <button className="portfolio-add-tile" type="button" onClick={() => openPortfolioDrawer()}>
              <ImagePlus size={20} />
              <span>Add your first project photo</span>
              <small>JPEG, PNG or WebP, up to 5 MB</small>
            </button>
          ) : (
            <div className="portfolio-list">
              {portfolios.map((portfolio) => (
                <div className="portfolio-item" key={portfolio.id}>
                  <img src={servicesApi.imageUrl(portfolio.id)} alt="" />
                  <div>
                    <strong>{portfolio.title}</strong>
                    <span>{portfolio.description || 'No description'}</span>
                  </div>
                  <div className="item-actions">
                    <button className="edit-action" type="button" aria-label={`Edit ${portfolio.title}`} onClick={() => openPortfolioDrawer(portfolio)}>
                      <Pencil size={16} />
                    </button>
                    <button type="button" aria-label={`Remove ${portfolio.title}`} onClick={() => removePortfolio(portfolio.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

      <Drawer
        open={drawer === 'service'}
        title={editId ? 'Edit service' : 'Add a service'}
        description="Describe the service you offer to local clients."
        onClose={closeDrawer}
      >
        {error && <div className="drawer-error form-error" role="alert">{error}</div>}
        <form className="profile-form drawer-form" onSubmit={saveService}>
          <div className="drawer-body">
            <label>Title<input required value={serviceForm.title} onChange={serviceChange('title')} /></label>
            <label>Category
              <select required value={serviceForm.categoryId} onChange={serviceChange('categoryId')}>
                <option value="">Choose a category</option>
                {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label>Description<textarea required rows="4" value={serviceForm.description} onChange={serviceChange('description')} /></label>
            <div className="form-row">
              <label>Indicative price<input type="number" min="0" step="0.01" value={serviceForm.indicativePrice} onChange={serviceChange('indicativePrice')} /><span className="field-note">Optional</span></label>
              <label>Price unit<input placeholder="per visit, per sqm..." value={serviceForm.priceUnit} onChange={serviceChange('priceUnit')} /></label>
            </div>
            <label>Service area<input required value={serviceForm.serviceArea} onChange={serviceChange('serviceArea')} /></label>
          </div>
          <footer className="drawer-footer">
            <button className="button" type="submit">{editId ? 'Save service' : 'Publish service'}</button>
            <button className="button button-outline" type="button" onClick={closeDrawer}>Cancel</button>
          </footer>
        </form>
      </Drawer>

      <Drawer
        open={drawer === 'portfolio'}
        title={portfolioEditId ? 'Edit project' : 'Add a project'}
        description="Share a photo and details about your previous gardening work."
        onClose={closeDrawer}
      >
        {error && <div className="drawer-error form-error" role="alert">{error}</div>}
        <form className="profile-form drawer-form" onSubmit={savePortfolio}>
          <div className="drawer-body">
            <label>Title<input required value={imageForm.title} onChange={(event) => setImageForm({ ...imageForm, title: event.target.value })} /></label>
            <label>Description<textarea rows="4" value={imageForm.description} onChange={(event) => setImageForm({ ...imageForm, description: event.target.value })} /></label>
            {!portfolioEditId && (
              <label>Image
                <span className="drawer-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleImageDrop}>
                  <ImagePlus size={22} />
                  <span>Choose a file or drag it here</span>
                  <small>JPEG, PNG or WebP, up to 5 MB</small>
                  <input ref={imageInputRef} required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageForm({ ...imageForm, image: event.target.files[0] })} />
                </span>
              </label>
            )}
          </div>
          <footer className="drawer-footer">
            <button className="button" type="submit">{portfolioEditId ? 'Save project' : 'Add to portfolio'}</button>
            <button className="button button-outline" type="button" onClick={closeDrawer}>Cancel</button>
          </footer>
        </form>
      </Drawer>
    </>
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
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([inquiriesApi.list(), bookingsApi.list()])
      .then(([inquiryData, bookingData]) => {
        setInquiries(inquiryData.inquiries.slice(0, 5))
        setBookings(bookingData.bookings.slice(0, 5))
      })
      .catch((loadError) => setError(loadError.message))
  }, [])

  return (
    <section className="dashboard-activity">
      <div className="activity-column">
        <div className="activity-heading">
          <h2>{role === 'gardener' ? 'Inquiries & offers' : 'Your service requests'}</h2>
          <Link className="text-link" to={role === 'gardener' ? '/inquiries?tab=open' : '/inquiries'}>
            {role === 'gardener' ? 'Open requests board' : 'View inquiries'}
          </Link>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        {!error && inquiries.length === 0 && (
          <p className="form-note">
            {role === 'gardener'
              ? 'No inquiries or offers yet. Browse open requests to find your next project.'
              : 'You have no service requests yet.'}
          </p>
        )}
        {inquiries.map((inquiry) => (
          <Link className="activity-row" to={`/inquiries/${inquiry.id}`} key={inquiry.id}>
            <span>
              <strong>{inquiry.subject}</strong>
              <small>{formatInquirySubtitle(inquiry, role)}</small>
            </span>
            <span className={getStatusBadgeClass(inquiry.status)}>{formatStatusLabel(inquiry.status)}</span>
          </Link>
        ))}
      </div>
      <div className="activity-column">
        <div className="activity-heading">
          <h2>{role === 'gardener' ? 'Bookings' : 'Upcoming bookings'}</h2>
          <Link className="text-link" to="/bookings">View bookings</Link>
        </div>
        {!error && bookings.length === 0 && (
          <p className="form-note">
            {role === 'gardener' ? 'No booking requests yet.' : 'No upcoming bookings.'}
          </p>
        )}
        {bookings.map((booking) => (
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
            <span className={getStatusBadgeClass(booking.status)}>{formatStatusLabel(booking.status)}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function UserDashboard({ user, profileData, onSaved, activeTab }) {
  const role = user.role
  const form = profileData.form || initialProfile
  const isProfileView = activeTab === 'profile'
  const displayName = `${form.firstName || user.firstName} ${form.lastName || user.lastName}`.trim()

  return (
    <main className="dashboard-page">
      <AppSidebar />
      <section className="container dashboard-content">
        <h1>{isProfileView ? 'Profile & settings' : role === 'gardener' ? `Welcome back, ${user.firstName}` : `Welcome, ${displayName || user.firstName}`}</h1>
        {isProfileView ? (
          <div className="profile-page-content">
            {role === 'gardener' && !form.is_approved && (
              <div className="gardener-approval-notice">
                <Clock size={18} aria-hidden="true" />
                <span>Your profile is waiting for approval.</span>
              </div>
            )}
            <section className="dashboard-panel profile-settings-panel">
              <h2>Your details</h2>
            <ProfileForm key={`${form.id || user.id}-${form.email || ''}-${form.businessName || ''}`} role={role} profile={form} onSaved={onSaved} />
            </section>
          </div>
        ) : (
          <>
            {role === 'client' ? (
              <section className="next-action-band">
                <div className="next-action-copy">
                  <h2>Start a garden project</h2>
                  <p>Browse local services, or post a request with photos to compare offers from gardeners.</p>
                </div>
                <div className="next-action-actions">
                  <Link className="button" to="/inquiries/new?type=general">Post general request</Link>
                  <Link className="button button-outline" to="/services">Explore services</Link>
                </div>
              </section>
            ) : !form.is_approved ? (
              <section className="next-action-band gardener-pending-band">
                <div className="next-action-copy">
                  <h2>Your profile is waiting for approval</h2>
                  <p>Your service stays hidden from clients until an admin approves it. Add a professional description to finish your profile.</p>
                </div>
                <div className="next-action-actions">
                  <Link className="button" to="/dashboard?tab=profile">Finish profile</Link>
                </div>
              </section>
            ) : null}
            <DashboardActivity role={role} />
            {role === 'gardener' && (
              <GardenerTools isApproved={form.is_approved} />
            )}
          </>
        )}
      </section>
    </main>
  )
}

function AdminDashboard({ summary, onStatusChange }) {
  const counts = summary.counts || {}
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [pendingGardeners, setPendingGardeners] = useState([])
  const [activity, setActivity] = useState({ inquiries: [], bookings: [] })
  const [reports, setReports] = useState([])
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' })
  const [adminError, setAdminError] = useState('')
  const [adminMessage, setAdminMessage] = useState('')
  const [approvalInProgress, setApprovalInProgress] = useState(null)
  const loadAdminData = useCallback(() => Promise.all([profileApi.adminCategories(), profileApi.adminServices(), profileApi.adminActivity(), profileApi.adminReports(), profileApi.adminPendingGardeners()]).then(([categoryData, serviceData, activityData, reportData, gardenerData]) => { setCategories(categoryData.categories); setServices(serviceData.services); setActivity(activityData); setReports(reportData.reports); setPendingGardeners(gardenerData.gardeners) }).catch((error) => setAdminError(error.message)), [])
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
  return <main className="dashboard-page"><AppSidebar /><section className="container dashboard-content"><p className="eyebrow">Administrator dashboard</p><h1>Platform overview.</h1><p className="dashboard-lead">Monitor accounts, marketplace content, reports, and platform activity.</p><div className="stat-grid admin-stats">{[['Clients', counts.clients], ['Gardeners', counts.gardeners], ['Pending gardeners', counts.pending_gardeners], ['Services', counts.services], ['Bookings', counts.bookings], ['Open reports', counts.open_reports]].map(([label, value]) => <div className="stat-card" key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}</div>{adminError && <div className="form-error" role="alert">{adminError}</div>}{adminMessage && <div className="form-success" role="status">{adminMessage}</div>}  <section className="admin-management-grid" id="admin-approvals"><section className="dashboard-panel"><p className="eyebrow">Gardener approval</p><h2>Review pending gardeners</h2>{pendingGardeners.length === 0 && <p className="form-note">No gardener profiles are waiting for approval.</p>}<div className="admin-item-list">{pendingGardeners.map((gardener) => <div className="admin-item" key={gardener.id}><span><strong>{gardener.business_name || `${gardener.first_name} ${gardener.last_name}`}</strong><small>{gardener.first_name} {gardener.last_name} · {gardener.service_area}</small></span><div className="inline-actions"><button className="button" type="button" disabled={approvalInProgress === gardener.id} onClick={() => updateGardenerApproval(gardener.id, true)}>{approvalInProgress === gardener.id ? 'Saving...' : 'Approve'}</button><button className="table-action" type="button" disabled={approvalInProgress === gardener.id} onClick={() => updateGardenerApproval(gardener.id, false)}>Request changes</button></div></div>)}</div></section><section className="dashboard-panel"><p className="eyebrow">Categories</p><h2>Manage service categories</h2><form className="profile-form admin-category-form" onSubmit={addCategory}><input required placeholder="Category name" value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /><input placeholder="Description" value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} /><button className="button" type="submit">Add category</button></form><div className="admin-item-list">{categories.map((category) => <div className="admin-item" key={category.id}><span><strong>{category.name}</strong><small>{category.is_active ? 'Active' : 'Inactive'}</small></span><button className="table-action" type="button" onClick={() => toggleCategory(category)}>{category.is_active ? 'Deactivate' : 'Activate'}</button></div>)}</div></section><section className="dashboard-panel"><p className="eyebrow">Service listings</p><h2>Monitor marketplace content</h2><div className="admin-item-list">{services.map((service) => <div className="admin-item" key={service.id}><span><strong>{service.title}</strong><small>{service.gardener_name} · {service.is_active ? 'Active' : 'Inactive'}</small></span><button className="table-action" type="button" onClick={() => toggleService(service)}>{service.is_active ? 'Deactivate' : 'Activate'}</button></div>)}</div></section></section><section className="dashboard-panel user-management" id="admin-activity"><p className="eyebrow">Activity</p><h2>Inquiries and bookings</h2><div className="admin-activity-grid"><div><h3>Recent inquiries</h3>{activity.inquiries.slice(0, 8).map((item) => <p className="admin-activity-row" key={item.id}><strong>{item.subject}</strong><span>{item.client_name} → {item.gardener_name} · {formatStatusLabel(item.status)}</span></p>)}</div><div><h3>Recent bookings</h3>{activity.bookings.slice(0, 8).map((item) => <p className="admin-activity-row" key={item.id}><strong>{item.service_title || 'Service booking'}</strong><span>{item.client_name} → {item.gardener_name} · {formatStatusLabel(item.status)}</span></p>)}</div></div></section><section className="dashboard-panel user-management" id="admin-reports"><p className="eyebrow">Reports</p><h2>Review reported content</h2><div className="admin-item-list">{reports.length === 0 && <p className="form-note">No reports have been submitted.</p>}{reports.map((report) => <div className="admin-item admin-report" key={report.id}><span><strong>{report.reason}</strong><small>{report.reporter_name} · {report.status}</small>{report.details && <em>{report.details}</em>}</span><select value={report.status} onChange={(event) => updateReport(report.id, event.target.value)}><option value="open" disabled>Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></div>)}</div></section><section className="dashboard-panel user-management" id="admin-accounts"><p className="eyebrow">Account management</p><h2>Recent accounts</h2><div className="user-table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{summary.users.map((account) => <tr key={account.id}><td>{account.first_name} {account.last_name}<small>{account.email}</small></td><td>{account.role}</td><td><span className={account.is_active ? 'status-active' : 'status-inactive'}>{account.is_active ? 'Active' : 'Inactive'}</span></td><td><button className="table-action" type="button" onClick={() => onStatusChange(account.id, !account.is_active)}>{account.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div></section></section></main>
}

export default function DashboardPage({ profileView = false }) {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const activeTab = resolveDashboardTab(searchParams.get('tab'), profileView)
  const [profileData, setProfileData] = useState({ form: initialProfile })
  const [summary, setSummary] = useState({ counts: {}, users: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    if (user.role === 'administrator') {
      profileApi.adminSummary().then(setSummary).catch((loadError) => setError(loadError.message))
    } else {
      profileApi.get().then((result) => {
        setProfileData({
          form: buildProfileForm(result, initialProfile),
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

  if (error) return <main className="dashboard-page"><AppSidebar /><section className="container dashboard-content"><div className="form-error" role="alert">{error}</div></section></main>
  if (user.role === 'administrator') return <AdminDashboard summary={summary} onStatusChange={changeStatus} />
  return <UserDashboard user={user} profileData={profileData} activeTab={activeTab} onSaved={(result) => setProfileData((current) => ({ ...current, form: buildProfileForm(result, current.form) }))} />
}
