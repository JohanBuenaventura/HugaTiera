import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock, Leaf, MapPin, ShieldAlert } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { agreementsApi } from '../services/agreements'
import {
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
      })
        .then((res) => { if (active) setScheduleCheck(res) })
        .catch(() => { if (active) setScheduleCheck(null) })
        .finally(() => { if (active) setCheckingSchedule(false) })
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [gardenerId, form.scheduledStart, form.scheduledEnd])

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

  async function submit(event) {
    event.preventDefault()
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
              <strong>Simultaneous work:</strong>{' '}
              {availability.maxConcurrentJobs > 1
                ? `Up to ${availability.maxConcurrentJobs} jobs simultaneously`
                : 'Solo (1 job at a time)'}
            </span>
          </div>
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
        <label>Agreed scope of work
          <textarea required rows="4" maxLength="5000" value={form.scopeOfWork} onChange={change('scopeOfWork')} placeholder="Describe the exact gardening tasks and deliverables agreed upon." />
        </label>
        <div className="form-row form-row-3">
          <label>Agreed price (PHP)
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
        <div className="form-row form-row-3">
          <label>Start date and time
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
          <label>Estimated end date and time
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
        <label>Exact service location
          <input required maxLength="255" value={form.location} onChange={change('location')} placeholder="Complete address or barangay location in Zamboanga City" />
        </label>
        <label>Special conditions or notes (optional)
          <textarea rows="3" maxLength="5000" value={form.conditions} onChange={change('conditions')} placeholder="Materials, access instructions, or weather conditions." />
        </label>
        <button className="button" type="submit" disabled={saving || (activeScheduleCheck && !activeScheduleCheck.available)}>
          {saving ? 'Submitting proposal...' : 'Propose mutual agreement (v1)'}
        </button>
      </form>
    </section>
  )
}

