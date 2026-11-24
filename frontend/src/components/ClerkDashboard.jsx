import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react'
import AppSidebar from './AppSidebar'
import { useAuth } from '../hooks/useAuth'
import { clerkApi } from '../services/clerk'
import { servicesApi } from '../services/services'
import {
  WEEKDAY_OPTIONS,
  formatWorkingDaysLabel,
  parseWorkingDaysArray,
} from '../services/profiles'
import {
  GATEWAY_PROVIDER_LABELS,
  bookingsApi,
  formatStatusLabel,
  getStatusBadgeClass,
} from '../services/bookings'

const emptyNewService = {
  title: '',
  description: '',
  categoryId: '',
  indicativePrice: '',
  priceUnit: 'per visit',
  serviceArea: 'Zamboanga City',
  workersRequired: 1,
}

export default function ClerkDashboard({ activeTab = 'overview' }) {
  const { user } = useAuth()
  const [workspace, setWorkspace] = useState({ gardeners: [], services: [], bookings: [], pendingPayments: [] })
  const [categories, setCategories] = useState([])
  const [selectedGardenerId, setSelectedGardenerId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [scheduleForm, setScheduleForm] = useState({
    workingDays: WEEKDAY_OPTIONS.map((d) => d.code),
    workStartTime: '08:00',
    workEndTime: '17:00',
    maxConcurrentJobs: 1,
    crewSize: 1,
    availabilityNotes: '',
  })
  const [blockForm, setBlockForm] = useState({ startDate: '', endDate: '', reason: '' })
  const [serviceForm, setServiceForm] = useState(emptyNewService)
  const [rejectDrafts, setRejectDrafts] = useState({})
  const [busyAction, setBusyAction] = useState('')

  const applyGardenerForms = useCallback((gardener, catList) => {
    if (!gardener) return
    setScheduleForm({
      workingDays: parseWorkingDaysArray(gardener.working_days),
      workStartTime: gardener.work_start_time || '08:00',
      workEndTime: gardener.work_end_time || '17:00',
      maxConcurrentJobs: gardener.max_concurrent_jobs || 1,
      crewSize: gardener.crew_size || 1,
      availabilityNotes: gardener.availability_notes || '',
    })
    setServiceForm((prev) => ({
      ...prev,
      serviceArea: gardener.service_area || 'Zamboanga City',
      categoryId: prev.categoryId || (catList?.[0]?.id ? String(catList[0].id) : ''),
    }))
  }, [])

  const fetchWorkspaceData = useCallback(async (preferredGardenerId = null) => {
    const [ws, catRes] = await Promise.all([
      clerkApi.workspace(),
      servicesApi.categories().catch(() => ({ categories: [] })),
    ])
    const catList = catRes?.categories || []
    setWorkspace(ws)
    setCategories(catList)
    const nextGardener = (preferredGardenerId && ws.gardeners.find((g) => g.id === preferredGardenerId))
      || ws.gardeners[0]
      || null
    setSelectedGardenerId(nextGardener?.id || null)
    applyGardenerForms(nextGardener, catList)
    return ws
  }, [applyGardenerForms])

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      await fetchWorkspaceData(selectedGardenerId)
    } catch (loadErr) {
      setError(loadErr.message)
    } finally {
      setLoading(false)
    }
  }, [fetchWorkspaceData, selectedGardenerId])

  useEffect(() => {
    let active = true
    Promise.all([
      clerkApi.workspace(),
      servicesApi.categories().catch(() => ({ categories: [] })),
    ])
      .then(([ws, catRes]) => {
        if (!active) return
        const catList = catRes?.categories || []
        setWorkspace(ws)
        setCategories(catList)
        const first = ws.gardeners[0] || null
        setSelectedGardenerId(first?.id || null)
        applyGardenerForms(first, catList)
      })
      .catch((loadErr) => {
        if (active) setError(loadErr.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [applyGardenerForms])

  const selectedGardener = workspace.gardeners.find((g) => g.id === selectedGardenerId) || workspace.gardeners[0] || null

  function selectGardener(gardener) {
    setSelectedGardenerId(gardener.id)
    setNotice('')
    setError('')
    applyGardenerForms(gardener, categories)
  }

  const gardenerServices = selectedGardener
    ? workspace.services.filter((s) => s.gardener_id === selectedGardener.id)
    : []
  const gardenerBookings = selectedGardener
    ? workspace.bookings.filter((b) => b.gardener_id === selectedGardener.id)
    : []
  const gardenerPayments = selectedGardener
    ? workspace.pendingPayments.filter((p) => p.gardener_id === selectedGardener.id)
    : []
  const pendingVerifyCount = workspace.pendingPayments.filter((p) => p.status === 'pending').length

  function toggleWorkingDay(code) {
    const current = parseWorkingDaysArray(scheduleForm.workingDays)
    const exists = current.includes(code)
    if (exists && current.length <= 1) {
      setError('Select at least one working day.')
      return
    }
    setError('')
    setScheduleForm({
      ...scheduleForm,
      workingDays: exists ? current.filter((d) => d !== code) : [...current, code],
    })
  }

  async function handleSaveSchedule(event) {
    event.preventDefault()
    if (!selectedGardener) return
    setBusyAction('schedule'); setError(''); setNotice('')
    try {
      await clerkApi.updateSchedule(selectedGardener.id, {
        workingDays: scheduleForm.workingDays,
        workStartTime: scheduleForm.workStartTime,
        workEndTime: scheduleForm.workEndTime,
        maxConcurrentJobs: Number(scheduleForm.maxConcurrentJobs) || 1,
        crewSize: Number(scheduleForm.crewSize) || 1,
        availabilityNotes: scheduleForm.availabilityNotes,
      })
      setNotice(`Updated schedule & crew capacity for ${selectedGardener.display_name}.`)
      await loadWorkspace()
    } catch (saveErr) {
      setError(saveErr.message)
    } finally {
      setBusyAction('')
    }
  }

  async function handleAddBlock(event) {
    event.preventDefault()
    if (!selectedGardener || !blockForm.startDate) {
      setError('Please pick a start date to mark unavailable.')
      return
    }
    setBusyAction('block'); setError(''); setNotice('')
    try {
      await clerkApi.addUnavailableDate(selectedGardener.id, {
        startDate: blockForm.startDate,
        endDate: blockForm.endDate || blockForm.startDate,
        reason: blockForm.reason,
      })
      setBlockForm({ startDate: '', endDate: '', reason: '' })
      setNotice(`Blocked date(s) added for ${selectedGardener.display_name}.`)
      await loadWorkspace()
    } catch (blockErr) {
      setError(blockErr.message)
    } finally {
      setBusyAction('')
    }
  }

  async function handleRemoveBlock(blockId) {
    if (!selectedGardener) return
    setBusyAction(`del-block-${blockId}`); setError(''); setNotice('')
    try {
      await clerkApi.removeUnavailableDate(selectedGardener.id, blockId)
      setNotice('Unavailable date block removed.')
      await loadWorkspace()
    } catch (delErr) {
      setError(delErr.message)
    } finally {
      setBusyAction('')
    }
  }

  async function handleCreateService(event) {
    event.preventDefault()
    if (!selectedGardener) return
    setBusyAction('create-service'); setError(''); setNotice('')
    try {
      await clerkApi.createService(selectedGardener.id, {
        title: serviceForm.title,
        description: serviceForm.description,
        categoryId: Number(serviceForm.categoryId),
        indicativePrice: serviceForm.indicativePrice === '' ? null : Number(serviceForm.indicativePrice),
        priceUnit: serviceForm.priceUnit,
        serviceArea: serviceForm.serviceArea,
        workersRequired: Number(serviceForm.workersRequired) || 1,
      })
      setServiceForm({
        ...emptyNewService,
        categoryId: categories[0]?.id ? String(categories[0].id) : '',
        serviceArea: selectedGardener.service_area || 'Zamboanga City',
      })
      setNotice(`New service created for ${selectedGardener.display_name}.`)
      await loadWorkspace()
    } catch (svcErr) {
      setError(svcErr.message)
    } finally {
      setBusyAction('')
    }
  }

  async function handleToggleService(service) {
    if (!selectedGardener) return
    setBusyAction(`svc-${service.id}`); setError(''); setNotice('')
    try {
      await clerkApi.toggleServiceStatus(selectedGardener.id, service.id, !service.is_active)
      setNotice(`Service "${service.title}" marked ${!service.is_active ? 'Active' : 'Inactive'}.`)
      await loadWorkspace()
    } catch (svcErr) {
      setError(svcErr.message)
    } finally {
      setBusyAction('')
    }
  }

  async function handlePaymentDecision(payment, decision) {
    if (!selectedGardener) return
    const rejectionReason = (rejectDrafts[payment.id] || '').trim()
    if (decision === 'rejected' && !rejectionReason) {
      setError('Please enter a short rejection reason before rejecting a payment proof.')
      return
    }
    setBusyAction(`pay-${payment.id}`); setError(''); setNotice('')
    try {
      const res = await clerkApi.verifyPayment(selectedGardener.id, payment.booking_id, payment.id, {
        decision,
        rejectionReason: decision === 'rejected' ? rejectionReason : undefined,
      })
      setNotice(
        decision === 'verified'
          ? `Payment ${payment.transaction_code || `#${payment.id}`} verified! Booking stage is now ${formatStatusLabel(res.booking?.booking_stage || 'booked')}.`
          : `Payment ${payment.transaction_code || `#${payment.id}`} rejected and both parties notified.`,
      )
      setRejectDrafts((prev) => ({ ...prev, [payment.id]: '' }))
      await loadWorkspace()
    } catch (payErr) {
      setError(payErr.message)
    } finally {
      setBusyAction('')
    }
  }

  const showSchedules = activeTab === 'overview' || activeTab === 'schedules'
  const showPayments = activeTab === 'overview' || activeTab === 'payments'
  const showServices = activeTab === 'overview' || activeTab === 'services'

  return (
    <main className="dashboard-page">
      <AppSidebar />
      <section className="container dashboard-content">
        <div className="dashboard-topbar">
          <p className="eyebrow" style={{ margin: 0 }}>Assigned Clerk Workspace</p>
          <div className="dashboard-tabs dashboard-tabs-top" role="tablist" aria-label="Clerk workspace sections">
            <Link className={`dashboard-tab${activeTab === 'overview' ? ' is-active' : ''}`} to="/dashboard">
              Overview
            </Link>
            <Link className={`dashboard-tab${activeTab === 'schedules' ? ' is-active' : ''}`} to="/dashboard?tab=schedules">
              Schedules &amp; Crew
            </Link>
            <Link className={`dashboard-tab${activeTab === 'payments' ? ' is-active' : ''}`} to="/dashboard?tab=payments">
              Payments {pendingVerifyCount > 0 ? `(${pendingVerifyCount})` : ''}
            </Link>
            <Link className={`dashboard-tab${activeTab === 'services' ? ' is-active' : ''}`} to="/dashboard?tab=services">
              Services
            </Link>
          </div>
        </div>

        <div className="dashboard-hero-row">
          <div>
            <h1>Clerk Operations Desk.</h1>
            <p className="dashboard-lead" style={{ marginBottom: 0 }}>
              Manage schedules, daily crew capacity, service listings, and payment verifications exclusively for your assigned gardener accounts.
            </p>
          </div>
        </div>

        {error && <div className="form-error" role="alert" style={{ marginBottom: '16px' }}>{error}</div>}
        {notice && <div className="form-success" role="status" style={{ marginBottom: '16px' }}>{notice}</div>}

        <section className="dashboard-stats" aria-label="Clerk summary metrics">
          <article>
            <span>Assigned gardeners</span>
            <strong>{workspace.gardeners.length}</strong>
          </article>
          <article>
            <span>Pending payment proofs</span>
            <strong>{pendingVerifyCount}</strong>
          </article>
          <article>
            <span>Managed bookings</span>
            <strong>{workspace.bookings.length}</strong>
          </article>
          <article>
            <span>Managed services</span>
            <strong>{workspace.services.length}</strong>
          </article>
        </section>

        {loading ? (
          <div className="dashboard-panel skeleton-stack" aria-busy="true">
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
          </div>
        ) : workspace.gardeners.length === 0 ? (
          <div className="dashboard-panel">
            <p className="eyebrow">No gardeners assigned yet</p>
            <h2>Waiting for a gardener or administrator assignment</h2>
            <p className="form-note">
              Your Clerk account (<strong>{user?.email}</strong>) is ready! Share this email with a Gardener so they can link you during sign-up or under <strong>Gardener Dashboard → My Clerks → Link Existing Clerk</strong>, or ask an Administrator to assign you under <strong>Admin → Accounts</strong>. Once linked, their schedules, payments, and services will appear here automatically.
            </p>
          </div>
        ) : (
          <>
            <section className="dashboard-panel clerk-gardener-bar">
              <div className="activity-heading">
                <div>
                  <p className="eyebrow">Managed accounts</p>
                  <h2>Select an assigned gardener</h2>
                </div>
                <span className="panel-count">{workspace.gardeners.length} assigned</span>
              </div>
              <div className="clerk-gardener-pills">
                {workspace.gardeners.map((gardener) => (
                  <button
                    key={gardener.id}
                    type="button"
                    className={`clerk-gardener-pill${selectedGardener?.id === gardener.id ? ' is-selected' : ''}`}
                    onClick={() => selectGardener(gardener)}
                  >
                    <Users size={15} />
                    <span>
                      <strong>{gardener.display_name}</strong>
                      <small>{gardener.service_area || 'Zamboanga City'} · Crew: {gardener.crew_size}</small>
                    </span>
                  </button>
                ))}
              </div>
              {selectedGardener && (
                <div className="clerk-selected-meta">
                  <span><ShieldCheck size={14} /> {selectedGardener.is_approved ? 'Approved gardener' : 'Pending admin approval'}</span>
                  <span><CalendarDays size={14} /> {formatWorkingDaysLabel(selectedGardener.working_days)} · {selectedGardener.work_start_time}–{selectedGardener.work_end_time}</span>
                  <span><Users size={14} /> {selectedGardener.crew_size} worker(s)/day · Max {selectedGardener.max_concurrent_jobs} concurrent job(s)</span>
                  {selectedGardener.assignment_notes && <span>Note: {selectedGardener.assignment_notes}</span>}
                </div>
              )}
            </section>

            {showPayments && selectedGardener && (
              <section className="dashboard-panel" style={{ marginTop: '20px' }}>
                <div className="activity-heading">
                  <div>
                    <p className="eyebrow"><CreditCard size={13} style={{ verticalAlign: 'text-bottom' }} /> Payment desk</p>
                    <h2>Payment verifications for {selectedGardener.display_name}</h2>
                  </div>
                  <span className="panel-count">{gardenerPayments.filter((p) => p.status === 'pending').length} pending</span>
                </div>
                {gardenerPayments.length === 0 ? (
                  <p className="form-note">No payment submissions recorded for this gardener yet.</p>
                ) : (
                  <div className="clerk-payment-list">
                    {gardenerPayments.map((payment) => (
                      <article className="clerk-payment-card" key={payment.id}>
                        <div className="clerk-payment-head">
                          <div>
                            <div className="payment-record-title">
                              <strong>
                                {payment.transaction_code || `Payment #${payment.id}`} · PHP {Number(payment.amount).toLocaleString()}
                              </strong>
                              {payment.gateway_provider && (
                                <span className="gateway-provider-badge">
                                  {GATEWAY_PROVIDER_LABELS[payment.gateway_provider] || payment.gateway_provider}
                                </span>
                              )}
                            </div>
                            <small>
                              Booking #{payment.booking_id} ({payment.service_title || 'Gardening service'}) · Client: {payment.client_name} · Method: {formatStatusLabel(payment.payment_method)} · Type: {formatStatusLabel(payment.payment_type)}
                            </small>
                            {payment.reference_number && (
                              <small>Ref #: {payment.reference_number}</small>
                            )}
                          </div>
                          <span className={getStatusBadgeClass(payment.status === 'verified' ? 'confirmed' : payment.status === 'rejected' ? 'cancelled' : 'pending')}>
                            {formatStatusLabel(payment.status)}
                          </span>
                        </div>
                        <div className="clerk-payment-actions">
                          {payment.receipt_path && (
                            <a
                              className="table-action"
                              href={bookingsApi.receiptUrl(payment.booking_id, payment.id)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink size={14} /> View Receipt
                            </a>
                          )}
                          {payment.status === 'pending' && (
                            <>
                              <button
                                className="button button-sm"
                                type="button"
                                disabled={busyAction === `pay-${payment.id}`}
                                onClick={() => handlePaymentDecision(payment, 'verified')}
                              >
                                <CheckCircle2 size={14} /> {busyAction === `pay-${payment.id}` ? 'Saving...' : 'Verify Payment'}
                              </button>
                              <input
                                type="text"
                                className="clerk-reject-input"
                                placeholder="Rejection reason (if rejecting)..."
                                maxLength="300"
                                value={rejectDrafts[payment.id] || ''}
                                onChange={(e) => setRejectDrafts((prev) => ({ ...prev, [payment.id]: e.target.value }))}
                              />
                              <button
                                className="table-action table-action-danger"
                                type="button"
                                disabled={busyAction === `pay-${payment.id}`}
                                onClick={() => handlePaymentDecision(payment, 'rejected')}
                              >
                                <XCircle size={14} /> Reject
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {showSchedules && selectedGardener && (
              <div className="dashboard-grid" style={{ marginTop: '20px' }}>
                <section className="dashboard-panel">
                  <p className="eyebrow">Working hours &amp; crew capacity</p>
                  <h2>Schedule for {selectedGardener.display_name}</h2>
                  <form className="profile-form" onSubmit={handleSaveSchedule}>
                    <div className="weekday-picker" role="group" aria-label="Working days">
                      {WEEKDAY_OPTIONS.map((day) => {
                        const checked = parseWorkingDaysArray(scheduleForm.workingDays).includes(day.code)
                        return (
                          <button
                            key={day.code}
                            type="button"
                            className={`weekday-chip${checked ? ' is-selected' : ''}`}
                            onClick={() => toggleWorkingDay(day.code)}
                            aria-pressed={checked}
                          >
                            {day.short}
                          </button>
                        )
                      })}
                    </div>
                    <div className="form-row">
                      <label>
                        Work start
                        <input
                          type="time"
                          required
                          value={scheduleForm.workStartTime}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, workStartTime: e.target.value })}
                        />
                      </label>
                      <label>
                        Work end
                        <input
                          type="time"
                          required
                          value={scheduleForm.workEndTime}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, workEndTime: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="form-row">
                      <label>
                        Daily crew size (workers/day)
                        <input
                          type="number"
                          min="1"
                          max="50"
                          required
                          value={scheduleForm.crewSize}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, crewSize: e.target.value })}
                        />
                      </label>
                      <label>
                        Max concurrent jobs
                        <input
                          type="number"
                          min="1"
                          max="10"
                          required
                          value={scheduleForm.maxConcurrentJobs}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, maxConcurrentJobs: e.target.value })}
                        />
                      </label>
                    </div>
                    <label>
                      Availability notes
                      <input
                        maxLength="255"
                        placeholder="e.g., Sunday bookings by arrangement only"
                        value={scheduleForm.availabilityNotes}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, availabilityNotes: e.target.value })}
                      />
                    </label>
                    <button className="button" type="submit" disabled={busyAction === 'schedule'}>
                      <Save size={15} /> {busyAction === 'schedule' ? 'Saving...' : 'Save schedule & crew'}
                    </button>
                  </form>
                </section>

                <section className="dashboard-panel">
                  <p className="eyebrow">Blocked dates &amp; holidays</p>
                  <h2>Mark unavailable dates</h2>
                  <form className="profile-form" onSubmit={handleAddBlock}>
                    <div className="form-row">
                      <label>
                        Start date
                        <input
                          type="date"
                          required
                          value={blockForm.startDate}
                          onChange={(e) => setBlockForm({ ...blockForm, startDate: e.target.value })}
                        />
                      </label>
                      <label>
                        End date
                        <input
                          type="date"
                          value={blockForm.endDate}
                          min={blockForm.startDate || undefined}
                          onChange={(e) => setBlockForm({ ...blockForm, endDate: e.target.value })}
                        />
                      </label>
                    </div>
                    <label>
                      Reason (optional)
                      <input
                        maxLength="255"
                        placeholder="e.g., Rest day / Out-of-town project"
                        value={blockForm.reason}
                        onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                      />
                    </label>
                    <button className="button button-outline" type="submit" disabled={busyAction === 'block'}>
                      <Plus size={15} /> {busyAction === 'block' ? 'Blocking...' : 'Add blocked date(s)'}
                    </button>
                  </form>

                  <div className="managed-list" style={{ marginTop: '16px' }}>
                    {(selectedGardener.unavailable_dates || []).length === 0 ? (
                      <p className="form-note">No blocked dates set for this gardener.</p>
                    ) : (
                      selectedGardener.unavailable_dates.map((block) => (
                        <div className="managed-item" key={block.id}>
                          <div>
                            <strong>{block.start_date === block.end_date ? block.start_date : `${block.start_date} → ${block.end_date}`}</strong>
                            <span>{block.reason || 'Unavailable'}</span>
                          </div>
                          <button
                            type="button"
                            className="table-action table-action-danger"
                            disabled={busyAction === `del-block-${block.id}`}
                            onClick={() => handleRemoveBlock(block.id)}
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}

            {showServices && selectedGardener && (
              <section className="dashboard-panel" style={{ marginTop: '20px' }}>
                <div className="activity-heading">
                  <div>
                    <p className="eyebrow"><Briefcase size={13} style={{ verticalAlign: 'text-bottom' }} /> Service listings</p>
                    <h2>Services for {selectedGardener.display_name}</h2>
                  </div>
                  <span className="panel-count">{gardenerServices.length} total</span>
                </div>
                <div className="dashboard-grid">
                  <form className="profile-form" onSubmit={handleCreateService}>
                    <h3>Add a service listing</h3>
                    <label>
                      Service title
                      <input
                        required
                        maxLength="150"
                        placeholder="e.g., Full Lawn Mowing & Edging"
                        value={serviceForm.title}
                        onChange={(e) => setServiceForm({ ...serviceForm, title: e.target.value })}
                      />
                    </label>
                    <div className="form-row">
                      <label>
                        Category
                        <select
                          required
                          value={serviceForm.categoryId}
                          onChange={(e) => setServiceForm({ ...serviceForm, categoryId: e.target.value })}
                        >
                          <option value="">Select category</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Workers required
                        <input
                          type="number"
                          min="1"
                          max="20"
                          required
                          value={serviceForm.workersRequired}
                          onChange={(e) => setServiceForm({ ...serviceForm, workersRequired: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="form-row form-row-3">
                      <label>
                        Indicative price (PHP)
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="e.g., 1500"
                          value={serviceForm.indicativePrice}
                          onChange={(e) => setServiceForm({ ...serviceForm, indicativePrice: e.target.value })}
                        />
                      </label>
                      <label>
                        Price unit
                        <input
                          maxLength="50"
                          placeholder="per visit"
                          value={serviceForm.priceUnit}
                          onChange={(e) => setServiceForm({ ...serviceForm, priceUnit: e.target.value })}
                        />
                      </label>
                      <label>
                        Service area
                        <input
                          required
                          maxLength="150"
                          value={serviceForm.serviceArea}
                          onChange={(e) => setServiceForm({ ...serviceForm, serviceArea: e.target.value })}
                        />
                      </label>
                    </div>
                    <label>
                      Description
                      <textarea
                        required
                        rows="3"
                        placeholder="Describe what is included in this service..."
                        value={serviceForm.description}
                        onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                      />
                    </label>
                    <button className="button" type="submit" disabled={busyAction === 'create-service'}>
                      <Plus size={15} /> {busyAction === 'create-service' ? 'Publishing...' : 'Add service listing'}
                    </button>
                  </form>

                  <div className="managed-list">
                    <h3>Existing listings</h3>
                    {gardenerServices.length === 0 ? (
                      <p className="form-note">No service listings yet for this gardener.</p>
                    ) : (
                      gardenerServices.map((svc) => (
                        <div className={`managed-item${svc.is_active ? '' : ' is-inactive'}`} key={svc.id}>
                          <div>
                            <strong>{svc.title}</strong>
                            <span>
                              {svc.category_name} · {svc.workers_required || 1} worker{(svc.workers_required || 1) === 1 ? '' : 's'}
                              {svc.indicative_price != null ? ` · PHP ${Number(svc.indicative_price).toLocaleString()}` : ''}
                              {' · '}{svc.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="table-action"
                            disabled={busyAction === `svc-${svc.id}`}
                            onClick={() => handleToggleService(svc)}
                          >
                            {svc.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'overview' && selectedGardener && (
              <section className="dashboard-panel" style={{ marginTop: '20px' }}>
                <div className="activity-heading">
                  <div>
                    <p className="eyebrow">Bookings overview</p>
                    <h2>Recent bookings for {selectedGardener.display_name}</h2>
                  </div>
                  <span className="panel-count">{gardenerBookings.length} booking(s)</span>
                </div>
                {gardenerBookings.length === 0 ? (
                  <p className="form-note">No bookings yet for this gardener.</p>
                ) : (
                  <div className="user-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Booking</th>
                          <th>Client</th>
                          <th>Schedule</th>
                          <th>Payment</th>
                          <th>Stage / Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gardenerBookings.slice(0, 15).map((b) => (
                          <tr key={b.id}>
                            <td>
                              <strong>#{b.id} · {b.service_title || 'Gardening service'}</strong>
                              <small>{b.workers_required || 1} worker(s) · {b.location || 'Zamboanga City'}</small>
                            </td>
                            <td>{b.client_name}</td>
                            <td>{b.scheduled_start ? new Date(b.scheduled_start).toLocaleString() : 'TBD'}</td>
                            <td>
                              PHP {Number(b.amount_paid || 0).toLocaleString()} / {Number(b.agreed_amount || 0).toLocaleString()}
                              <small>{formatStatusLabel(b.payment_status)}</small>
                            </td>
                            <td>
                              <span className={getStatusBadgeClass(b.status === 'completed' || b.status === 'cancelled' ? b.status : b.booking_stage)}>
                                {formatStatusLabel(b.booking_stage)} · {formatStatusLabel(b.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </section>
    </main>
  )
}
