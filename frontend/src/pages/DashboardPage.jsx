import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ImagePlus, Leaf, LogOut, Pencil, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { profileApi } from '../services/profiles'
import { servicesApi } from '../services/services'
import { inquiriesApi } from '../services/inquiries'
import { bookingsApi } from '../services/bookings'
import { communicationApi } from '../services/communication'

const initialProfile = {
  firstName: '', lastName: '', phone: '', address: '', city: 'Zamboanga City',
  bio: '', businessName: '', description: '', serviceArea: 'Zamboanga City', yearsOfExperience: '',
}

function Header({ onLogout, unreadCounts = {} }) {
  const badge = (count) => count > 0 && <b className="notification-badge">{count}</b>
  return <header className="dashboard-header container"><Link className="brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link><nav className="dashboard-nav"><Link to="/inquiries">Inquiries {badge(unreadCounts.inquiries)}</Link><Link to="/messages">Messages {badge(unreadCounts.messages)}</Link><Link to="/bookings">Bookings {badge(unreadCounts.bookings)}</Link></nav><button className="logout-button" type="button" onClick={onLogout}><LogOut size={16} /> Log out</button></header>
}

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
    <div className="form-row"><label>First name<input required value={form.firstName} onChange={change('firstName')} /></label><label>Last name<input required value={form.lastName} onChange={change('lastName')} /></label></div>
    <div className="form-row"><label>Phone<input value={form.phone || ''} onChange={change('phone')} /><span className="field-note">Optional</span></label><label>Email<input value={form.email || ''} disabled /><span className="field-note">Email cannot be changed here</span></label></div>
    {role === 'client' ? <><div className="form-row"><label>Address<input value={form.address || ''} onChange={change('address')} /></label><label>City<input required value={form.city || ''} onChange={change('city')} /></label></div><label>About you<textarea value={form.bio || ''} onChange={change('bio')} rows="4" /></label></> : <><div className="form-row"><label>Business or display name<input value={form.businessName || ''} onChange={change('businessName')} /></label><label>Years of experience<input type="number" min="0" max="100" value={form.yearsOfExperience ?? ''} onChange={change('yearsOfExperience')} /></label></div><label>Service area<input required value={form.serviceArea || ''} onChange={change('serviceArea')} /></label><label>Professional description<textarea value={form.description || ''} onChange={change('description')} rows="4" /></label></>}
    <button className="button" type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving...' : 'Save profile'}</button>
  </form>
}

