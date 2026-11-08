import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Leaf } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { inquiriesApi } from '../services/inquiries'
import { servicesApi } from '../services/services'
import { communicationApi } from '../services/communication'

function Header() {
  return <header className="dashboard-header container"><Link className="brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link><Link className="button button-outline" to="/dashboard">Dashboard</Link></header>
}

function InquiryForm() {
  const [params] = useSearchParams()
  const serviceId = params.get('serviceId')
  const navigate = useNavigate()
  const [service, setService] = useState(null)
  const [form, setForm] = useState({ subject: '', description: '', requestedDate: '', location: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const invalidServiceId = !serviceId || !/^\d+$/.test(serviceId)
  useEffect(() => {
    if (invalidServiceId) return
    servicesApi.detail(serviceId).then((result) => setService(result.service)).catch((loadError) => setError(loadError.message))
  }, [invalidServiceId, serviceId])
  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value })
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    try { const result = await inquiriesApi.create({ ...form, serviceId: Number(serviceId) }); navigate(`/inquiries/${result.id}`) } catch (submitError) { setError(submitError.message) } finally { setSaving(false) }
  }
  return <section className="container inquiry-content"><Link className="back-link" to="/services"><ArrowLeft size={15} /> Back to services</Link><p className="eyebrow">Start a conversation</p><h1>Tell the gardener what you need.</h1>{service && <div className="inquiry-service"><strong>{service.title}</strong><span>{service.business_name || `${service.first_name} ${service.last_name}`}</span></div>}{(error || invalidServiceId) && <div className="form-error" role="alert">{error || 'A valid service is required to start an inquiry.'}</div>}<form className="dashboard-panel profile-form inquiry-form" onSubmit={submit}><label>Subject<input required maxLength="200" value={form.subject} onChange={change('subject')} placeholder="e.g. Small backyard garden improvement" /></label><label>What are you looking for?<textarea required rows="6" value={form.description} onChange={change('description')} placeholder="Describe your space, goals, and any details that may help the gardener." /></label><div className="form-row"><label>Preferred date<input type="date" value={form.requestedDate} onChange={change('requestedDate')} /></label><label>Service location<input value={form.location} onChange={change('location')} placeholder="Barangay or general area" /></label></div><p className="form-note">This is an inquiry, not a booking. The gardener can respond with details and an indicative quotation.</p><button className="button" type="submit" disabled={saving || invalidServiceId}>{saving ? 'Sending...' : 'Send inquiry'}</button></form></section>
}