function BookingDetails({ id }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [booking, setBooking] = useState(null)
  const [payments, setPayments] = useState([])
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    paymentType: 'partial',
    paymentMethod: 'gcash',
    amount: '',
    referenceNumber: '',
    notes: '',
    receiptFile: null,
  })
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [verifyingPaymentId, setVerifyingPaymentId] = useState(null)
  const [review, setReview] = useState(null)
  const [reviewForm, setReviewForm] = useState({ rating: 5, reviewText: '' })
  const [submittingReview, setSubmittingReview] = useState(false)

  const load = useCallback(() => bookingsApi.get(id).then((result) => {
    setBooking(result.booking)
    setPayments(Array.isArray(result.payments) ? result.payments : [])
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
  }, [id, load])

  async function update(status) {
    setUpdatingStatus(true); setError(''); setStatusMessage('')
    try {
      await bookingsApi.status(id, status)
      await load()
      setStatusMessage(`Booking status updated to ${formatStatusLabel(status)}.`)
    } catch (statusError) {
      setError(statusError.message)
    } finally {
      setUpdatingStatus(false)
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
      setStatusMessage('Payment proof submitted. Waiting for the gardener to verify receipt.')
      await load()
    } catch (payErr) {
      setError(payErr.message)
    } finally {
      setSubmittingPayment(false)
    }
  }

  async function handleVerifyPayment(paymentId, decision) {
    let rejectionReason = ''
    if (decision === 'rejected') {
      rejectionReason = window.prompt('Enter reason for rejecting this payment proof:', '') || ''
      if (!rejectionReason.trim()) return
    }
    setVerifyingPaymentId(paymentId); setError(''); setStatusMessage('')
    try {
      const res = await bookingsApi.verifyPayment(id, paymentId, { decision, rejectionReason })
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

  async function submitReview(event) {
    event.preventDefault()
    setSubmittingReview(true); setError(''); setStatusMessage('')
    try {
      await reviewsApi.create({ bookingId: id, ...reviewForm })
      setReview({ rating: reviewForm.rating, review_text: reviewForm.reviewText })
      setStatusMessage('Thank you! Your review has been published.')
    } catch (reviewError) {
      setError(reviewError.message)
    } finally {
      setSubmittingReview(false)
    }
  }

  if (!booking) return <section className="container booking-content">{error ? <div className="form-error">{error}</div> : <p>Loading booking...</p>}</section>
  const gardener = user.role === 'gardener'
  const agreementSummary = buildBookingAgreementSummary(booking, user)
  const isBookedPaid = booking.booking_stage === 'booked'
  const canSubmitPayment = !gardener && ['accepted', 'in_progress'].includes(booking.status) && booking.payment_status !== 'fully_paid'
  return (
    <section className="container booking-content">
      <Link className="back-link" to="/bookings"><ArrowLeft size={15} /> Back to bookings</Link>
      <p className="eyebrow">{isBookedPaid ? `Confirmed Booking #${booking.id}` : `Reservation #${booking.id} (Payment Required)`}</p>
      <h1>{booking.service_title || 'Gardening service'}</h1>
      <div className="booking-status-row">
        <span className={getStatusBadgeClass(booking.booking_stage)}>{formatStatusLabel(booking.booking_stage)}</span>
        <span className={getStatusBadgeClass(booking.payment_status)}>{formatStatusLabel(booking.payment_status)}</span>
        <span className={getStatusBadgeClass(booking.status)}>{formatStatusLabel(booking.status)}</span>
        <span>{gardener ? booking.client_name : booking.gardener_name}</span>
        {agreementSummary.inquiryPath && (
          <Link className="text-link" to={agreementSummary.inquiryPath}>
            View source inquiry #{booking.inquiry_id}
          </Link>
        )}
        <button className="table-action" type="button" onClick={openConversation}>Open conversation</button>
      </div>
      {statusMessage && <div className="form-success" role="status" style={{ marginBottom: '16px' }}>{statusMessage}</div>}
      {error && <div className="form-error" role="alert" style={{ marginBottom: '16px' }}>{error}</div>}
      <article className="dashboard-panel booking-detail-card">
        <div className="payment-status-panel">
          <div className="price-predictor-range-row">
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>Reservation &amp; payment status</p>
              <strong style={{ fontSize: '18px', color: 'var(--forest)' }}>
                {isBookedPaid
                  ? 'Confirmed Paid Booking — Eligible for Service Execution'
                  : 'Reserved Slot Only — Partial Deposit or Full Payment Required to Confirm Booking'}
              </strong>
            </div>
          </div>
          <div className="detail-facts">
            <span><strong>Agreed total</strong>₱{Number(booking.agreed_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span><strong>Required deposit</strong>₱{Number(booking.required_deposit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span><strong>Verified paid</strong>₱{Number(booking.amount_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span><strong>Remaining balance</strong>₱{Number(booking.remaining_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>

          {canSubmitPayment && (
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
                <label>Amount paid (PHP)
                  <input required type="number" min="1" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                </label>
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

          {payments.length > 0 && (
            <div className="payment-history-list">
              <strong>Payment submissions ({payments.length})</strong>
              {payments.map((pay) => (
                <div className="payment-record-card" key={pay.id}>
                  <div className="price-predictor-range-row">
                    <strong>
                      ₱{Number(pay.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} · {formatStatusLabel(pay.payment_type)} ({PAYMENT_METHOD_LABELS[pay.payment_method] || pay.payment_method})
                    </strong>
                    <span className={getStatusBadgeClass(pay.status)}>{formatStatusLabel(pay.status)}</span>
                  </div>
                  <small>
                    Submitted {new Date(pay.created_at).toLocaleString()}
                    {pay.reference_number ? ` · Ref: ${pay.reference_number}` : ''}
                    {pay.notes ? ` · ${pay.notes}` : ''}
                  </small>
                  {pay.rejection_reason && (
                    <p className="field-error-note" style={{ margin: '4px 0 0' }}>Rejection reason: {pay.rejection_reason}</p>
                  )}
                  <div className="inline-actions" style={{ marginTop: '6px' }}>
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
                </div>
              ))}
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
          {!gardener && ['pending', 'accepted'].includes(booking.status) && (
            <button className="table-action" type="button" disabled={updatingStatus} onClick={() => update('cancelled')}>
              {updatingStatus ? 'Saving...' : isBookedPaid ? 'Cancel booking' : 'Cancel reservation'}
            </button>
          )}
        </div>
      </article>
      {!gardener && booking.status === 'completed' && !review && (
        <form className="dashboard-panel profile-form review-form" onSubmit={submitReview}>
          <h2>Review this service</h2>
          <label>Rating
            <select value={reviewForm.rating} onChange={(event) => setReviewForm({ ...reviewForm, rating: Number(event.target.value) })}>
              {[5, 4, 3, 2, 1].map((value) => <option value={value} key={value}>{value} stars</option>)}
            </select>
          </label>
          <label>Written feedback
            <textarea rows="4" maxLength="2000" value={reviewForm.reviewText} onChange={(event) => setReviewForm({ ...reviewForm, reviewText: event.target.value })} />
          </label>
          <button className="button" type="submit" disabled={submittingReview}>
            {submittingReview ? 'Submitting...' : 'Submit review'}
          </button>
        </form>
      )}
      {!gardener && review && (
        <div className="dashboard-panel review-card">
          <h2>Your review</h2>
          <strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong>
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
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    bookingsApi.list()
      .then(async (result) => {
        if (!active) return
        setBookings(result.bookings)
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
      .catch((loadError) => { if (active) setError(loadError.message) })
    return () => { active = false }
  }, [])

  return (
    <section className="container booking-content">
      <p className="eyebrow">Reservations, payments &amp; confirmed bookings</p>
      <h1>Reservations and bookings.</h1>
      <p className="booking-note">
        Approved agreements start as <strong>Reservations</strong>. Once a partial deposit or full payment is verified, they become <strong>Confirmed Bookings</strong>.
      </p>
      {error && <div className="form-error">{error}</div>}
      {!error && bookings.length === 0 && <div className="empty-state">You do not have any reservations or bookings yet.</div>}
      <div className="marketplace-grid marketplace-card-grid">
        {bookings.map((booking) => {
          const coverUrl = booking.inquiry_id ? covers[booking.inquiry_id] : null
          const otherParty = user?.role === 'gardener' ? booking.client_name : booking.gardener_name
          const stageBadgeKey = booking.status === 'completed' || booking.status === 'cancelled'
            ? booking.status
            : (booking.booking_stage || 'reserved')
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
                  {formatStatusLabel(stageBadgeKey)}
                </span>
              </div>
              <div className="marketplace-card-body">
                <h2>{booking.service_title || 'Gardening service'}</h2>
                <p>
                  {booking.agreed_scope || booking.notes || 'Gardening service arrangement.'}
                </p>
                <div className="service-meta">
                  <span>{otherParty || 'Confirmed party'} · {formatStatusLabel(booking.payment_status)}</span>
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
                    {booking.booking_stage === 'reserved' ? 'Manage payment' : 'View booking'} <ArrowRight size={15} />
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
  return <main className="marketplace-page protected-page"><AppSidebar />{detail ? <BookingDetails id={bookingId} /> : create ? <BookingForm /> : <BookingList />}</main>
}
