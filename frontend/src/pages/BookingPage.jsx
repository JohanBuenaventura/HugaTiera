import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Leaf, MapPin } from 'lucide-react'
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
import { profileApi } from '../services/profiles'
import { fetchInquiryImages, getRequestImageUrl } from '../services/requestImages'
import { reviewsApi } from '../services/reviews'
import { servicesApi } from '../services/services'
import { communicationApi } from '../services/communication'
import AppSidebar from '../components/AppSidebar'

function BookingForm() {
  const { user } = useAuth()
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
    let active = true
    async function loadAgreementDefaults() {
      const profileResult = await profileApi.get()
      const exactAddress = [profileResult.profile?.address, profileResult.profile?.city]
        .filter(Boolean)
        .join(', ')
      let service = null
      let inquiry = null
      let quote = null

      if (direct) {
        const result = await servicesApi.detail(serviceId)
        service = result?.service || null
      } else if (Number.isInteger(inquiryIdParam) && inquiryIdParam > 0) {
        const result = await inquiriesApi.get(inquiryIdParam)
        inquiry = result?.inquiry || null
        quote = (result?.quotations || []).find((item) => item.id === quotationId || item.status === 'accepted') || null
      }

      if (!active) return
      if (inquiry) setResolvedInquiryId(inquiryIdParam)
      setForm((prev) => ({
        ...prev,
        scopeOfWork: prev.scopeOfWork || (service
          ? `${service.title}: ${service.description}`
          : quote?.details || inquiry?.description || ''),
        amount: prev.amount || (service?.indicative_price ?? quote?.amount ?? ''),
        priceBasis: prev.priceBasis || service?.price_unit || '',
        location: prev.location || exactAddress || inquiry?.location || '',
      }))
    }

    loadAgreementDefaults().catch((loadError) => {
      if (active) setError(loadError.message)
    })
    return () => { active = false }
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
          {user.role === 'client' && <span className="field-note">Prefilled from your private profile. This address is included in the mutual agreement and shared with its provider.</span>}
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
          {booking.client_phone && <span><strong>Client phone</strong><a href={`tel:${booking.client_phone.replace(/[^\d+]/g, '')}`}>{booking.client_phone}</a></span>}
          {booking.gardener_phone && <span><strong>Provider phone</strong><a href={`tel:${booking.gardener_phone.replace(/[^\d+]/g, '')}`}>{booking.gardener_phone}</a></span>}
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
      <p className="eyebrow">Agreements & schedule</p>
      <h1>Bookings and agreements.</h1>
      <p className="booking-note">
        Track confirmed service arrangements, agreed pricing, and mutual agreement versions.
      </p>
      {error && <div className="form-error">{error}</div>}
      {!error && bookings.length === 0 && <div className="empty-state">You do not have any bookings yet.</div>}
      <div className="marketplace-grid marketplace-card-grid">
        {bookings.map((booking) => {
          const coverUrl = booking.inquiry_id ? covers[booking.inquiry_id] : null
          const otherParty = user?.role === 'gardener' ? booking.client_name : booking.gardener_name
          return (
            <article className="marketplace-card visual-market-card" key={booking.id}>
              <div className="marketplace-card-media">
                {coverUrl ? (
                  <img src={coverUrl} alt={booking.service_title || 'Gardening service'} loading="lazy" />
                ) : (
                  <div className="marketplace-card-placeholder" aria-hidden="true">
                    <Leaf size={26} />
                    <span>{booking.agreement_version != null ? `Agreement v${booking.agreement_version}` : 'Service booking'}</span>
                  </div>
                )}
                <span className={`${getStatusBadgeClass(booking.status)} media-status-badge`}>
                  {formatStatusLabel(booking.status)}
                </span>
              </div>
              <div className="marketplace-card-body">
                <h2>{booking.service_title || 'Gardening service'}</h2>
                <p>
                  {booking.agreed_scope || booking.notes || 'Confirmed gardening service arrangement.'}
                </p>
                <div className="service-meta">
                  <span>{otherParty || 'Confirmed party'}</span>
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
                    View agreement <ArrowRight size={15} />
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