function InquiryDetails({ id }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ amount: '', details: '', availabilityStart: '', availabilityEnd: '', validUntil: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = useCallback(() => inquiriesApi.get(id).then(setData).catch((loadError) => setError(loadError.message)), [id])
  useEffect(() => {
    load()
  }, [load])
  async function sendQuote(event) {
    event.preventDefault(); setError(''); setMessage('')
    try { await inquiriesApi.quote(id, form); setForm({ amount: '', details: '', availabilityStart: '', availabilityEnd: '', validUntil: '' }); setMessage('Quotation sent to the client.'); load() } catch (quoteError) { setError(quoteError.message) }
  }
  async function quoteStatus(quotationId, status) {
    try { await inquiriesApi.quoteStatus(quotationId, status); setMessage(`Quotation ${status}.`); load() } catch (statusError) { setError(statusError.message) }
  }
  async function openConversation() {
    try { const result = await communicationApi.createConversation(inquiry.id); navigate(`/messages?conversationId=${result.id}`) } catch (conversationError) { setError(conversationError.message) }
  }
  if (!data) return <section className="container inquiry-content">{error ? <div className="form-error">{error}</div> : <p>Loading inquiry...</p>}</section>
  const { inquiry, quotations = [] } = data
  if (!inquiry) return <section className="container inquiry-content"><div className="form-error" role="alert">The inquiry response was incomplete. Please return to the inquiry list and try again.</div></section>
  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value })
  return <section className="container inquiry-content"><Link className="back-link" to="/inquiries"><ArrowLeft size={15} /> Back to inquiries</Link><p className="eyebrow">Inquiry #{inquiry.id}</p><h1>{inquiry.subject}</h1><div className="inquiry-status-row"><span className={`inquiry-status status-${inquiry.status}`}>{inquiry.status}</span><span>{inquiry.service_title || 'General service inquiry'}</span><button className="table-action" type="button" onClick={openConversation}>Open conversation</button></div><div className="inquiry-detail-grid"><article className="dashboard-panel"><h2>Project details</h2><p className="inquiry-description">{inquiry.description}</p><div className="detail-facts"><span><strong>Requested date</strong>{inquiry.requested_date || 'Not specified'}</span><span><strong>Location</strong>{inquiry.location || 'Not specified'}</span></div><h2>Quotations</h2>{quotations.length === 0 && <p className="form-note">No quotation has been sent yet.</p>}{quotations.map((quote) => <div className="quotation-card" key={quote.id}><div><strong>{quote.amount ? `₱${quote.amount}` : 'Indicative quotation'}</strong><span className={`inquiry-status status-${quote.status}`}>{quote.status}</span></div><p>{quote.details}</p><small>{quote.availability_start ? `Availability: ${quote.availability_start} to ${quote.availability_end || 'open'}` : 'Availability to be discussed'}</small>{user.role === 'client' && quote.status === 'sent' && <div className="inline-actions"><button className="button" type="button" onClick={() => quoteStatus(quote.id, 'accepted')}>Accept quotation</button>  <button className="table-action" type="button" onClick={() => quoteStatus(quote.id, 'declined')}>Decline</button></div>}{user.role === 'client' && quote.status === 'accepted' && <Link className="button" to={`/bookings/new?quotationId=${quote.id}`}>Request booking</Link>}</div>)}</article>{user.role === 'gardener' && <form className="dashboard-panel profile-form" onSubmit={sendQuote}><p className="eyebrow">Respond to client</p><h2>Send an indicative quotation.</h2>{message && <div className="form-success">{message}</div>}{error && <div className="form-error">{error}</div>}<label>Amount<input type="number" min="0" step="0.01" value={form.amount} onChange={change('amount')} /></label><label>Details<textarea required rows="5" value={form.details} onChange={change('details')} placeholder="Explain what is included and any conditions." /></label><div className="form-row"><label>Available from<input type="date" value={form.availabilityStart} onChange={change('availabilityStart')} /></label><label>Available until<input type="date" value={form.availabilityEnd} onChange={change('availabilityEnd')} /></label></div><label>Quotation valid until<input type="date" value={form.validUntil} onChange={change('validUntil')} /></label><button className="button" type="submit">Send quotation</button></form>}</div></section>
}

export default function InquiryPage({ detail = false, create = false }) {
  const { inquiryId } = useParams()
  return <main className="marketplace-page"><Header />{detail ? <InquiryDetails id={inquiryId} /> : create ? <InquiryForm /> : <InquiryList />}</main>
}

function InquiryList() {
  const [inquiries, setInquiries] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    inquiriesApi.list()
      .then((result) => setInquiries(Array.isArray(result?.inquiries) ? result.inquiries : []))
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false))
  }, [])
  return <section className="container inquiry-content"><p className="eyebrow">Your conversations</p><h1>Inquiries and quotations.</h1>{loading && <p>Loading inquiries...</p>}{error && <div className="form-error" role="alert">{error}</div>}{!loading && !error && inquiries.length === 0 && <div className="empty-state">You do not have any inquiries yet.</div>}{!loading && !error && <div className="inquiry-list">{inquiries.map((inquiry) => <Link className="inquiry-list-item" to={`/inquiries/${inquiry.id}`} key={inquiry.id}><div><strong>{inquiry.subject}</strong><span>{inquiry.service_title || 'Service inquiry'}</span></div><span className={`inquiry-status status-${inquiry.status}`}>{inquiry.status}</span></Link>)}</div>}</section>
}
