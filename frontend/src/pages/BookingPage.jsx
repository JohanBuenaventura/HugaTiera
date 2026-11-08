import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Leaf } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { bookingsApi } from '../services/bookings'
import { reviewsApi } from '../services/reviews'

function Header() {
  return <header className="dashboard-header container"><Link className="brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link><Link className="button button-outline" to="/dashboard">Dashboard</Link></header>
}

function BookingForm() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const quotationId = Number(params.get('quotationId'))
  const serviceId = Number(params.get('serviceId'))
  const direct = Number.isInteger(serviceId) && serviceId > 0
  const [form, setForm] = useState({ scheduledStart: '', scheduledEnd: '', location: '', notes: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value })
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    try { const result = await bookingsApi.create({ ...form, ...(direct ? { serviceId } : { quotationId }) }); navigate(`/bookings/${result.id}`) } catch (submitError) { setError(submitError.message) } finally { setSaving(false) }
  }
  return <section className="container booking-content"><Link className="back-link" to={direct ? `/services/${serviceId}` : '/inquiries'}><ArrowLeft size={15} /> Back</Link><p className="eyebrow">{direct ? 'Direct booking request' : 'Request a booking'}</p><h1>Choose a time for the service.</h1><p className="booking-note">{direct ? 'You are requesting this defined service directly. The gardener must accept it before the service is scheduled.' : 'Booking is a separate request. The gardener must accept it before the service is scheduled.'}</p>{error && <div className="form-error" role="alert">{error}</div>}<form className="dashboard-panel profile-form booking-form" onSubmit={submit}><div className="form-row"><label>Start date and time<input required type="datetime-local" value={form.scheduledStart} onChange={change('scheduledStart')} /></label><label>End date and time<input required type="datetime-local" value={form.scheduledEnd} onChange={change('scheduledEnd')} /></label></div><label>Service location<input required maxLength="255" value={form.location} onChange={change('location')} placeholder="Barangay or service address" /></label><label>Additional information<textarea rows="5" maxLength="5000" value={form.notes} onChange={change('notes')} placeholder="Share access instructions or other details." /></label><button className="button" type="submit" disabled={saving}>{saving ? 'Submitting...' : 'Submit booking request'}</button></form></section>
}

function BookingDetails({ id }) {
  const { user } = useAuth()
  const [booking, setBooking] = useState(null)
  const [error, setError] = useState('')
  const [review, setReview] = useState(null)
  const [reviewForm, setReviewForm] = useState({ rating: 5, reviewText: '' })
  const load = useCallback(() => bookingsApi.get(id).then((result) => setBooking(result.booking)).catch((loadError) => setError(loadError.message)), [id])
  useEffect(() => { load(); reviewsApi.booking(id).then((result) => setReview(result.review)).catch(() => {}) }, [id, load])
  async function update(status) {
    try { await bookingsApi.status(id, status); load() } catch (statusError) { setError(statusError.message) }
  }
  async function submitReview(event) {
    event.preventDefault()
    try { await reviewsApi.create({ bookingId: id, ...reviewForm }); setReview({ rating: reviewForm.rating, review_text: reviewForm.reviewText }); } catch (reviewError) { setError(reviewError.message) }
  }
  if (!booking) return <section className="container booking-content">{error ? <div className="form-error">{error}</div> : <p>Loading booking...</p>}</section>
  const gardener = user.role === 'gardener'
  return <section className="container booking-content"><Link className="back-link" to="/bookings"><ArrowLeft size={15} /> Back to bookings</Link><p className="eyebrow">Booking #{booking.id}</p><h1>{booking.service_title || 'Gardening service'}</h1><div className="booking-status-row"><span className={`inquiry-status status-${booking.status}`}>{booking.status.replace('_', ' ')}</span><span>{gardener ? booking.client_name : booking.gardener_name}</span></div>{error && <div className="form-error">{error}</div>}<article className="dashboard-panel booking-detail-card"><div className="detail-facts"><span><strong>Starts</strong>{new Date(booking.scheduled_start).toLocaleString()}</span><span><strong>Ends</strong>{new Date(booking.scheduled_end).toLocaleString()}</span><span><strong>Location</strong>{booking.location}</span></div><h2>Additional information</h2><p className="inquiry-description">{booking.notes || 'No additional information provided.'}</p><div className="inline-actions">{gardener && booking.status === 'pending' && <><button className="button" type="button" onClick={() => update('accepted')}>Accept</button><button className="table-action" type="button" onClick={() => update('declined')}>Decline</button></>}{gardener && booking.status === 'accepted' && <button className="button" type="button" onClick={() => update('in_progress')}>Start service</button>}{gardener && booking.status === 'in_progress' && <button className="button" type="button" onClick={() => update('completed')}>Mark completed</button>}{!gardener && ['pending', 'accepted'].includes(booking.status) && <button className="table-action" type="button" onClick={() => update('cancelled')}>Cancel booking</button>}</div></article>{!gardener && booking.status === 'completed' && !review && <form className="dashboard-panel profile-form review-form" onSubmit={submitReview}><h2>Review this service</h2><label>Rating<select value={reviewForm.rating} onChange={(event) => setReviewForm({ ...reviewForm, rating: Number(event.target.value) })}>{[5, 4, 3, 2, 1].map((value) => <option value={value} key={value}>{value} stars</option>)}</select></label><label>Written feedback<textarea rows="4" maxLength="2000" value={reviewForm.reviewText} onChange={(event) => setReviewForm({ ...reviewForm, reviewText: event.target.value })} /></label><button className="button" type="submit">Submit review</button></form>}{!gardener && review && <div className="dashboard-panel review-card"><h2>Your review</h2><strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong><p>{review.review_text || 'No written feedback provided.'}</p></div>}</section>
}

function BookingList() {
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { bookingsApi.list().then((result) => setBookings(result.bookings)).catch((loadError) => setError(loadError.message)) }, [])
  return <section className="container booking-content"><p className="eyebrow">Service schedule</p><h1>Bookings.</h1>{error && <div className="form-error">{error}</div>}{!error && bookings.length === 0 && <div className="empty-state">You do not have any bookings yet.</div>}<div className="booking-list">{bookings.map((booking) => <Link className="booking-list-item" to={`/bookings/${booking.id}`} key={booking.id}><div><strong>{booking.service_title || 'Gardening service'}</strong><span>{new Date(booking.scheduled_start).toLocaleString()}</span></div><span className={`inquiry-status status-${booking.status}`}>{booking.status.replace('_', ' ')}</span></Link>)}</div></section>
}

export default function BookingPage({ detail = false, create = false }) {
  const { bookingId } = useParams()
  return <main className="marketplace-page"><Header />{detail ? <BookingDetails id={bookingId} /> : create ? <BookingForm /> : <BookingList />}</main>
}
