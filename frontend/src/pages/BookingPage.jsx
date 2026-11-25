import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, CalendarDays, Check, CheckCircle2, Clock, CreditCard, ExternalLink, FileCheck2, Leaf, Lock, MapPin, Printer, ShieldAlert, ShieldCheck, Star, Upload } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { agreementsApi } from '../services/agreements'
import {
  BOOKING_EVENT_REASON_LABELS,
  BOOKING_EVENT_REASON_OPTIONS,
  GATEWAY_PROVIDER_LABELS,
  PAYMENT_METHOD_LABELS,
  bookingsApi,
  buildBookingAgreementSummary,
  formatStatusLabel,
  getStatusBadgeClass,
} from '../services/bookings'
import { inquiriesApi } from '../services/inquiries'
import { computeEstimatedEndDateTime, formatWorkingDaysLabel } from '../services/profiles'
import { fetchInquiryImages, getRequestImageUrl } from '../services/requestImages'
import { reviewsApi } from '../services/reviews'
import { servicesApi } from '../services/services'
import { communicationApi } from '../services/communication'
import AppSidebar from '../components/AppSidebar'
import StarRating from '../components/StarRating'
import TransientSuccess from '../components/TransientSuccess'

const AGREEMENT_STEPS = [
  { id: 1, label: 'Scope & price' },
  { id: 2, label: 'Schedule & location' },
  { id: 3, label: 'Review & propose' },
]