function Stats({ role, counts }) {
  const values = role === 'client'
    ? [['Inquiries', counts.inquiries], ['Bookings', counts.bookings], ['Notifications', counts.notifications]]
    : [['Services', counts.services], ['Inquiries', counts.inquiries], ['Bookings', counts.bookings]]
  return <div className="stat-grid">{values.map(([label, value]) => <div className="stat-card" key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}</div>
}

function GardenerTools({ isApproved }) {
  const emptyService = { title: '', description: '', categoryId: '', indicativePrice: '', priceUnit: '', serviceArea: 'Zamboanga City' }
  const [serviceForm, setServiceForm] = useState(emptyService)
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [portfolios, setPortfolios] = useState([])
  const [editId, setEditId] = useState(null)
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
      if (editId) await servicesApi.update(editId, serviceForm)
      else await servicesApi.create(serviceForm)
      setServices((await servicesApi.mine()).services)
      setServiceForm(emptyService); setEditId(null); setMessage('Service listing saved.')
    } catch (saveError) { setError(saveError.message) }
  }
  async function removeService(id) {
    try { await servicesApi.remove(id); setServices((current) => current.map((service) => service.id === id ? { ...service, is_active: 0 } : service)); setMessage('Service listing deactivated.') } catch (removeError) { setError(removeError.message) }
  }
  async function addPortfolio(event) {
    event.preventDefault(); setMessage(''); setError('')
    const data = new FormData()
    data.append('title', imageForm.title); data.append('description', imageForm.description); data.append('image', imageForm.image)
    try { await servicesApi.addPortfolio(data); setPortfolios((await servicesApi.portfolios()).portfolios); setImageForm({ title: '', description: '', image: null }); event.target.reset(); setMessage('Portfolio image uploaded.') } catch (uploadError) { setError(uploadError.message) }
  }
  async function removePortfolio(id) {
    try { await servicesApi.removePortfolio(id); setPortfolios((current) => current.filter((portfolio) => portfolio.id !== id)); setMessage('Portfolio entry removed.') } catch (removeError) { setError(removeError.message) }
  }

  return <section className="gardener-tools"><div className="dashboard-panel"><p className="eyebrow">Service listings</p><h2>{editId ? 'Edit a service.' : 'Add a service.'}</h2><p className="field-note">{isApproved ? 'Your active services are visible in the public marketplace.' : 'Your services are saved, but they will remain hidden until an administrator approves your gardener profile.'}</p>{message && <div className="form-success" role="status">{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}<form className="profile-form" onSubmit={saveService}><div className="form-row"><label>Title<input required value={serviceForm.title} onChange={serviceChange('title')} /></label><label>Category<select required value={serviceForm.categoryId} onChange={serviceChange('categoryId')}><option value="">Choose a category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div><label>Description<textarea required rows="3" value={serviceForm.description} onChange={serviceChange('description')} /></label><div className="form-row"><label>Indicative price<input type="number" min="0" step="0.01" value={serviceForm.indicativePrice} onChange={serviceChange('indicativePrice')} /><span className="field-note">Optional</span></label><label>Price unit<input placeholder="per visit, per sqm..." value={serviceForm.priceUnit} onChange={serviceChange('priceUnit')} /></label></div><label>Service area<input required value={serviceForm.serviceArea} onChange={serviceChange('serviceArea')} /></label><div className="inline-actions"><button className="button" type="submit"><Save size={16} />{editId ? 'Update service' : 'Publish service'}</button>{editId && <button className="table-action" type="button" onClick={() => { setEditId(null); setServiceForm(emptyService) }}>Cancel edit</button>}</div></form><div className="managed-list">{services.map((service) => <div className={`managed-item ${service.is_active ? '' : 'is-inactive'}`} key={service.id}><div><strong>{service.title}</strong><span>{service.category_name} · {service.is_active ? 'Active' : 'Inactive'}{service.is_active && !isApproved ? ' · Pending approval' : ''}</span></div>{service.is_active && <div className="item-actions"><button type="button" aria-label={`Edit ${service.title}`} onClick={() => { setEditId(service.id); setServiceForm({ title: service.title, description: service.description, categoryId: service.category_id, indicativePrice: service.indicative_price || '', priceUnit: service.price_unit || '', serviceArea: service.service_area }) }}><Pencil size={15} /></button><button type="button" aria-label={`Deactivate ${service.title}`} onClick={() => removeService(service.id)}><Trash2 size={15} /></button></div>}</div>)}</div></div><div className="dashboard-panel"><p className="eyebrow">Portfolio</p><h2>Show your previous work.</h2><form className="profile-form" onSubmit={addPortfolio}><label>Title<input required value={imageForm.title} onChange={(event) => setImageForm({ ...imageForm, title: event.target.value })} /></label><label>Description<textarea rows="2" value={imageForm.description} onChange={(event) => setImageForm({ ...imageForm, description: event.target.value })} /></label><label>Image<input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageForm({ ...imageForm, image: event.target.files[0] })} /><span className="field-note">JPEG, PNG, or WebP up to 5 MB</span></label><button className="button" type="submit"><ImagePlus size={16} />Upload portfolio image</button></form><div className="portfolio-list">{portfolios.map((portfolio) => <div className="portfolio-item" key={portfolio.id}><img src={servicesApi.imageUrl(portfolio.id)} alt="" /><div><strong>{portfolio.title}</strong><span>{portfolio.description || 'No description'}</span></div><button type="button" aria-label={`Remove ${portfolio.title}`} onClick={() => removePortfolio(portfolio.id)}><Trash2 size={15} /></button></div>)}</div></div></section>
}

function DashboardActivity({ role }) {
  const [inquiries, setInquiries] = useState([])
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([inquiriesApi.list(), bookingsApi.list()])
      .then(([inquiryData, bookingData]) => {
        setInquiries(inquiryData.inquiries.slice(0, 4))
        setBookings(bookingData.bookings.slice(0, 4))
      })
      .catch((loadError) => setError(loadError.message))
  }, [])

  return <section className="dashboard-activity"><div className="dashboard-panel"><div className="activity-heading"><div><p className="eyebrow">Recent work</p><h2>{role === 'gardener' ? 'Client inquiries.' : 'Your inquiries.'}</h2></div><Link className="text-link" to="/inquiries">View all</Link></div>{error && <div className="form-error" role="alert">{error}</div>}{!error && inquiries.length === 0 && <p className="form-note">No inquiries yet. Start by exploring local services.</p>}{inquiries.map((inquiry) => <Link className="activity-row" to={`/inquiries/${inquiry.id}`} key={inquiry.id}><span><strong>{inquiry.subject}</strong><small>{inquiry.service_title || 'Service inquiry'}</small></span><span className={`inquiry-status status-${inquiry.status}`}>{inquiry.status}</span></Link>)}</div><div className="dashboard-panel"><div className="activity-heading"><div><p className="eyebrow">Schedule</p><h2>{role === 'gardener' ? 'Booking requests.' : 'Upcoming bookings.'}</h2></div><Link className="text-link" to="/bookings">View all</Link></div>{!error && bookings.length === 0 && <p className="form-note">No bookings yet. Accepted quotations can become booking requests.</p>}{bookings.map((booking) => <Link className="activity-row" to={`/bookings/${booking.id}`} key={booking.id}><span><strong>{booking.service_title || 'Gardening service'}</strong><small>{booking.scheduled_start ? new Date(booking.scheduled_start).toLocaleString() : 'Schedule to be confirmed'}</small></span><span className={`inquiry-status status-${booking.status}`}>{booking.status.replace('_', ' ')}</span></Link>)}</div></section>
}

