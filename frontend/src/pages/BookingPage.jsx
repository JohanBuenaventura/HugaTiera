import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Leaf } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { agreementsApi } from '../services/agreements'
import {
  bookingsApi,
  buildBookingAgreementSummary,
  formatStatusLabel,
  getStatusBadgeClass,
} from '../services/bookings'
import { inquiriesApi } from '../services/inquiries'
import { reviewsApi } from '../services/reviews'
import { servicesApi } from '../services/services'
import { communicationApi } from '../services/communication'

function Header() {
  return <header className="dashboard-header container"><Link className="brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link><Link className="button button-outline" to="/dashboard">Dashboard</Link></header>
}

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
    priceBasis: '',
    scheduledStart: '',
    scheduledEnd: '',
    location: '',
    conditions: '',
  })
  const [resolvedInquiryId, setResolvedInquiryId] = useState(Number.isInteger(inquiryIdParam) && inquiryIdParam > 0 ? inquiryIdParam : null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (direct) {
      servicesApi.detail(serviceId).then((res) => {
        if (res?.service) {
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
        setForm((prev) => ({
          ...prev,
          scopeOfWork: prev.scopeOfWork || quote?.details || res?.inquiry?.description || '',
          amount: prev.amount || (quote?.amount ?? ''),
          location: prev.location || (res?.inquiry?.location ?? ''),
        }))
      }).catch(() => {})
    }
  }, [direct, inquiryIdParam, quotationId, serviceId])

  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value })
  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (direct) {
        const result = await agreementsApi.proposeDirectService({ ...form, serviceId })
        navigate(`/inquiries/${result.inquiryId}`)
      } else if (resolvedInquiryId) {
        await agreementsApi.propose(resolvedInquiryId, {
          ...form,
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
        A confirmed booking is created only after both the client and the gardener explicitly approve the same agreement version.
      </p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <form className="dashboard-panel profile-form booking-form" onSubmit={submit}>
        <label>Agreed scope of work
          <textarea required rows="4" maxLength="5000" value={form.scopeOfWork} onChange={change('scopeOfWork')} placeholder="Describe the exact gardening tasks and deliverables agreed upon." />
        </label>
        <div className="form-row">
          <label>Agreed price (PHP)
            <input required type="number" min="0" step="0.01" value={form.amount} onChange={change('amount')} placeholder="e.g. 1500.00" />
          </label>
          <label>Price basis (optional)
            <input maxLength="100" value={form.priceBasis} onChange={change('priceBasis')} placeholder="e.g. per visit, fixed project" />
          </label>
        </div>
        <div className="form-row">
          <label>Start date and time
            <input required type="datetime-local" value={form.scheduledStart} onChange={change('scheduledStart')} />
          </label>
          <label>End date and time
            <input required type="datetime-local" value={form.scheduledEnd} onChange={change('scheduledEnd')} />
          </label>
        </div>
        <label>Exact service location
          <input required maxLength="255" value={form.location} onChange={change('location')} placeholder="Complete address or barangay location in Zamboanga City" />
        </label>
        <label>Special conditions or notes (optional)
          <textarea rows="3" maxLength="5000" value={form.conditions} onChange={change('conditions')} placeholder="Materials, access instructions, or weather conditions." />
        </label>
        <button className="button" type="submit" disabled={saving}>
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
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [review, setReview] = useState(null)
  const [reviewForm, setReviewForm] = useState({ rating: 5, reviewText: '' })
  const [submittingReview, setSubmittingReview] = useState(false)

  const load = useCallback(() => bookingsApi.get(id).then((result) => setBooking(result.booking)).catch((loadError) => setError(loadError.message)), [id])
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
  return (
    <section className="container booking-content">
      <Link className="back-link" to="/bookings"><ArrowLeft size={15} /> Back to bookings</Link>
      <p className="eyebrow">Booking #{booking.id}</p>
      <h1>{booking.service_title || 'Gardening service'}</h1>
      <div className="booking-status-row">
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
            <button className="button" type="button" disabled={updatingStatus} onClick={() => update('in_progress')}>
              {updatingStatus ? 'Saving...' : 'Start service'}
            </button>
          )}
          {gardener && booking.status === 'in_progress' && (
            <button className="button" type="button" disabled={updatingStatus} onClick={() => update('completed')}>
              {updatingStatus ? 'Saving...' : 'Mark completed'}
            </button>
          )}
          {!gardener && ['pending', 'accepted'].includes(booking.status) && (
            <button className="table-action" type="button" disabled={updatingStatus} onClick={() => update('cancelled')}>
              {updatingStatus ? 'Saving...' : 'Cancel booking'}
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
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { bookingsApi.list().then((result) => setBookings(result.bookings)).catch((loadError) => setError(loadError.message)) }, [])
  return (
    <section className="container booking-content">
      <p className="eyebrow">Service schedule</p>
      <h1>Bookings.</h1>
      {error && <div className="form-error">{error}</div>}
      {!error && bookings.length === 0 && <div className="empty-state">You do not have any bookings yet.</div>}
      <div className="booking-list">
        {bookings.map((booking) => (
          <Link className="booking-list-item" to={`/bookings/${booking.id}`} key={booking.id}>
            <div>
              <strong>{booking.service_title || 'Gardening service'}</strong>
              <span>
                {[
                  new Date(booking.scheduled_start).toLocaleString(),
                  booking.agreement_version != null ? `Agreement v${booking.agreement_version}` : null,
                  booking.agreed_amount != null ? `PHP ${Number(booking.agreed_amount).toLocaleString()}` : null,
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
            <span className={getStatusBadgeClass(booking.status)}>
              {formatStatusLabel(booking.status)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function BookingPage({ detail = false, create = false }) {
  const { bookingId } = useParams()
  return <main className="marketplace-page"><Header />{detail ? <BookingDetails id={bookingId} /> : create ? <BookingForm /> : <BookingList />}</main>
}