function BookingForm() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const inquiryIdParam = Number(params.get('inquiryId'))
  const quotationId = Number(params.get('quotationId'))
  const serviceId = Number(params.get('serviceId'))
  const direct = Number.isInteger(serviceId) && serviceId > 0
  const [form, setForm] = useState({
    scopeOfWork: '',
    amount: '',
    requiredDepositAmount: '',
    priceBasis: '',
    estimatedWorkingDays: '',
    scheduledStart: '',
    scheduledEnd: '',
    location: '',
    conditions: '',
  })
  const [resolvedInquiryId, setResolvedInquiryId] = useState(Number.isInteger(inquiryIdParam) && inquiryIdParam > 0 ? inquiryIdParam : null)
  const [gardenerId, setGardenerId] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [scheduleCheck, setScheduleCheck] = useState(null)
  const [checkingSchedule, setCheckingSchedule] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [agreementStep, setAgreementStep] = useState(1)

  useEffect(() => {
    if (direct) {
      servicesApi.detail(serviceId).then((res) => {
        if (res?.service) {
          setGardenerId(res.service.gardener_id)
          setForm((prev) => ({
            ...prev,
            scopeOfWork: prev.scopeOfWork || `${res.service.title}: ${res.service.description}`,
            amount: prev.amount || (res.service.indicative_price ?? ''),
            priceBasis: prev.priceBasis || (res.service.price_unit ?? ''),
          }))
        }
      }).catch(() => {})
    } else if (Number.isInteger(inquiryIdParam) && inquiryIdParam > 0) {
      inquiriesApi.get(inquiryIdParam).then((res) => {
        const quote = (res?.quotations || []).find((q) => q.id === quotationId || q.status === 'accepted')
        setResolvedInquiryId(inquiryIdParam)
        setGardenerId(quote?.gardener_id || res?.inquiry?.gardener_id || null)
        setForm((prev) => ({
          ...prev,
          scopeOfWork: prev.scopeOfWork || quote?.details || res?.inquiry?.description || '',
          amount: prev.amount || (quote?.amount ?? ''),
          estimatedWorkingDays: prev.estimatedWorkingDays || (quote?.estimated_working_days ?? ''),
          location: prev.location || (res?.inquiry?.location ?? ''),
        }))
      }).catch(() => {})
    }
  }, [direct, inquiryIdParam, quotationId, serviceId])

  useEffect(() => {
    if (!gardenerId) return
    servicesApi.gardenerAvailability(gardenerId)
      .then((res) => setAvailability(res?.availability || null))
      .catch(() => {})
  }, [gardenerId])

  useEffect(() => {
    if (!gardenerId || !form.scheduledStart || !form.scheduledEnd) {
      return undefined
    }
    let active = true
    const timer = setTimeout(() => {
      if (!active) return
      setCheckingSchedule(true)
      servicesApi.checkGardenerAvailability(gardenerId, {
        scheduledStart: form.scheduledStart,
        scheduledEnd: form.scheduledEnd,
        ...(direct ? { serviceId } : {}),
      })
        .then((res) => { if (active) setScheduleCheck(res) })
        .catch(() => { if (active) setScheduleCheck(null) })
        .finally(() => { if (active) setCheckingSchedule(false) })
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [gardenerId, form.scheduledStart, form.scheduledEnd, direct, serviceId])

  const activeScheduleCheck = (gardenerId && form.scheduledStart && form.scheduledEnd) ? scheduleCheck : null

  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  function handleAutoCalculateEnd() {
    if (!form.scheduledStart || !form.estimatedWorkingDays) return
    const computed = computeEstimatedEndDateTime({
      scheduledStart: form.scheduledStart,
      workingDaysCount: Number(form.estimatedWorkingDays),
      workingDays: availability?.workingDays,
      workStartTime: availability?.workStartTime || '08:00',
      workEndTime: availability?.workEndTime || '17:00',
      unavailableDates: availability?.unavailableDates || [],
    })
    if (computed) {
      setForm((prev) => ({ ...prev, scheduledEnd: computed }))
    }
  }

  function validateAgreementStep(formEl) {
    const panel = formEl?.querySelector('.agreement-step-panel')
    if (!panel) return true
    const fields = Array.from(panel.querySelectorAll('[required]'))
    const invalid = fields.find((field) => !field.checkValidity())
    if (invalid) {
      invalid.reportValidity()
      return false
    }
    return true
  }

  function handleAgreementBackStep() {
    setError('')
    setAgreementStep((current) => Math.max(1, current - 1))
  }

  async function submit(event) {
    event.preventDefault()
    if (agreementStep < AGREEMENT_STEPS.length) {
      if (!validateAgreementStep(event.currentTarget)) return
      setError('')
      setAgreementStep((current) => Math.min(AGREEMENT_STEPS.length, current + 1))
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        requiredDepositAmount: form.requiredDepositAmount === '' ? undefined : Number(form.requiredDepositAmount),
        estimatedWorkingDays: form.estimatedWorkingDays === '' ? null : Number(form.estimatedWorkingDays),
      }
      if (direct) {
        const result = await agreementsApi.proposeDirectService({ ...payload, serviceId })
        navigate(`/inquiries/${result.inquiryId}`)
      } else if (resolvedInquiryId) {
        await agreementsApi.propose(resolvedInquiryId, {
          ...payload,
          ...(Number.isInteger(quotationId) && quotationId > 0 ? { quotationId } : {}),
        })
        navigate(`/inquiries/${resolvedInquiryId}`)
      } else {
        throw new Error('Select a service or inquiry to propose a mutual agreement.')
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="container booking-content">
      <Link className="back-link" to={direct ? `/services/${serviceId}` : (resolvedInquiryId ? `/inquiries/${resolvedInquiryId}` : '/inquiries')}>
        <ArrowLeft size={15} /> Back
      </Link>
      <p className="eyebrow">{direct ? 'Direct service agreement proposal' : 'Mutual service agreement'}</p>
      <h1>Propose scope, price, and schedule.</h1>
      <p className="booking-note">
        Approving the same agreement version creates a <strong>Reservation</strong> holding the schedule slot. Submitting and verifying at least the required deposit (or full payment) upgrades it into a <strong>Confirmed Booking</strong>.
      </p>
      {availability && (
        <div className="estimate-summary-card" style={{ marginTop: 0 }}>
          <div className="estimate-meta-grid">
            <span><CalendarDays size={14} style={{ verticalAlign: 'text-bottom' }} /> <strong>Provider working days:</strong> {formatWorkingDaysLabel(availability.workingDays)}</span>
            <span><Clock size={14} style={{ verticalAlign: 'text-bottom' }} /> <strong>Working hours:</strong> {availability.workStartTime} – {availability.workEndTime}</span>
            <span>
              <strong>Daily crew &amp; simultaneous capacity:</strong>{' '}
              {availability.crewSize || 1} worker{(availability.crewSize || 1) === 1 ? '' : 's'}/day ·{' '}
              {availability.maxConcurrentJobs > 1
                ? `up to ${availability.maxConcurrentJobs} simultaneous jobs`
                : 'solo (1 job at a time)'}
            </span>
          </div>
          {availability.fullyBookedDates?.length > 0 && (
            <p className="field-note" style={{ margin: 0, color: '#9A2C2C', fontWeight: 600 }}>
              <strong>Fully booked dates (no service available):</strong> {availability.fullyBookedDates.join(', ')}
            </p>
          )}
          {availability.availabilityNotes && (
            <p className="field-note" style={{ margin: 0 }}><strong>Provider schedule note:</strong> {availability.availabilityNotes}</p>
          )}
          {availability.unavailableDates?.length > 0 && (
            <p className="field-note" style={{ margin: 0 }}>
              <strong>Blocked / unavailable dates:</strong>{' '}
              {availability.unavailableDates
                .map((d) => `${d.start_date === d.end_date ? d.start_date : `${d.start_date} to ${d.end_date}`}${d.reason ? ` (${d.reason})` : ''}`)
                .join(', ')}
            </p>
          )}
          {availability.busySlots?.length > 0 && (
            <p className="field-note" style={{ margin: 0 }}>
              <strong>Upcoming booked slots ({availability.busySlots.length}):</strong>{' '}
              {availability.busySlots
                .slice(0, 4)
                .map((slot) => `${new Date(slot.scheduled_start).toLocaleString()} – ${new Date(slot.scheduled_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
                .join(' · ')}
            </p>
          )}
        </div>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
      <form className="dashboard-panel profile-form booking-form" onSubmit={submit}>
        <nav className="register-stepper agreement-stepper" aria-label="Agreement steps">
          {AGREEMENT_STEPS.map((item) => {
            const isActive = agreementStep === item.id
            const isDone = agreementStep > item.id
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
                    setAgreementStep(item.id)
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
        {agreementStep === 1 && (
          <div className="agreement-step-panel">
            <p className="auth-section-title">Step 1 of 3 · Scope &amp; price</p>
            <label>Agreed scope of work <span className="required-mark" aria-hidden="true">*</span>
              <textarea required rows="4" maxLength="5000" value={form.scopeOfWork} onChange={change('scopeOfWork')} placeholder="Describe the exact gardening tasks and deliverables agreed upon." />
            </label>
        <div className="form-row form-row-3">
          <label>Agreed price (PHP) <span className="required-mark" aria-hidden="true">*</span>
            <input required type="number" min="0" step="0.01" value={form.amount} onChange={change('amount')} placeholder="e.g. 1500.00" />
          </label>
          <label>Required deposit (PHP) <span className="label-note">(Defaults to 30%)</span>
            <input
              type="number"
              min="0"
              max={form.amount || undefined}
              step="0.01"
              value={form.requiredDepositAmount}
              onChange={change('requiredDepositAmount')}
              placeholder={form.amount ? `Default: ${(Number(form.amount) * 0.3).toFixed(2)}` : '30% downpayment'}
            />
          </label>
          <label>Price basis (optional)
            <input maxLength="100" value={form.priceBasis} onChange={change('priceBasis')} placeholder="e.g. per visit, fixed project" />
          </label>
        </div>
            <div className="register-step-actions">
              <button className="button" type="submit">
                <span>Continue to schedule &amp; location</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
        {agreementStep === 2 && (
          <div className="agreement-step-panel">
            <p className="auth-section-title">Step 2 of 3 · Schedule &amp; location</p>
            <div className="form-row form-row-3">
          <label>Start date and time <span className="required-mark" aria-hidden="true">*</span>
            <input required type="datetime-local" value={form.scheduledStart} onChange={change('scheduledStart')} />
          </label>
          <label>Estimated working days <span className="label-note">(Optional)</span>
            <input
              type="number"
              min="0.5"
              max="90"
              step="0.5"
              placeholder="e.g. 1.5"
              value={form.estimatedWorkingDays}
              onChange={change('estimatedWorkingDays')}
            />
          </label>
          <label>Estimated end date and time <span className="required-mark" aria-hidden="true">*</span>
            <input required type="datetime-local" value={form.scheduledEnd} onChange={change('scheduledEnd')} />
          </label>
        </div>
        {form.scheduledStart && form.estimatedWorkingDays && (
          <div>
            <button className="table-action" type="button" onClick={handleAutoCalculateEnd}>
              Auto-calculate estimated end time (skipping provider off-days &amp; blocked dates)
            </button>
          </div>
        )}
        {checkingSchedule && <p className="field-note">Checking provider schedule and simultaneous-job availability...</p>}
        {!checkingSchedule && activeScheduleCheck && (
          <div className={`availability-banner${activeScheduleCheck.available ? ' is-available' : ' is-conflict'}`} role="status">
            {activeScheduleCheck.available ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
            <span>{activeScheduleCheck.message}</span>
          </div>
        )}
        <label>Exact service location <span className="required-mark" aria-hidden="true">*</span>
          <input required maxLength="255" value={form.location} onChange={change('location')} placeholder="Complete address or barangay location in Zamboanga City" />
        </label>
        <label>Special conditions or notes (optional)
          <textarea rows="3" maxLength="5000" value={form.conditions} onChange={change('conditions')} placeholder="Materials, access instructions, or weather conditions." />
        </label>
            <div className="register-step-actions">
              <button type="button" className="register-back-btn" onClick={handleAgreementBackStep}>
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <button className="button" type="submit" disabled={checkingSchedule || (activeScheduleCheck && !activeScheduleCheck.available)}>
                <span>Review agreement</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
        {agreementStep === 3 && (
          <div className="agreement-step-panel">
            <p className="auth-section-title">Step 3 of 3 · Review &amp; propose</p>
            {!checkingSchedule && activeScheduleCheck && !activeScheduleCheck.available && (
              <div className="availability-banner is-conflict" role="alert">
                <ShieldAlert size={16} />
                <span>{activeScheduleCheck.message}</span>
              </div>
            )}
            <dl className="inquiry-review-summary">
              <div><dt>Scope of work</dt><dd>{form.scopeOfWork || 'Not provided'}</dd></div>
              <div><dt>Agreed price</dt><dd>{form.amount ? `₱${Number(form.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'Not provided'}</dd></div>
              <div><dt>Required deposit</dt><dd>{form.requiredDepositAmount ? `₱${Number(form.requiredDepositAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'Default (30%)'}</dd></div>
              <div><dt>Schedule</dt><dd>{form.scheduledStart && form.scheduledEnd ? `${form.scheduledStart} to ${form.scheduledEnd}` : 'Not provided'}</dd></div>
              <div><dt>Location</dt><dd>{form.location || 'Not provided'}</dd></div>
            </dl>
            <p className="form-note">
              Both parties must approve this same version. Approval creates a Reservation holding the slot; verifying the deposit upgrades it to a Confirmed Booking.
            </p>
            <div className="register-step-actions">
              <button type="button" className="register-back-btn" onClick={handleAgreementBackStep}>
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <button className="button" type="submit" disabled={saving || (activeScheduleCheck && !activeScheduleCheck.available)}>
                {saving ? 'Submitting proposal...' : 'Propose mutual agreement (v1)'}
              </button>
            </div>
          </div>
        )}
      </form>
    </section>
  )
}

function BookingDetails({ id }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [booking, setBooking] = useState(null)
  const [payments, setPayments] = useState([])
  const [rescheduleRequests, setRescheduleRequests] = useState([])
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [activeSchedulePanel, setActiveSchedulePanel] = useState(null)
  const [rescheduleForm, setRescheduleForm] = useState({
    reasonType: 'typhoon_weather',
    reasonDetails: '',
    proposedStart: '',
    proposedEnd: '',
  })
  const [rescheduleCheck, setRescheduleCheck] = useState(null)
  const [checkingReschedule, setCheckingReschedule] = useState(false)
  const [submittingReschedule, setSubmittingReschedule] = useState(false)
  const [respondingRescheduleId, setRespondingRescheduleId] = useState(null)
  const [rescheduleResponseNotes, setRescheduleResponseNotes] = useState({})
  const [cancelForm, setCancelForm] = useState({
    cancellationReasonType: 'typhoon_weather',
    cancellationReason: '',
  })
  const [paymentForm, setPaymentForm] = useState({
    paymentType: 'partial',
    paymentMethod: 'gcash',
    amount: '',
    referenceNumber: '',
    notes: '',
    receiptFile: null,
  })
  const [paymentChannel, setPaymentChannel] = useState('online')
  const [gatewayConfig, setGatewayConfig] = useState(null)
  const [activeCheckoutModal, setActiveCheckoutModal] = useState(null)
  const [rejectPaymentTarget, setRejectPaymentTarget] = useState(null)
  const [rejectPaymentReason, setRejectPaymentReason] = useState('')
  const [processingGateway, setProcessingGateway] = useState(false)
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [verifyingPaymentId, setVerifyingPaymentId] = useState(null)
  const [closingNote, setClosingNote] = useState('')
  const [confirmingClosing, setConfirmingClosing] = useState(false)
  const [review, setReview] = useState(null)
  const [reviewForm, setReviewForm] = useState({ rating: 5, reviewText: '' })
  const [submittingReview, setSubmittingReview] = useState(false)
  const [openReviewBookingId, setOpenReviewBookingId] = useState(null)
  const reviewOpen = openReviewBookingId === id
  const [searchParams] = useSearchParams()

  const load = useCallback(() => bookingsApi.get(id).then((result) => {
    setBooking(result.booking)
    setPayments(Array.isArray(result.payments) ? result.payments : [])
    setRescheduleRequests(Array.isArray(result.rescheduleRequests) ? result.rescheduleRequests : [])
    const b = result.booking
    if (b) {
      const suggested = b.booking_stage === 'reserved'
        ? Math.max(0, Number(b.required_deposit_amount || 0) - Number(b.amount_paid || 0)) || Number(b.remaining_balance || 0)
        : Number(b.remaining_balance || 0)
      setPaymentForm((prev) => ({
        ...prev,
        paymentType: b.booking_stage === 'booked' ? 'balance' : prev.paymentType,
        amount: prev.amount || (suggested > 0 ? String(Number(suggested.toFixed(2))) : ''),
      }))
    }
  }).catch((loadError) => setError(loadError.message)), [id])
  useEffect(() => {
    load()
    reviewsApi.booking(id).then((result) => setReview(result.review)).catch(() => {})
    bookingsApi.paymentGatewayConfig().then((res) => setGatewayConfig(res.gateway)).catch(() => {})
  }, [id, load])

  useEffect(() => {
    if (!activeCheckoutModal && !rejectPaymentTarget) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (!processingGateway) setActiveCheckoutModal(null)
        if (!verifyingPaymentId) {
          setRejectPaymentTarget(null)
          setRejectPaymentReason('')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeCheckoutModal, processingGateway, rejectPaymentTarget, verifyingPaymentId])

  useEffect(() => {
    const gwPaymentId = Number(searchParams.get('gatewayPaymentId'))
    const gwResult = searchParams.get('gatewayResult')
    if (!Number.isInteger(gwPaymentId) || gwPaymentId < 1 || !gwResult) return
    let active = true
    bookingsApi.confirmGatewayPayment(id, gwPaymentId, {
      demoOutcome: gwResult === 'success' ? 'paid' : 'cancelled',
    })
      .then((res) => {
        if (!active) return
        setStatusMessage(
          res.confirmed
            ? `Online payment confirmed (${res.payment?.transaction_code || ''})! ${res.booking?.booking_stage === 'booked' ? 'Your booking is now confirmed & paid.' : 'Payment recorded.'}`
            : 'Online checkout was cancelled or not completed. You can retry anytime below.',
        )
        navigate(`/bookings/${id}`, { replace: true })
        load()
      })
      .catch((gwErr) => {
        if (active) setError(gwErr.message)
      })
    return () => { active = false }
  }, [id, load, navigate, searchParams])

  useEffect(() => {
    if (activeSchedulePanel !== 'reschedule' || !booking?.gardener_id || !rescheduleForm.proposedStart || !rescheduleForm.proposedEnd) {
      return undefined
    }
    let active = true
    const timer = setTimeout(() => {
      if (!active) return
      setCheckingReschedule(true)
      servicesApi.checkGardenerAvailability(booking.gardener_id, {
        scheduledStart: rescheduleForm.proposedStart,
        scheduledEnd: rescheduleForm.proposedEnd,
        excludeBookingId: booking.id,
      })
        .then((res) => { if (active) setRescheduleCheck(res) })
        .catch(() => { if (active) setRescheduleCheck(null) })
        .finally(() => { if (active) setCheckingReschedule(false) })
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [activeSchedulePanel, booking?.gardener_id, booking?.id, rescheduleForm.proposedStart, rescheduleForm.proposedEnd])

  async function update(status, extra = {}) {
    setUpdatingStatus(true); setError(''); setStatusMessage('')
    try {
      await bookingsApi.status(id, status, extra)
      await load()
      if (status === 'cancelled') {
        setActiveSchedulePanel(null)
        setCancelForm({ cancellationReasonType: 'typhoon_weather', cancellationReason: '' })
        setStatusMessage('Arrangement cancelled with recorded event reason. The other party has been notified.')
      } else {
        setStatusMessage(`Booking status updated to ${formatStatusLabel(status)}.`)
      }
    } catch (statusError) {
      setError(statusError.message)
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleCancelSubmit(event) {
    event.preventDefault()
    await update('cancelled', {
      cancellationReasonType: cancelForm.cancellationReasonType,
      cancellationReason: cancelForm.cancellationReason,
    })
  }

  async function handleRescheduleSubmit(event) {
    event.preventDefault()
    setSubmittingReschedule(true); setError(''); setStatusMessage('')
    try {
      await bookingsApi.createRescheduleRequest(id, rescheduleForm)
      setRescheduleForm({
        reasonType: 'typhoon_weather',
        reasonDetails: '',
        proposedStart: '',
        proposedEnd: '',
      })
      setRescheduleCheck(null)
      setActiveSchedulePanel(null)
      setStatusMessage('Reschedule request sent! Waiting for the other party to review and approve the new date.')
      await load()
    } catch (reschedErr) {
      setError(reschedErr.message)
    } finally {
      setSubmittingReschedule(false)
    }
  }

  async function handleRescheduleDecision(requestId, decision) {
    setRespondingRescheduleId(requestId); setError(''); setStatusMessage('')
    try {
      await bookingsApi.respondRescheduleRequest(id, requestId, {
        decision,
        responseNote: rescheduleResponseNotes[requestId] || '',
      })
      setRescheduleResponseNotes((prev) => ({ ...prev, [requestId]: '' }))
      setStatusMessage(
        decision === 'approved'
          ? 'New schedule mutually approved and updated! Your agreement and verified payments remain intact.'
          : decision === 'declined'
            ? 'Reschedule request declined. Original schedule remains active.'
            : 'Pending reschedule request withdrawn.',
      )
      await load()
    } catch (decErr) {
      setError(decErr.message)
    } finally {
      setRespondingRescheduleId(null)
    }
  }

  async function handlePaymentSubmit(event) {
    event.preventDefault()
    setSubmittingPayment(true); setError(''); setStatusMessage('')
    try {
      await bookingsApi.submitPayment(id, paymentForm)
      setPaymentForm({
        paymentType: 'partial',
        paymentMethod: 'gcash',
        amount: '',
        referenceNumber: '',
        notes: '',
        receiptFile: null,
      })
      setStatusMessage('Payment proof submitted. Waiting for the gardener or assigned clerk to verify receipt.')
      await load()
    } catch (payErr) {
      setError(payErr.message)
    } finally {
      setSubmittingPayment(false)
    }
  }

  async function handleOnlineCheckoutStart(event) {
    event.preventDefault()
    setProcessingGateway(true); setError(''); setStatusMessage('')
    try {
      const onlineMethod = ['gcash', 'maya', 'grab_pay', 'card'].includes(paymentForm.paymentMethod)
        ? paymentForm.paymentMethod
        : 'gcash'
      const res = await bookingsApi.createGatewayCheckout(id, {
        paymentType: paymentForm.paymentType,
        paymentMethod: onlineMethod,
        amount: Number(paymentForm.amount),
        notes: paymentForm.notes,
      })
      if (res.checkout?.checkoutUrl && !res.checkout?.demoMode) {
        const safeUrl = String(res.checkout.checkoutUrl)
        if (!safeUrl.startsWith('https://')) {
          throw new Error('Invalid payment checkout redirect URL received from gateway.')
        }
        window.location.href = safeUrl
        return
      }
      setActiveCheckoutModal({
        paymentId: res.id,
        transactionCode: res.checkout?.transactionCode || res.payment?.transaction_code,
        sessionId: res.checkout?.sessionId,
        amount: res.checkout?.amount,
        paymentMethod: onlineMethod,
        paymentType: paymentForm.paymentType,
        provider: res.checkout?.provider || 'sandbox_demo',
      })
      await load()
    } catch (gwErr) {
      setError(gwErr.message)
    } finally {
      setProcessingGateway(false)
    }
  }

  async function handleCompleteDemoCheckout(outcome) {
    if (!activeCheckoutModal) return
    setProcessingGateway(true); setError(''); setStatusMessage('')
    try {
      const res = await bookingsApi.confirmGatewayPayment(id, activeCheckoutModal.paymentId, {
        demoOutcome: outcome,
      })
      setActiveCheckoutModal(null)
      if (res.confirmed) {
        setPaymentForm((prev) => ({ ...prev, amount: '', notes: '' }))
        setStatusMessage(
          res.booking?.booking_stage === 'booked'
            ? `Online payment verified (${res.payment?.transaction_code || ''})! Your reservation is now a Confirmed Paid Booking.`
            : `Online payment verified (${res.payment?.transaction_code || ''}) and recorded.`,
        )
      } else {
        setStatusMessage('Online checkout cancelled/declined. No charge was recorded — you can retry anytime.')
      }
      await load()
    } catch (confirmErr) {
      setError(confirmErr.message)
    } finally {
      setProcessingGateway(false)
    }
  }

  async function handleVerifyPayment(paymentId, decision, reasonOverride = '') {
    if (decision === 'rejected' && !reasonOverride.trim()) {
      setRejectPaymentTarget(payments.find((p) => p.id === paymentId) || { id: paymentId })
      setRejectPaymentReason('')
      return
    }
    const rejectionReason = decision === 'rejected' ? reasonOverride.trim() : ''
    setVerifyingPaymentId(paymentId); setError(''); setStatusMessage('')
    try {
      const res = await bookingsApi.verifyPayment(id, paymentId, { decision, rejectionReason })
      setRejectPaymentTarget(null)
      setRejectPaymentReason('')
      setStatusMessage(
        decision === 'verified'
          ? (res?.booking?.booking_stage === 'booked'
            ? 'Payment verified! Reservation is now a confirmed paid booking.'
            : 'Payment verified and recorded.')
          : 'Payment proof rejected and client notified.',
      )
      await load()
    } catch (verErr) {
      setError(verErr.message)
    } finally {
      setVerifyingPaymentId(null)
    }
  }

  async function openConversation() {
    setError('')
    try {
      const result = await communicationApi.createBookingConversation(booking.id)
      navigate(`/messages?conversationId=${result.id}`)
    } catch (conversationError) {
      setError(conversationError.message)
    }
  }

  async function handleConfirmTransactionCompletion(event) {
    event.preventDefault()
    setConfirmingClosing(true); setError(''); setStatusMessage('')
    try {
      const res = await bookingsApi.confirmTransactionCompletion(id, { note: closingNote })
      setClosingNote('')
      setStatusMessage(
        res?.closed
          ? 'Transaction Completion Agreement signed by both parties. The transaction is now closed and rating is unlocked.'
          : 'Your closing agreement sign-off has been recorded. Waiting for the other party to confirm.',
      )
      await load()
    } catch (closeErr) {
      setError(closeErr.message)
    } finally {
      setConfirmingClosing(false)
    }
  }

  async function submitReview(event) {
    event.preventDefault()
    setSubmittingReview(true); setError(''); setStatusMessage('')
    try {
      await reviewsApi.create({ bookingId: id, ...reviewForm })
      setReview({ rating: reviewForm.rating, review_text: reviewForm.reviewText })
      setOpenReviewBookingId(null)
      setStatusMessage('Thank you! Your review has been published.')
    } catch (reviewError) {
      setError(reviewError.message)
    } finally {
      setSubmittingReview(false)
    }
  }

  if (!booking) {
    return (
      <section className="container booking-content">
        {error ? (
          <div className="form-error">{error}</div>
        ) : (
          <div className="dashboard-panel skeleton-stack" aria-busy="true">
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
        )}
      </section>
    )
  }
  const gardener = Number(booking.gardener_id) === Number(user.id)
  const showReviewForm = !gardener && Boolean(booking.can_review) && !review && reviewOpen
  const roleModeMismatch = Boolean(
    user.isDualRole && ((gardener && user.role !== 'gardener') || (!gardener && user.role !== 'client')),
  )
  const agreementSummary = buildBookingAgreementSummary(booking, user)
  const isBookedPaid = booking.booking_stage === 'booked'
  const isWorkCompleted = booking.status === 'completed'
  const isFullyPaid = booking.payment_status === 'fully_paid'
  const isTransactionClosed = booking.transaction_status === 'closed'
  const canSubmitPayment = !gardener && ['accepted', 'in_progress', 'completed'].includes(booking.status) && !isFullyPaid
  const currentUserConfirmedClosing = gardener
    ? Boolean(booking.gardener_completion_confirmed_at)
    : Boolean(booking.client_completion_confirmed_at)
  const showClosingAgreementPanel = ['in_progress', 'completed'].includes(booking.status) || isFullyPaid || booking.transaction_status !== 'open'
  const verifiedTxnCodes = payments
    .filter((p) => p.status === 'verified' && p.transaction_code)
    .map((p) => p.transaction_code)
  const canModifyScheduleOrCancel = ['pending', 'accepted', 'in_progress'].includes(booking.status)
  const pendingReschedule = rescheduleRequests.find((rr) => rr.status === 'pending') || null
  const activeRescheduleCheck = (activeSchedulePanel === 'reschedule' && rescheduleForm.proposedStart && rescheduleForm.proposedEnd)
    ? rescheduleCheck
    : null

  const hasPendingPayment = payments.some((p) => p.status === 'pending')
  const workflowSteps = [
    {
      num: 1,
      label: 'Terms agreed',
      sub: 'Slot reserved',
      done: true,
      active: !isBookedPaid && booking.status !== 'cancelled',
    },
    {
      num: 2,
      label: 'Deposit paid',
      sub: isBookedPaid ? 'Booking confirmed' : 'Awaiting deposit',
      done: isBookedPaid,
      active: isBookedPaid && !isWorkCompleted && booking.status !== 'cancelled',
    },
    {
      num: 3,
      label: 'Service completed',
      sub: isWorkCompleted ? 'Work finished' : (booking.status === 'in_progress' ? 'In progress' : 'Scheduled'),
      done: isWorkCompleted,
      active: isWorkCompleted && !isTransactionClosed,
    },
    {
      num: 4,
      label: 'Closed & reviewed',
      sub: isTransactionClosed ? (review ? 'Rated' : 'Ready to rate') : 'Pay balance & sign closing',
      done: isTransactionClosed,
      active: isTransactionClosed && !review,
    },
  ]

  let nextStepGuidance = null
  if (booking.status === 'cancelled') {
    nextStepGuidance = {
      tone: 'danger',
      title: 'Arrangement Cancelled',
      text: `Cancelled due to ${BOOKING_EVENT_REASON_LABELS[booking.cancellation_reason_type] || 'a recorded event'}. See the Cancellation Record below for details.`,
    }
  } else if (pendingReschedule) {
    const waitingOnMe = Number(pendingReschedule.requested_by) !== Number(user.id)
    nextStepGuidance = {
      tone: 'warning',
      title: waitingOnMe ? 'Action Needed: Review Reschedule Request' : 'Waiting for Reschedule Approval',
      text: waitingOnMe
        ? `A request to move the date (${BOOKING_EVENT_REASON_LABELS[pendingReschedule.reason_type] || 'Event'}) is waiting for your approval or decline below.`
        : `Your request to move the date has been sent. Waiting for the ${gardener ? 'client' : 'gardener'} to respond.`,
    }
  } else if (!isBookedPaid) {
    nextStepGuidance = gardener
      ? {
        tone: hasPendingPayment ? 'warning' : 'info',
        title: hasPendingPayment ? 'Action Needed: Verify Client Payment Proof' : 'Waiting for Client Deposit',
        text: hasPendingPayment
          ? 'The client submitted a payment proof below. Verify it to upgrade this reservation into a Confirmed Booking.'
          : `This slot is reserved. Once the client submits and you verify at least ₱${Number(booking.required_deposit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}, you can start service.`,
      }
      : {
        tone: hasPendingPayment ? 'info' : 'warning',
        title: hasPendingPayment ? 'Payment Submitted — Awaiting Gardener Verification' : 'Action Needed: Submit Deposit to Confirm Booking',
        text: hasPendingPayment
          ? 'Your payment proof is awaiting verification from the gardener.'
          : `Submit at least the required deposit of ₱${Number(booking.required_deposit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} below to confirm your booking.`,
      }
  } else if (booking.status === 'accepted') {
    nextStepGuidance = gardener
      ? {
        tone: 'success',
        title: 'Confirmed Booking — Ready to Start',
        text: 'Payment deposit is verified. Click "Start service" below once you begin work on the scheduled date.',
      }
      : {
        tone: 'success',
        title: 'Booking Confirmed!',
        text: 'Your deposit is verified and your schedule slot is confirmed. You can settle any remaining balance anytime below.',
      }
  } else if (booking.status === 'in_progress') {
    nextStepGuidance = gardener
      ? {
        tone: 'info',
        title: 'Service In Progress',
        text: 'When the gardening work is finished, click "Mark completed" below.',
      }
      : {
        tone: 'info',
        title: 'Service In Progress',
        text: !isFullyPaid
          ? `Your gardening service is underway. You can submit the remaining balance of ₱${Number(booking.remaining_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} below once ready.`
          : 'Your gardening service is underway and full payment is already verified.',
      }
  } else if (isWorkCompleted && !isFullyPaid) {
    nextStepGuidance = gardener
      ? {
        tone: hasPendingPayment ? 'warning' : 'info',
        title: hasPendingPayment ? 'Action Needed: Verify Remaining Balance Payment' : 'Waiting for Remaining Balance Payment',
        text: hasPendingPayment
          ? 'Review and verify the client’s balance payment below so both parties can sign the Transaction Completion Agreement.'
          : `Work is completed. Once the client pays the remaining ₱${Number(booking.remaining_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} and you verify it, both parties can close the transaction.`,
      }
      : {
        tone: hasPendingPayment ? 'info' : 'warning',
        title: hasPendingPayment ? 'Balance Submitted — Awaiting Verification' : 'Action Needed: Settle Remaining Balance',
        text: hasPendingPayment
          ? 'Your balance payment is awaiting gardener verification.'
          : `The gardener marked the work completed. Submit the remaining ₱${Number(booking.remaining_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} below to unlock the closing agreement and rating.`,
      }
  } else if (isWorkCompleted && isFullyPaid && !isTransactionClosed) {
    nextStepGuidance = {
      tone: currentUserConfirmedClosing ? 'info' : 'warning',
      title: currentUserConfirmedClosing ? 'Waiting for Other Party to Close Transaction' : 'Action Needed: Sign Transaction Completion Agreement',
      text: currentUserConfirmedClosing
        ? `You already signed the closing agreement. Waiting for the ${gardener ? 'client' : 'gardener'} to confirm.`
        : 'Work is completed and full payment is verified! Sign the Transaction Completion Agreement below to finalize the transaction and unlock rating.',
    }
  } else if (isTransactionClosed && !gardener && !review) {
    nextStepGuidance = {
      tone: 'success',
      title: 'Transaction Closed — Share Your Review',
      text: 'Both parties finalized the closing agreement. Rate the gardener when you are ready using the review step below.',
    }
  } else if (isTransactionClosed) {
    nextStepGuidance = {
      tone: 'success',
      title: 'Transaction Completed & Closed',
      text: 'Work completed, full payment verified, and closing agreement signed by both parties.',
    }
  }

  if (showReviewForm) {
    return (
      <section
        className="container booking-content review-standalone"
        style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', paddingTop: '32px', paddingBottom: '48px' }}
      >
        <form className="dashboard-panel profile-form review-form" onSubmit={submitReview} style={{ width: '100%', maxWidth: '520px', margin: '0 auto' }}>
          <p className="eyebrow" style={{ textAlign: 'center' }}>Final step</p>
          <h2 style={{ textAlign: 'center', marginBottom: '4px' }}>Review this service</h2>
          <p className="field-note" style={{ textAlign: 'center', marginTop: 0 }}>
            <strong>{booking.service_title || 'Gardening service'}</strong>
            {booking.gardener_name ? ` · ${booking.gardener_name}` : ''}
          </p>
          <div className="review-rating-field" style={{ justifyItems: 'center', textAlign: 'center' }}>
            <span className="review-rating-label">Rating</span>
            <StarRating
              value={reviewForm.rating}
              size={32}
              label="Rating"
              onChange={(rating) => setReviewForm((current) => ({ ...current, rating }))}
            />
            <small className="field-note">Click a star to choose your rating · {reviewForm.rating} out of 5 stars</small>
          </div>
          <label>Written feedback (optional)
            <textarea rows="4" maxLength="2000" value={reviewForm.reviewText} onChange={(event) => setReviewForm({ ...reviewForm, reviewText: event.target.value })} />
          </label>
          {error && <div className="form-error" role="alert" style={{ marginBottom: '12px' }}>{error}</div>}
          <div className="register-step-actions" style={{ justifyContent: 'center' }}>
            <button type="button" className="register-back-btn" onClick={() => setOpenReviewBookingId(null)}>
              <ArrowLeft size={16} />
              <span>Back to booking</span>
            </button>
            <button className="button" type="submit" disabled={submittingReview}>
              <CheckCircle2 size={16} />
              <span>{submittingReview ? 'Submitting...' : 'Submit & publish review'}</span>
            </button>
          </div>
          <p className="field-note" style={{ textAlign: 'center', marginTop: '10px' }}>
            Nothing is published until you submit. You can go back and change your rating.
          </p>
        </form>
      </section>
    )
  }

  return (
    <section className="container booking-content">
      <Link className="back-link" to="/bookings"><ArrowLeft size={15} /> Back to bookings</Link>
      <p className="eyebrow">
        {isTransactionClosed
          ? `Closed Transaction #${booking.id}`
          : (isBookedPaid ? `Confirmed Booking #${booking.id}` : `Reservation #${booking.id} (Payment Required)`)}
      </p>
      <h1>{booking.service_title || 'Gardening service'}</h1>
      <div className="booking-status-row">
        <span className={getStatusBadgeClass(booking.booking_stage)}>{formatStatusLabel(booking.booking_stage)}</span>
        <span className={getStatusBadgeClass(booking.payment_status)}>{formatStatusLabel(booking.payment_status)}</span>
        <span className={getStatusBadgeClass(booking.status)}>{formatStatusLabel(booking.status)}</span>
        {booking.transaction_status && booking.transaction_status !== 'open' && (
          <span className={getStatusBadgeClass(booking.transaction_status)}>
            {booking.transaction_status === 'closed' ? 'Transaction Closed' : formatStatusLabel(booking.transaction_status)}
          </span>
        )}
        <span>{gardener ? booking.client_name : booking.gardener_name}</span>
        {agreementSummary.inquiryPath && (
          <Link className="text-link" to={agreementSummary.inquiryPath}>
            View source inquiry #{booking.inquiry_id}
          </Link>
        )}
        <button className="table-action" type="button" onClick={openConversation}>Open conversation</button>
        <button className="table-action no-print" type="button" onClick={() => window.print()}>
          <Printer size={14} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} /> Print / Save PDF
        </button>
      </div>
      {roleModeMismatch && (
        <div className="booking-next-banner tone-warning no-print" role="status">
          <strong>Viewing in opposite workspace mode</strong>
          <p>
            You are the <strong>{gardener ? 'Gardener' : 'Client'}</strong> on this booking, while your sidebar is currently set to <strong>{user.role === 'gardener' ? 'Gardener' : 'Client'} Mode</strong>. Switch mode in the sidebar before submitting payments or updating service status.
          </p>
        </div>
      )}
      {booking.status !== 'cancelled' && booking.status !== 'declined' && !showReviewForm && (
        <p className="field-note booking-stepper-caption">Where you are — each stage unlocks the next.</p>
      )}
      {booking.status !== 'cancelled' && booking.status !== 'declined' && !showReviewForm && (
        <ol className="booking-stepper" aria-label="Booking progress">
          {workflowSteps.map((step) => (
            <li
              key={step.num}
              className={`booking-step${step.done ? ' is-done' : ''}${step.active ? ' is-current' : ''}`}
            >
              <span className="booking-step-num" aria-hidden="true">
                {step.done ? <CheckCircle2 size={16} /> : step.num}
              </span>
              <span className="booking-step-copy">
                <strong>{step.label}</strong>
                <small>{step.sub}</small>
              </span>
            </li>
          ))}
        </ol>
      )}
      {nextStepGuidance && (
        <div className={`booking-next-banner tone-${nextStepGuidance.tone}`} role="status">
          <strong>{nextStepGuidance.title}</strong>
          <p>{nextStepGuidance.text}</p>
        </div>
      )}
      {!gardener && booking?.can_review && !review && !reviewOpen && (
        <div className="review-entry-panel">
          <div>
            <strong>Final step — share your review</strong>
            <p>Choose a star rating and optionally add feedback. Your review is published only after you submit it.</p>
          </div>
          <button className="button" type="button" onClick={() => setOpenReviewBookingId(id)}>
            <Star size={16} />
            <span>Rate this service</span>
          </button>
        </div>
      )}
      {statusMessage && <TransientSuccess key={statusMessage} message={statusMessage} onDismiss={() => setStatusMessage('')} style={{ marginBottom: '16px' }} />}
      {error && <div className="form-error" role="alert" style={{ marginBottom: '16px' }}>{error}</div>}
      <article className="dashboard-panel booking-detail-card">
        <div className="payment-status-panel">
          <div className="payment-status-heading">
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>Reservation &amp; payment status</p>
              <strong>
                {isBookedPaid
                  ? 'Confirmed Paid Booking — Eligible for Service Execution'
                  : 'Reserved Slot Only — Partial Deposit or Full Payment Required to Confirm Booking'}
              </strong>
            </div>
            <div className="payment-due-chip">
              <small>Amount to pay now</small>
              <strong>₱{(isBookedPaid
                ? Math.max(0, Number(booking.remaining_balance || 0))
                : Math.max(0, Number(booking.required_deposit_amount || 0) - Number(booking.amount_paid || 0))
              ).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>
          <div className="detail-facts payment-facts-grid">
            <span><strong>Agreed total</strong>₱{Number(booking.agreed_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span><strong>Required deposit</strong>₱{Number(booking.required_deposit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span><strong>Verified paid</strong>₱{Number(booking.amount_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span><strong>Remaining balance</strong>₱{Number(booking.remaining_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>

          {canSubmitPayment && (
            <div className="payment-channel-box">
              <div className="payment-channel-tabs" role="tablist" aria-label="Payment channel">
                <button
                  type="button"
                  role="tab"
                  aria-selected={paymentChannel === 'online'}
                  className={`payment-channel-tab${paymentChannel === 'online' ? ' is-active' : ''}`}
                  onClick={() => setPaymentChannel('online')}
                >
                  <CreditCard size={15} />
                  <span className="payment-tab-copy">
                    <span>Pay Online (GCash / Maya / Card)</span>
                    <small>Instant checkout · {gatewayConfig?.provider === 'paymongo' ? 'PayMongo' : 'Sandbox Demo'}</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={paymentChannel === 'manual'}
                  className={`payment-channel-tab${paymentChannel === 'manual' ? ' is-active' : ''}`}
                  onClick={() => setPaymentChannel('manual')}
                >
                  <Upload size={15} />
                  <span className="payment-tab-copy">
                    <span>Manual Cash / Receipt Upload</span>
                    <small>Upload proof for verification</small>
                  </span>
                </button>
              </div>

              {paymentChannel === 'online' ? (
                <form className="profile-form payment-submit-form" onSubmit={handleOnlineCheckoutStart}>
                  <div className="gateway-info-strip">
                    <ShieldCheck size={16} />
                    <span>
                      <strong>{gatewayConfig?.label || 'Online Checkout (GCash, Maya, GrabPay, Card)'}</strong>
                      {' — '}
                      {gatewayConfig?.provider === 'paymongo'
                        ? 'Secure hosted checkout via PayMongo. Your reservation upgrades automatically upon payment.'
                        : 'Built-in Sandbox / Demo Checkout active (no real money charged). Automatically verifies payment and issues your TXN code.'}
                    </span>
                  </div>
                  <div className="form-row form-row-3">
                    <label>Payment type
                      <select value={paymentForm.paymentType} onChange={(e) => setPaymentForm({ ...paymentForm, paymentType: e.target.value })}>
                        <option value="partial">Partial payment (Deposit)</option>
                        <option value="full">Full payment</option>
                        <option value="balance">Remaining balance</option>
                      </select>
                    </label>
                    <label>Online payment method
                      <select
                        value={['gcash', 'maya', 'grab_pay', 'card'].includes(paymentForm.paymentMethod) ? paymentForm.paymentMethod : 'gcash'}
                        onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                      >
                        <option value="gcash">GCash (Instant E-Wallet)</option>
                        <option value="maya">Maya (Instant E-Wallet)</option>
                        <option value="grab_pay">GrabPay</option>
                        <option value="card">Credit / Debit Card (Visa / Mastercard)</option>
                      </select>
                    </label>
                    <label>Amount to pay (PHP, min ₱20)
                      <input required type="number" min="20" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                    </label>
                  </div>
                  <div className="inline-actions payment-quick-actions">
                    <span className="field-note">Quick amounts</span>
                    {!isBookedPaid && Number(booking.required_deposit_amount || 0) > Number(booking.amount_paid || 0) && (
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => setPaymentForm({
                          ...paymentForm,
                          paymentType: 'partial',
                          amount: String(Math.max(20, Number((Number(booking.required_deposit_amount) - Number(booking.amount_paid || 0)).toFixed(2)))),
                        })}
                      >
                        Fill Required Deposit (₱{Math.max(0, Number(booking.required_deposit_amount) - Number(booking.amount_paid || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })})
                      </button>
                    )}
                    {Number(booking.remaining_balance || 0) >= 20 && (
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => setPaymentForm({
                          ...paymentForm,
                          paymentType: isBookedPaid ? 'balance' : 'full',
                          amount: String(Number(Number(booking.remaining_balance).toFixed(2))),
                        })}
                      >
                        Fill Full Remaining Balance (₱{Number(booking.remaining_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })})
                      </button>
                    )}
                  </div>
                  <label>Notes <span className="label-note">(Optional)</span>
                    <input maxLength="500" placeholder="e.g., Online deposit via GCash Checkout" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
                  </label>
                  <div>
                    <button className="button" type="submit" disabled={processingGateway}>
                      <CreditCard size={15} /> {processingGateway ? 'Creating checkout session...' : 'Proceed to Online Checkout'}
                    </button>
                  </div>
                </form>
              ) : (
                <form className="profile-form payment-submit-form" onSubmit={handlePaymentSubmit}>
                  <p className="auth-section-title">Submit direct payment proof (GCash, Maya, Bank Transfer, or Cash)</p>
                  <div className="form-row form-row-3">
                    <label>Payment type
                      <select value={paymentForm.paymentType} onChange={(e) => setPaymentForm({ ...paymentForm, paymentType: e.target.value })}>
                        <option value="partial">Partial payment (Deposit)</option>
                        <option value="full">Full payment</option>
                        <option value="balance">Remaining balance</option>
                      </select>
                    </label>
                    <label>Payment method
                      <select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}>
                        <option value="gcash">GCash</option>
                        <option value="maya">Maya</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cash">Cash (In Person)</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>Amount paid (PHP) <span className="required-mark" aria-hidden="true">*</span>
                      <input required type="number" min="1" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                    </label>
                  </div>
                  <div className="inline-actions payment-quick-actions">
                    <span className="field-note">Quick amounts</span>
                    {!isBookedPaid && Number(booking.required_deposit_amount || 0) > Number(booking.amount_paid || 0) && (
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => setPaymentForm({
                          ...paymentForm,
                          paymentType: 'partial',
                          amount: String(Math.max(1, Number((Number(booking.required_deposit_amount) - Number(booking.amount_paid || 0)).toFixed(2)))),
                        })}
                      >
                        Fill Required Deposit (₱{Math.max(0, Number(booking.required_deposit_amount) - Number(booking.amount_paid || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })})
                      </button>
                    )}
                    {Number(booking.remaining_balance || 0) >= 1 && (
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => setPaymentForm({
                          ...paymentForm,
                          paymentType: isBookedPaid ? 'balance' : 'full',
                          amount: String(Number(Number(booking.remaining_balance).toFixed(2))),
                        })}
                      >
                        Fill Full Remaining Balance (₱{Number(booking.remaining_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })})
                      </button>
                    )}
                  </div>
                  <div className="form-row">
                    <label>Reference / transaction no. <span className="label-note">(Optional)</span>
                      <input maxLength="100" placeholder="e.g., GCash Ref #123456789" value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })} />
                    </label>
                    <label>Payment receipt photo <span className="label-note">(Optional JPEG/PNG/WebP)</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPaymentForm({ ...paymentForm, receiptFile: e.target.files?.[0] || null })} />
                    </label>
                  </div>
                  <label>Notes <span className="label-note">(Optional)</span>
                    <input maxLength="500" placeholder="e.g., Paid 30% downpayment via GCash" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
                  </label>
                  <div>
                    <button className="button" type="submit" disabled={submittingPayment}>
                      {submittingPayment ? 'Submitting...' : 'Submit payment proof'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {activeCheckoutModal && (
            <div
              className="gateway-demo-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="demo-checkout-title"
              onClick={(e) => { if (e.target === e.currentTarget && !processingGateway) setActiveCheckoutModal(null) }}
            >
              <div className="gateway-demo-modal">
                <p className="eyebrow" style={{ marginBottom: '4px' }}>HugaTiera Third-Party Checkout Simulator</p>
                <h2 id="demo-checkout-title">Authorize Online Payment</h2>
                <p className="field-note">
                  Simulated PayMongo Checkout session (Sandbox / Demo Mode — no real funds are debited). Completing this step verifies your payment immediately and upgrades your booking.
                </p>
                <dl className="gateway-demo-summary">
                  <div><dt>Transaction code</dt><dd><strong>{activeCheckoutModal.transactionCode}</strong></dd></div>
                  <div><dt>Session ID</dt><dd><code>{activeCheckoutModal.sessionId}</code></dd></div>
                  <div><dt>Payment method</dt><dd>{PAYMENT_METHOD_LABELS[activeCheckoutModal.paymentMethod] || activeCheckoutModal.paymentMethod}</dd></div>
                  <div><dt>Amount due</dt><dd><strong>₱{Number(activeCheckoutModal.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></dd></div>
                </dl>
                <div className="gateway-demo-actions">
                  <button
                    className="button"
                    type="button"
                    disabled={processingGateway}
                    onClick={() => handleCompleteDemoCheckout('paid')}
                  >
                    <CheckCircle2 size={16} /> {processingGateway ? 'Confirming...' : 'Authorize & Complete Payment'}
                  </button>
                  <button
                    className="table-action table-action-danger"
                    type="button"
                    disabled={processingGateway}
                    onClick={() => handleCompleteDemoCheckout('cancelled')}
                  >
                    Simulate Cancelled Payment
                  </button>
                  <button
                    className="table-action"
                    type="button"
                    disabled={processingGateway}
                    onClick={() => setActiveCheckoutModal(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {payments.length > 0 && (
            <div className="payment-history-list">
              <div className="payment-history-intro">
                <strong>Payment transactions ({payments.length})</strong>
                <p className="field-note">
                  Each card is one payment. Pending still needs checkout or verification. Verified counts toward this booking. Rejected does not count until a new proof is accepted.
                </p>
              </div>
              {payments.map((pay) => (
                <article className="payment-record-card" key={pay.id}>
                  <div className="price-predictor-range-row">
                    <div className="payment-record-title">
                      {pay.transaction_code && <span className="txn-code-badge">{pay.transaction_code}</span>}
                      {pay.gateway_provider && pay.gateway_provider !== 'manual' && (
                        <span className="gateway-provider-badge">
                          {GATEWAY_PROVIDER_LABELS[pay.gateway_provider] || pay.gateway_provider}
                        </span>
                      )}
                      <strong>
                        ₱{Number(pay.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <span className={getStatusBadgeClass(pay.status)}>{formatStatusLabel(pay.status)}</span>
                  </div>
                  <dl className="payment-record-facts">
                    <div>
                      <dt>Type</dt>
                      <dd>{formatStatusLabel(pay.payment_type)}</dd>
                    </div>
                    <div>
                      <dt>Method</dt>
                      <dd>{PAYMENT_METHOD_LABELS[pay.payment_method] || pay.payment_method}</dd>
                    </div>
                    <div>
                      <dt>Submitted</dt>
                      <dd>{new Date(pay.created_at).toLocaleString()}</dd>
                    </div>
                    {pay.reference_number && (
                      <div>
                        <dt>Reference</dt>
                        <dd>{pay.reference_number}</dd>
                      </div>
                    )}
                    {pay.notes && (
                      <div>
                        <dt>Notes</dt>
                        <dd>{pay.notes}</dd>
                      </div>
                    )}
                  </dl>
                  {pay.rejection_reason && (
                    <p className="field-error-note" style={{ margin: '4px 0 0' }}>Rejection reason: {pay.rejection_reason}</p>
                  )}
                  <div className="inline-actions" style={{ marginTop: '6px' }}>
                    {!gardener && pay.status === 'pending' && pay.gateway_provider === 'sandbox_demo' && (
                      <button
                        type="button"
                        className="button button-sm"
                        onClick={() => setActiveCheckoutModal({
                          paymentId: pay.id,
                          transactionCode: pay.transaction_code,
                          sessionId: pay.gateway_session_id,
                          amount: pay.amount,
                          paymentMethod: pay.payment_method,
                          paymentType: pay.payment_type,
                          provider: pay.gateway_provider,
                        })}
                      >
                        <CreditCard size={14} /> Resume Online Checkout
                      </button>
                    )}
                    {!gardener && pay.status === 'pending' && pay.gateway_provider === 'paymongo' && pay.gateway_checkout_url && (
                      <a className="button button-sm" href={pay.gateway_checkout_url}>
                        <ExternalLink size={14} /> Resume PayMongo Checkout
                      </a>
                    )}
                    {pay.receipt_path && (
                      <a className="text-link" href={bookingsApi.receiptUrl(booking.id, pay.id)} target="_blank" rel="noreferrer">
                        View payment receipt
                      </a>
                    )}
                    {gardener && pay.status === 'pending' && (
                      <>
                        <button
                          className="button"
                          type="button"
                          disabled={verifyingPaymentId === pay.id}
                          onClick={() => handleVerifyPayment(pay.id, 'verified')}
                        >
                          {verifyingPaymentId === pay.id ? 'Verifying...' : 'Verify payment'}
                        </button>
                        <button
                          className="table-action table-action-danger"
                          type="button"
                          disabled={verifyingPaymentId === pay.id}
                          onClick={() => handleVerifyPayment(pay.id, 'rejected')}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {rejectPaymentTarget && (
            <div
              className="gateway-demo-backdrop no-print"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reject-payment-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !verifyingPaymentId) {
                  setRejectPaymentTarget(null)
                  setRejectPaymentReason('')
                }
              }}
            >
              <div className="gateway-demo-modal">
                <p className="eyebrow" style={{ marginBottom: '4px' }}>Payment verification</p>
                <h2 id="reject-payment-title">Reject payment proof?</h2>
                <p className="field-note">
                  Provide a clear reason for rejecting {rejectPaymentTarget.transaction_code || `Payment #${rejectPaymentTarget.id}`}. The client will be notified so they can re-submit valid proof.
                </p>
                <form
                  className="profile-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!rejectPaymentReason.trim()) return
                    handleVerifyPayment(rejectPaymentTarget.id, 'rejected', rejectPaymentReason)
                  }}
                >
                  <label>
                    Rejection reason
                    <textarea
                      required
                      rows="3"
                      maxLength="500"
                      placeholder="e.g., Reference number does not match our GCash statement or receipt photo is unreadable."
                      value={rejectPaymentReason}
                      onChange={(e) => setRejectPaymentReason(e.target.value)}
                    />
                  </label>
                  <div className="gateway-demo-actions">
                    <button
                      type="submit"
                      className="button button-danger"
                      disabled={verifyingPaymentId === rejectPaymentTarget.id || !rejectPaymentReason.trim()}
                    >
                      {verifyingPaymentId === rejectPaymentTarget.id ? 'Rejecting...' : 'Confirm rejection'}
                    </button>
                    <button
                      type="button"
                      className="table-action"
                      disabled={verifyingPaymentId === rejectPaymentTarget.id}
                      onClick={() => { setRejectPaymentTarget(null); setRejectPaymentReason('') }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        <div className="detail-facts">
          <span><strong>Starts</strong>{new Date(booking.scheduled_start).toLocaleString()}</span>
          <span><strong>Ends</strong>{new Date(booking.scheduled_end).toLocaleString()}</span>
          <span><strong>Location</strong>{booking.location}</span>
        </div>
        {agreementSummary.hasAgreement && (
          <div className="booking-agreement-summary">
            <p className="eyebrow">Mutual service agreement</p>
            <h2>{agreementSummary.versionLabel}</h2>
            <div className="detail-facts booking-agreement-facts">
              {agreementSummary.amountLabel && (
                <span><strong>Agreed price</strong>{agreementSummary.amountLabel}</span>
              )}
              <span><strong>Client approval</strong>{agreementSummary.clientApproval.label}</span>
              <span><strong>Gardener approval</strong>{agreementSummary.gardenerApproval.label}</span>
            </div>
            {agreementSummary.scopeOfWork && (
              <>
                <h3>Agreed scope of work</h3>
                <p className="inquiry-description">{agreementSummary.scopeOfWork}</p>
              </>
            )}
            {agreementSummary.conditions && (
              <>
                <h3>Agreed conditions</h3>
                <p className="inquiry-description">{agreementSummary.conditions}</p>
              </>
            )}
            {agreementSummary.inquiryPath && (
              <p className="booking-agreement-link">
                <Link className="text-link" to={agreementSummary.inquiryPath}>
                  Open originating inquiry #{booking.inquiry_id}
                </Link>
              </p>
            )}
          </div>
        )}
        <h2>Additional information</h2>
        <p className="inquiry-description">{booking.notes || 'No additional information provided.'}</p>
        <div className="inline-actions">
          {gardener && booking.status === 'pending' && (
            <>
              <button className="button" type="button" disabled={updatingStatus} onClick={() => update('accepted')}>
                {updatingStatus ? 'Saving...' : 'Accept'}
              </button>
              <button className="table-action" type="button" disabled={updatingStatus} onClick={() => update('declined')}>
                {updatingStatus ? 'Saving...' : 'Decline'}
              </button>
            </>
          )}
          {gardener && booking.status === 'accepted' && (
            <>
              <button className="button" type="button" disabled={updatingStatus || !isBookedPaid} onClick={() => update('in_progress')}>
                {updatingStatus ? 'Saving...' : 'Start service'}
              </button>
              {!isBookedPaid && (
                <span className="field-note">
                  Verify at least the required deposit (₱{Number(booking.required_deposit_amount || 0).toLocaleString()}) above to upgrade this reservation into a confirmed booking before starting service.
                </span>
              )}
            </>
          )}
          {gardener && booking.status === 'in_progress' && (
            <button className="button" type="button" disabled={updatingStatus} onClick={() => update('completed')}>
              {updatingStatus ? 'Saving...' : 'Mark completed'}
            </button>
          )}
          {canModifyScheduleOrCancel && (
            <>
              <button
                className="table-action"
                type="button"
                disabled={Boolean(pendingReschedule)}
                onClick={() => setActiveSchedulePanel((prev) => (prev === 'reschedule' ? null : 'reschedule'))}
              >
                <CalendarClock size={15} /> {pendingReschedule ? 'Reschedule pending' : 'Move date (Reschedule)'}
              </button>
              <button
                className="table-action table-action-danger"
                type="button"
                onClick={() => setActiveSchedulePanel((prev) => (prev === 'cancel' ? null : 'cancel'))}
              >
                <AlertTriangle size={15} /> {isBookedPaid ? 'Cancel booking (Event / Reason)' : 'Cancel reservation (Event / Reason)'}
              </button>
            </>
          )}
        </div>

        {booking.status === 'cancelled' && (
          <div className="event-cancel-record" role="status">
            <div className="review-locked-head">
              <AlertTriangle size={18} />
              <h2>Cancellation Record</h2>
            </div>
            <div className="detail-facts" style={{ margin: 0 }}>
              <span>
                <strong>Event / Reason</strong>
                {BOOKING_EVENT_REASON_LABELS[booking.cancellation_reason_type] || formatStatusLabel(booking.cancellation_reason_type || 'other')}
              </span>
              {booking.cancelled_by_name && (
                <span>
                  <strong>Cancelled by</strong>
                  {booking.cancelled_by_name} ({formatStatusLabel(booking.cancelled_by_role)})
                </span>
              )}
              {booking.cancelled_at && (
                <span>
                  <strong>Cancelled on</strong>
                  {new Date(booking.cancelled_at).toLocaleString()}
                </span>
              )}
            </div>
            {booking.cancellation_reason && (
              <p className="inquiry-description" style={{ margin: 0 }}>
                <strong>Details:</strong> {booking.cancellation_reason}
              </p>
            )}
            {Number(booking.amount_paid || 0) > 0 && (
              <p className="field-note" style={{ margin: 0 }}>
                Note: Verified payments totaling ₱{Number(booking.amount_paid).toLocaleString(undefined, { minimumFractionDigits: 2 })} were recorded prior to cancellation. Please coordinate directly regarding any deposit refund or re-booking.
              </p>
            )}
          </div>
        )}

        {canModifyScheduleOrCancel && activeSchedulePanel === 'reschedule' && !pendingReschedule && (
          <form className="profile-form schedule-event-panel" onSubmit={handleRescheduleSubmit}>
            <div className="price-predictor-range-row">
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Move service date</p>
                <strong style={{ fontSize: '16px', color: 'var(--forest)' }}>Request a Mutual Schedule Change</strong>
              </div>
              <button className="table-action" type="button" onClick={() => setActiveSchedulePanel(null)}>Close</button>
            </div>
            <p className="field-note" style={{ margin: 0 }}>
              Moving the date due to a typhoon, accident, or schedule change keeps your existing agreement and verified payments intact. The other party must approve the proposed date before the schedule updates.
            </p>
            <label>Event / Reason for moving the date
              <select
                value={rescheduleForm.reasonType}
                onChange={(e) => setRescheduleForm({ ...rescheduleForm, reasonType: e.target.value })}
              >
                {BOOKING_EVENT_REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label>Explanation / details
              <textarea
                required
                rows="3"
                minLength="3"
                maxLength="1000"
                placeholder="e.g., Heavy typhoon rains expected in Zamboanga City; requesting to move the job to next week."
                value={rescheduleForm.reasonDetails}
                onChange={(e) => setRescheduleForm({ ...rescheduleForm, reasonDetails: e.target.value })}
              />
            </label>
            <div className="form-row">
              <label>Proposed new start date &amp; time
                <input
                  required
                  type="datetime-local"
                  value={rescheduleForm.proposedStart}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, proposedStart: e.target.value })}
                />
              </label>
              <label>Proposed new end date &amp; time
                <input
                  required
                  type="datetime-local"
                  value={rescheduleForm.proposedEnd}
                  onChange={(e) => setRescheduleForm({ ...rescheduleForm, proposedEnd: e.target.value })}
                />
              </label>
            </div>
            {checkingReschedule && <p className="field-note">Checking gardener working days, blocked dates, and simultaneous capacity...</p>}
            {!checkingReschedule && activeRescheduleCheck && (
              <div className={`availability-banner${activeRescheduleCheck.available ? ' is-available' : ' is-conflict'}`} role="status">
                {activeRescheduleCheck.available ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
                <span>{activeRescheduleCheck.message}</span>
              </div>
            )}
            <div className="inline-actions">
              <button
                className="button"
                type="submit"
                disabled={submittingReschedule || (activeRescheduleCheck && !activeRescheduleCheck.available)}
              >
                {submittingReschedule ? 'Submitting request...' : 'Submit reschedule request'}
              </button>
              <button className="table-action" type="button" onClick={() => setActiveSchedulePanel(null)}>Cancel</button>
            </div>
          </form>
        )}

        {canModifyScheduleOrCancel && activeSchedulePanel === 'cancel' && (
          <form className="profile-form schedule-event-panel is-cancel-panel" onSubmit={handleCancelSubmit}>
            <div className="price-predictor-range-row">
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Event-based cancellation</p>
                <strong style={{ fontSize: '16px', color: '#9A2C2C' }}>
                  Cancel this {isBookedPaid ? 'Booking' : 'Reservation'}
                </strong>
              </div>
              <button className="table-action" type="button" onClick={() => setActiveSchedulePanel(null)}>Close</button>
            </div>
            {Number(booking.amount_paid || 0) > 0 && (
              <div className="availability-banner is-conflict" role="note">
                <AlertTriangle size={16} />
                <span>
                  ₱{Number(booking.amount_paid).toLocaleString(undefined, { minimumFractionDigits: 2 })} in verified payments is already recorded. If this is caused by a typhoon, accident, or schedule change, consider{' '}
                  <button
                    type="button"
                    className="text-link"
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontWeight: 700 }}
                    onClick={() => setActiveSchedulePanel('reschedule')}
                  >
                    moving the date instead
                  </button>{' '}
                  to keep your payment intact. Any refund after cancellation is settled directly between client and gardener.
                </span>
              </div>
            )}
            <label>Event / Reason for cancellation
              <select
                value={cancelForm.cancellationReasonType}
                onChange={(e) => setCancelForm({ ...cancelForm, cancellationReasonType: e.target.value })}
              >
                {BOOKING_EVENT_REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label>Cancellation details (required)
              <textarea
                required
                rows="3"
                minLength="3"
                maxLength="1000"
                placeholder="Explain the event or change (e.g., typhoon warning, sudden accident, or site access issue)."
                value={cancelForm.cancellationReason}
                onChange={(e) => setCancelForm({ ...cancelForm, cancellationReason: e.target.value })}
              />
            </label>
            <div className="inline-actions">
              <button className="button button-danger" type="submit" disabled={updatingStatus}>
                {updatingStatus ? 'Cancelling...' : `Confirm cancel ${isBookedPaid ? 'booking' : 'reservation'}`}
              </button>
              {!pendingReschedule && (
                <button className="table-action" type="button" onClick={() => setActiveSchedulePanel('reschedule')}>
                  Move date instead
                </button>
              )}
            </div>
          </form>
        )}

        {rescheduleRequests.length > 0 && (
          <div className="reschedule-history-panel">
            <p className="eyebrow" style={{ margin: 0 }}>Schedule changes &amp; reschedule requests ({rescheduleRequests.length})</p>
            {rescheduleRequests.map((rr) => {
              const isRequester = Number(rr.requested_by) === Number(user.id)
              return (
                <div className={`reschedule-card${rr.status === 'pending' ? ' is-pending' : ''}`} key={rr.id}>
                  <div className="price-predictor-range-row">
                    <strong>
                      {BOOKING_EVENT_REASON_LABELS[rr.reason_type] || formatStatusLabel(rr.reason_type)} · Requested by {rr.requested_by_name} ({formatStatusLabel(rr.requested_by_role)})
                    </strong>
                    <span className={getStatusBadgeClass(rr.status)}>{formatStatusLabel(rr.status)}</span>
                  </div>
                  <p className="inquiry-description" style={{ margin: '4px 0' }}>{rr.reason_details}</p>
                  <div className="detail-facts" style={{ margin: '6px 0' }}>
                    <span>
                      <strong>Previous schedule</strong>
                      {new Date(rr.previous_start).toLocaleString()} – {new Date(rr.previous_end).toLocaleString()}
                    </span>
                    <span>
                      <strong>Proposed new schedule</strong>
                      {new Date(rr.proposed_start).toLocaleString()} – {new Date(rr.proposed_end).toLocaleString()}
                    </span>
                  </div>
                  {rr.response_note && (
                    <small>
                      Response{rr.responded_by_name ? ` by ${rr.responded_by_name}` : ''}: {rr.response_note}
                    </small>
                  )}
                  {rr.status === 'pending' && !isRequester && (
                    <div className="reschedule-response-controls">
                      <input
                        maxLength="500"
                        placeholder="Optional note (e.g., Approved, stay safe during the typhoon!)"
                        value={rescheduleResponseNotes[rr.id] || ''}
                        onChange={(e) => setRescheduleResponseNotes((prev) => ({ ...prev, [rr.id]: e.target.value }))}
                      />
                      <div className="inline-actions">
                        <button
                          className="button"
                          type="button"
                          disabled={respondingRescheduleId === rr.id}
                          onClick={() => handleRescheduleDecision(rr.id, 'approved')}
                        >
                          {respondingRescheduleId === rr.id ? 'Saving...' : 'Approve new date'}
                        </button>
                        <button
                          className="table-action table-action-danger"
                          type="button"
                          disabled={respondingRescheduleId === rr.id}
                          onClick={() => handleRescheduleDecision(rr.id, 'declined')}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  )}
                  {rr.status === 'pending' && isRequester && (
                    <div className="inline-actions" style={{ marginTop: '8px' }}>
                      <span className="field-note">Waiting for the {gardener ? 'client' : 'gardener'} to approve or decline.</span>
                      <button
                        className="table-action"
                        type="button"
                        disabled={respondingRescheduleId === rr.id}
                        onClick={() => handleRescheduleDecision(rr.id, 'cancelled')}
                      >
                        {respondingRescheduleId === rr.id ? 'Withdrawing...' : 'Withdraw request'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {showClosingAgreementPanel && (
          <div className="transaction-closing-panel">
            <div className="price-predictor-range-row">
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Transaction completion agreement</p>
                <strong style={{ fontSize: '17px', color: 'var(--forest)' }}>
                  {isTransactionClosed
                    ? 'Transaction Finalized & Closed by Both Parties'
                    : 'Ending Agreement — Required to Close Transaction & Unlock Rating'}
                </strong>
              </div>
              <span className={getStatusBadgeClass(booking.transaction_status || 'open')}>
                {isTransactionClosed
                  ? 'Transaction Closed'
                  : (booking.transaction_status === 'pending_closure' ? 'Awaiting Closing Agreement' : 'In Progress')}
              </span>
            </div>
            <p className="field-note" style={{ margin: 0 }}>
              Both the client and gardener confirm that the gardening service is finished and all agreed payments have been settled. Client rating and review unlock only after this closing agreement is signed by both parties.
            </p>
            <ul className="closing-checklist">
              <li className={isWorkCompleted ? 'is-done' : ''}>
                <CheckCircle2 size={16} />
                <span>
                  <strong>1. Service work completed:</strong>{' '}
                  {isWorkCompleted ? 'Marked completed by gardener.' : 'Waiting for gardener to mark the work completed.'}
                </span>
              </li>
              <li className={isFullyPaid ? 'is-done' : ''}>
                <CheckCircle2 size={16} />
                <span>
                  <strong>2. Full payment verified:</strong>{' '}
                  {isFullyPaid
                    ? `Full agreed amount of ₱${Number(booking.amount_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} verified.`
                    : `Remaining balance of ₱${Number(booking.remaining_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} must be paid and verified by the gardener.`}
                </span>
              </li>
              <li className={isTransactionClosed ? 'is-done' : ''}>
                <FileCheck2 size={16} />
                <span>
                  <strong>3. Mutual closing sign-off:</strong>{' '}
                  Client: {booking.client_completion_confirmed_at
                    ? `Signed on ${new Date(booking.client_completion_confirmed_at).toLocaleString()}`
                    : 'Pending'} · Gardener: {booking.gardener_completion_confirmed_at
                    ? `Signed on ${new Date(booking.gardener_completion_confirmed_at).toLocaleString()}`
                    : 'Pending'}
                </span>
              </li>
            </ul>

            {isWorkCompleted && isFullyPaid && !isTransactionClosed && (
              currentUserConfirmedClosing ? (
                <div className="availability-banner is-available" role="status">
                  <CheckCircle2 size={16} />
                  <span>
                    You have signed the Transaction Completion Agreement. Waiting for the {gardener ? 'client' : 'gardener'} to confirm and close the transaction.
                  </span>
                </div>
              ) : (
                <form className="profile-form payment-submit-form" onSubmit={handleConfirmTransactionCompletion}>
                  <label>Closing agreement note <span className="label-note">(Optional — e.g., work inspected &amp; full payment settled)</span>
                    <input
                      maxLength="1000"
                      placeholder="Optional confirmation note for the closing record"
                      value={closingNote}
                      onChange={(e) => setClosingNote(e.target.value)}
                    />
                  </label>
                  <div>
                    <button className="button" type="submit" disabled={confirmingClosing}>
                      {confirmingClosing ? 'Signing closing agreement...' : 'Confirm & sign Transaction Completion Agreement'}
                    </button>
                  </div>
                </form>
              )
            )}

            {isTransactionClosed && (
              <div className="closing-summary-box">
                <div className="detail-facts" style={{ margin: 0 }}>
                  <span>
                    <strong>Closed on</strong>
                    {booking.transaction_closed_at ? new Date(booking.transaction_closed_at).toLocaleString() : 'Recorded'}
                  </span>
                  <span>
                    <strong>Total verified paid</strong>
                    ₱{Number(booking.amount_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  {verifiedTxnCodes.length > 0 && (
                    <span>
                      <strong>Transaction IDs</strong>
                      {verifiedTxnCodes.join(', ')}
                    </span>
                  )}
                </div>
                {booking.completion_agreement_notes && (
                  <p className="field-note" style={{ margin: '8px 0 0', whiteSpace: 'pre-line' }}>
                    <strong>Closing notes:</strong>{'\n'}{booking.completion_agreement_notes}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

      </article>
      {!gardener && isWorkCompleted && !review && !booking.can_review && (
        <div className="dashboard-panel review-locked-notice">
          <div className="review-locked-head">
            <Lock size={18} />
            <h2>Rating &amp; review locked until transaction closes</h2>
          </div>
          <p className="field-note" style={{ margin: 0 }}>
            {!isFullyPaid
              ? `Please submit and have the gardener verify the remaining balance of ₱${Number(booking.remaining_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} above, then sign the Transaction Completion Agreement to unlock rating.`
              : 'Full payment is verified! Both you and the gardener must sign the Transaction Completion Agreement above to finalize the transaction and unlock rating.'}
          </p>
        </div>
      )}
      {!gardener && review && (
        <div className="dashboard-panel review-card">
          <h2>Your review</h2>
          <StarRating className="review-card-stars" value={review.rating} size={20} />
          <p>{review.review_text || 'No written feedback provided.'}</p>
        </div>
      )}
    </section>
  )
}

function BookingList() {
  const { user } = useAuth()
  const [bookings, setBookings] = useState([])
  const [covers, setCovers] = useState({})
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    bookingsApi.list()
      .then(async (result) => {
        if (!active) return
        setBookings(result.bookings)
        setLoading(false)
        const inquiryIds = [...new Set(result.bookings.map((b) => b.inquiry_id).filter(Boolean))]
        if (inquiryIds.length === 0) return
        const settled = await Promise.allSettled(
          inquiryIds.map((inqId) => fetchInquiryImages(inqId).then((res) => [inqId, res.images?.[0]?.id || null])),
        )
        if (!active) return
        const nextCovers = {}
        for (const item of settled) {
          if (item.status === 'fulfilled') {
            const [inqId, imageId] = item.value
            if (imageId) nextCovers[inqId] = getRequestImageUrl(imageId)
          }
        }
        setCovers(nextCovers)
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError.message)
          setLoading(false)
        }
      })
    return () => { active = false }
  }, [])

  const filterGroups = [
    { key: 'all', label: 'All', match: () => true },
    {
      key: 'reservations',
      label: 'Reservations & Payments',
      match: (b) => b.status !== 'cancelled' && b.status !== 'declined' && (b.booking_stage === 'reserved' || b.payment_status !== 'fully_paid'),
    },
    {
      key: 'active',
      label: 'Active Bookings',
      match: (b) => ['accepted', 'in_progress'].includes(b.status) && b.booking_stage === 'booked',
    },
    {
      key: 'completed',
      label: 'Completed & Closed',
      match: (b) => b.status === 'completed' || b.transaction_status === 'closed',
    },
    {
      key: 'cancelled',
      label: 'Cancelled',
      match: (b) => b.status === 'cancelled' || b.status === 'declined',
    },
  ]
  const activeFilterDef = filterGroups.find((f) => f.key === filter) || filterGroups[0]
  const filteredBookings = bookings.filter(activeFilterDef.match)

  return (
    <section className="container booking-content">
      <p className="eyebrow">Reservations, payments &amp; confirmed bookings</p>
      <h1>Reservations and bookings.</h1>
      <p className="booking-note">
        Approved agreements start as <strong>Reservations</strong>. Once a partial deposit or full payment is verified, they become <strong>Confirmed Bookings</strong>. After work completion and full payment, both parties sign the closing agreement to unlock rating.
      </p>
      {bookings.length > 0 && (
        <div className="booking-filter-bar" role="tablist" aria-label="Filter bookings by stage">
          {filterGroups.map((group) => {
            const count = bookings.filter(group.match).length
            return (
              <button
                key={group.key}
                type="button"
                role="tab"
                aria-selected={filter === group.key}
                className={`booking-filter-pill${filter === group.key ? ' is-active' : ''}`}
                onClick={() => setFilter(group.key)}
              >
                <span>{group.label}</span>
                <span className="booking-filter-count">{count}</span>
              </button>
            )
          })}
        </div>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading && (
        <div className="dashboard-panel skeleton-stack" aria-busy="true" role="status" aria-label="Loading reservations and bookings">
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
          <div className="skeleton-line" />
        </div>
      )}
      {!loading && !error && bookings.length === 0 && <div className="empty-state">You do not have any reservations or bookings yet.</div>}
      {!loading && !error && bookings.length > 0 && filteredBookings.length === 0 && (
        <div className="empty-state">No bookings match "{activeFilterDef.label}". Select another tab above to view your other records.</div>
      )}
      <div className="marketplace-grid marketplace-card-grid">
        {filteredBookings.map((booking) => {
          const coverUrl = booking.inquiry_id ? covers[booking.inquiry_id] : null
          const otherParty = user?.role === 'gardener' ? booking.client_name : booking.gardener_name
          const stageBadgeKey = booking.transaction_status === 'closed'
            ? 'closed'
            : booking.transaction_status === 'pending_closure'
              ? 'pending_closure'
              : (booking.status === 'completed' || booking.status === 'cancelled'
                ? booking.status
                : (booking.booking_stage || 'reserved'))
          const stageBadgeLabel = booking.transaction_status === 'closed'
            ? 'Transaction Closed'
            : formatStatusLabel(stageBadgeKey)
          const ctaLabel = booking.transaction_status === 'closed'
            ? 'View closed record'
            : (booking.status === 'completed' && booking.payment_status === 'fully_paid'
              ? 'Sign closing agreement'
              : (booking.booking_stage === 'reserved' || (booking.status === 'completed' && booking.payment_status !== 'fully_paid')
                ? 'Manage payment'
                : 'View booking'))
          return (
            <article className="marketplace-card visual-market-card" key={booking.id}>
              <div className="marketplace-card-media">
                {coverUrl ? (
                  <img src={coverUrl} alt={booking.service_title || 'Gardening service'} loading="lazy" />
                ) : (
                  <div className="marketplace-card-placeholder" aria-hidden="true">
                    <Leaf size={26} />
                    <span>{booking.agreement_version != null ? `Agreement v${booking.agreement_version}` : 'Service arrangement'}</span>
                  </div>
                )}
                <span className={`${getStatusBadgeClass(stageBadgeKey)} media-status-badge`}>
                  {stageBadgeLabel}
                </span>
              </div>
              <div className="marketplace-card-body">
                <h2>{booking.service_title || 'Gardening service'}</h2>
                <p>
                  {booking.agreed_scope || booking.notes || 'Gardening service arrangement.'}
                </p>
                <div className="service-meta">
                  <span>
                    {otherParty || 'Confirmed party'} · {formatStatusLabel(booking.payment_status)}
                    {Number(booking.pending_reschedule_count) > 0 ? ' · Reschedule Pending' : ''}
                  </span>
                  <strong className="card-price">
                    {booking.agreed_amount != null ? `₱${Number(booking.agreed_amount).toLocaleString()}` : 'See agreement'}
                  </strong>
                </div>
                <div className="marketplace-card-footer">
                  <span className="card-area">
                    <CalendarDays size={13} />
                    {booking.scheduled_start ? new Date(booking.scheduled_start).toLocaleDateString() : 'TBD'}
                    {booking.location ? ` · ` : ''}
                    {booking.location && <><MapPin size={13} /> {booking.location}</>}
                  </span>
                  <Link className="card-cta" to={`/bookings/${booking.id}`}>
                    {ctaLabel} <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default function BookingPage({ detail = false, create = false }) {
  const { bookingId } = useParams()
  const { user } = useAuth()
  const memberWorkspace = ['client', 'gardener'].includes(user?.role)
  return <main className={`marketplace-page protected-page${memberWorkspace ? ' member-workspace' : ''}`} data-workspace={user?.role}><AppSidebar />{detail ? <BookingDetails id={bookingId} /> : create ? <BookingForm /> : <BookingList />}</main>
}