function UserDashboard({ user, profileData, onSaved, onLogout, unreadCounts }) {
  const role = user.role
  const roleLabel = role === 'gardener' ? 'Gardener' : 'Client'
  const counts = profileData.counts || {}
  return <main className="dashboard-page"><Header onLogout={onLogout} unreadCounts={unreadCounts} /><section className="container dashboard-content"><p className="eyebrow">{roleLabel} dashboard</p><h1>Welcome, {user.firstName}.</h1><p className="dashboard-lead">{role === 'gardener' ? 'Keep your professional information ready for clients looking for local gardening help.' : 'Keep your profile up to date as you discover services and start conversations.'}</p>{role === 'gardener' && <div className={`form-note ${profileData.form.is_approved ? 'form-success' : 'form-error'}`}>{profileData.form.is_approved ? 'Your gardener profile is approved and active services are visible publicly.' : 'Your gardener profile is waiting for administrator approval. Your active services are not public yet.'}</div>}<Stats role={role} counts={counts} /><div className="dashboard-grid"><section className="dashboard-panel"><p className="eyebrow">Your profile</p><h2>Tell people a little more.</h2><ProfileForm role={role} profile={profileData.form} onSaved={onSaved} /></section><aside className="dashboard-panel dashboard-next"><p className="eyebrow">{role === 'gardener' ? 'Your public presence' : 'Your next step'}</p><h2>{role === 'gardener' ? 'Build trust locally.' : 'Find your next garden project.'}</h2><p>{role === 'gardener' ? 'Add clear services and examples of your previous work below.' : 'Browse local services and start an inquiry when you find a good fit.'}</p>{role === 'client' && <Link className="button" to="/services">Explore services</Link>}{role === 'gardener' && <Link className="button" to="/inquiries">View inquiries</Link>}</aside></div><DashboardActivity role={role} />{role === 'gardener' && <GardenerTools isApproved={profileData.form.is_approved} />}</section></main>
}

function AdminDashboard({ summary, onStatusChange, onLogout, unreadCounts }) {
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
  return <main className="dashboard-page"><Header onLogout={onLogout} unreadCounts={unreadCounts} /><section className="container dashboard-content"><p className="eyebrow">Administrator dashboard</p><h1>Platform overview.</h1><p className="dashboard-lead">Monitor accounts, marketplace content, reports, and platform activity.</p><div className="stat-grid admin-stats">{[['Clients', counts.clients], ['Gardeners', counts.gardeners], ['Pending gardeners', counts.pending_gardeners], ['Services', counts.services], ['Bookings', counts.bookings], ['Open reports', counts.open_reports]].map(([label, value]) => <div className="stat-card" key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}</div>{adminError && <div className="form-error" role="alert">{adminError}</div>}{adminMessage && <div className="form-success" role="status">{adminMessage}</div>}  <section className="admin-management-grid"><section className="dashboard-panel"><p className="eyebrow">Gardener approval</p><h2>Review pending gardeners</h2>{pendingGardeners.length === 0 && <p className="form-note">No gardener profiles are waiting for approval.</p>}<div className="admin-item-list">{pendingGardeners.map((gardener) => <div className="admin-item" key={gardener.id}><span><strong>{gardener.business_name || `${gardener.first_name} ${gardener.last_name}`}</strong><small>{gardener.first_name} {gardener.last_name} · {gardener.service_area}</small></span><div className="inline-actions"><button className="button" type="button" disabled={approvalInProgress === gardener.id} onClick={() => updateGardenerApproval(gardener.id, true)}>{approvalInProgress === gardener.id ? 'Saving...' : 'Approve'}</button><button className="table-action" type="button" disabled={approvalInProgress === gardener.id} onClick={() => updateGardenerApproval(gardener.id, false)}>Request changes</button></div></div>)}</div></section><section className="dashboard-panel"><p className="eyebrow">Categories</p><h2>Manage service categories</h2><form className="profile-form admin-category-form" onSubmit={addCategory}><input required placeholder="Category name" value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /><input placeholder="Description" value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} /><button className="button" type="submit">Add category</button></form><div className="admin-item-list">{categories.map((category) => <div className="admin-item" key={category.id}><span><strong>{category.name}</strong><small>{category.is_active ? 'Active' : 'Inactive'}</small></span><button className="table-action" type="button" onClick={() => toggleCategory(category)}>{category.is_active ? 'Deactivate' : 'Activate'}</button></div>)}</div></section><section className="dashboard-panel"><p className="eyebrow">Service listings</p><h2>Monitor marketplace content</h2><div className="admin-item-list">{services.map((service) => <div className="admin-item" key={service.id}><span><strong>{service.title}</strong><small>{service.gardener_name} · {service.is_active ? 'Active' : 'Inactive'}</small></span><button className="table-action" type="button" onClick={() => toggleService(service)}>{service.is_active ? 'Deactivate' : 'Activate'}</button></div>)}</div></section></section><section className="dashboard-panel user-management"><p className="eyebrow">Activity</p><h2>Inquiries and bookings</h2><div className="admin-activity-grid"><div><h3>Recent inquiries</h3>{activity.inquiries.slice(0, 8).map((item) => <p className="admin-activity-row" key={item.id}><strong>{item.subject}</strong><span>{item.client_name} → {item.gardener_name} · {item.status}</span></p>)}</div><div><h3>Recent bookings</h3>{activity.bookings.slice(0, 8).map((item) => <p className="admin-activity-row" key={item.id}><strong>{item.service_title || 'Service booking'}</strong><span>{item.client_name} → {item.gardener_name} · {item.status}</span></p>)}</div></div></section><section className="dashboard-panel user-management"><p className="eyebrow">Reports</p><h2>Review reported content</h2><div className="admin-item-list">{reports.length === 0 && <p className="form-note">No reports have been submitted.</p>}{reports.map((report) => <div className="admin-item admin-report" key={report.id}><span><strong>{report.reason}</strong><small>{report.reporter_name} · {report.status}</small>{report.details && <em>{report.details}</em>}</span><select value={report.status} onChange={(event) => updateReport(report.id, event.target.value)}><option value="open" disabled>Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></div>)}</div></section><section className="dashboard-panel user-management"><p className="eyebrow">Account management</p><h2>Recent accounts</h2><div className="user-table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{summary.users.map((account) => <tr key={account.id}><td>{account.first_name} {account.last_name}<small>{account.email}</small></td><td>{account.role}</td><td><span className={account.is_active ? 'status-active' : 'status-inactive'}>{account.is_active ? 'Active' : 'Inactive'}</span></td><td><button className="table-action" type="button" onClick={() => onStatusChange(account.id, !account.is_active)}>{account.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div></section></section></main>
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const [profileData, setProfileData] = useState({ form: initialProfile, counts: {} })
  const [summary, setSummary] = useState({ counts: {}, users: [] })
  const [error, setError] = useState('')
  const [unreadCounts, setUnreadCounts] = useState({})

  useEffect(() => {
    communicationApi.notifications().then((result) => {
      const unread = result.notifications.filter((notification) => !notification.read_at)
      const uniqueCount = (items, entityType) => new Set(
        items
          .filter((notification) => notification.related_entity_type === entityType && notification.related_entity_id)
          .map((notification) => notification.related_entity_id),
      ).size
      setUnreadCounts({
        inquiries: uniqueCount(unread, 'inquiry'),
        bookings: uniqueCount(unread, 'booking'),
        messages: uniqueCount(unread, 'conversation'),
      })
    }).catch(() => {})
    if (user.role === 'administrator') {
      profileApi.adminSummary().then(setSummary).catch((loadError) => setError(loadError.message))
    } else {
      profileApi.get().then((result) => {
        setProfileData({
          form: { ...initialProfile, ...result.user, ...(result.profile || {}) },
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

  if (error) return <main className="dashboard-page"><Header onLogout={logout} unreadCounts={unreadCounts} /><section className="container dashboard-content"><div className="form-error" role="alert">{error}</div></section></main>
  if (user.role === 'administrator') return <AdminDashboard summary={summary} onStatusChange={changeStatus} onLogout={logout} unreadCounts={unreadCounts} />
  return <UserDashboard user={user} profileData={profileData} onSaved={(result) => setProfileData((current) => ({ ...current, form: { ...current.form, ...result.user, ...(result.profile || {}) } }))} onLogout={logout} unreadCounts={unreadCounts} />
}
