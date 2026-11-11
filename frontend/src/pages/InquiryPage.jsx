import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Leaf } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { agreementsApi } from '../services/agreements'
import { inquiriesApi } from '../services/inquiries'
import {
  deleteRequestImage,
  getRequestImageUrl,
  uploadRequestImage,
} from '../services/requestImages'
import { servicesApi } from '../services/services'
import { communicationApi } from '../services/communication'

function formatDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function Header() {
  return <header className="dashboard-header container"><Link className="brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link><Link className="button button-outline" to="/dashboard">Dashboard</Link></header>
}

function InquiryForm() {
  const [params] = useSearchParams()
  const serviceId = params.get('serviceId')
  const gardenerId = params.get('gardenerId')
  const navigate = useNavigate()
  const [service, setService] = useState(null)
  const [gardener, setGardener] = useState(null)
  const [form, setForm] = useState({
    subject: '',
    description: '',
    aiSummary: '',
    requestedDate: '',
    location: '',
  })
  const [uploadedImages, setUploadedImages] = useState([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const validServiceId = Boolean(serviceId && /^\d+$/.test(serviceId))
  const validGardenerId = Boolean(gardenerId && /^\d+$/.test(gardenerId))
  const invalidTarget = !validServiceId && !validGardenerId

  useEffect(() => {
    if (validServiceId) {
      servicesApi.detail(serviceId).then((result) => setService(result.service)).catch((loadError) => setError(loadError.message))
    } else if (validGardenerId) {
      servicesApi.gardener(gardenerId).then((result) => setGardener(result.gardener)).catch((loadError) => setError(loadError.message))
    }
  }, [gardenerId, serviceId, validGardenerId, validServiceId])

  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (uploadedImages.length >= 5) {
      setError('You can attach up to 5 garden photos per inquiry.')
      return
    }
    setUploadingPhoto(true)
    setError('')
    try {
      const res = await uploadRequestImage(file)
      if (res?.image) {
        setUploadedImages((prev) => [...prev, res.image])
      }
    } catch (uploadErr) {
      setError(uploadErr.message)
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleRemovePhoto(imageId) {
    setError('')
    try {
      await deleteRequestImage(imageId)
      setUploadedImages((prev) => prev.filter((img) => img.id !== imageId))
    } catch (delErr) {
      setError(delErr.message)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        ...(validServiceId ? { serviceId: Number(serviceId) } : {}),
        ...(validGardenerId ? { gardenerId: Number(gardenerId) } : {}),
        imageIds: uploadedImages.map((img) => img.id),
      }
      const result = await inquiriesApi.create(payload)
      navigate(`/inquiries/${result.id}`)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="container inquiry-content">
      <Link className="back-link" to={validGardenerId ? `/gardeners/${gardenerId}` : '/services'}>
        <ArrowLeft size={15} /> Back
      </Link>
      <p className="eyebrow">Direct service provider inquiry</p>
      <h1>Tell the gardener what you need.</h1>
      {service && (
        <div className="inquiry-service">
          <strong>{service.title}</strong>
          <span>{service.business_name || `${service.first_name} ${service.last_name}`}</span>
        </div>
      )}
      {!service && gardener && (
        <div className="inquiry-service">
          <strong>{gardener.business_name || `${gardener.first_name} ${gardener.last_name}`}</strong>
          <span>{gardener.service_area || 'Zamboanga City'}</span>
        </div>
      )}
      {(error || invalidTarget) && (
        <div className="form-error" role="alert">
          {error || 'A valid service or gardener is required to start a direct inquiry.'}
        </div>
      )}
      <form className="dashboard-panel profile-form inquiry-form" onSubmit={submit}>
        <label>Subject
          <input required maxLength="200" value={form.subject} onChange={change('subject')} placeholder="e.g. Small backyard garden improvement" />
        </label>
        <label>What are you looking for?
          <textarea required rows="5" maxLength="5000" value={form.description} onChange={change('description')} placeholder="Describe your outdoor space, goals, and any details that may help the gardener." />
        </label>
        <label>Reviewed requirement summary (optional)
          <textarea rows="3" maxLength="5000" value={form.aiSummary} onChange={change('aiSummary')} placeholder="Optional structured summary of your gardening requirements." />
        </label>
        <div className="form-row">
          <label>Preferred date
            <input type="date" value={form.requestedDate} onChange={change('requestedDate')} />
          </label>
          <label>Service location
            <input maxLength="255" value={form.location} onChange={change('location')} placeholder="Barangay or general area in Zamboanga City" />
          </label>
        </div>
        <label>Garden photos (up to 5 JPEG, PNG, or WebP images; GPS/EXIF stripped automatically)
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingPhoto || uploadedImages.length >= 5} onChange={handlePhotoUpload} />
        </label>
        {uploadingPhoto && <p className="form-note">Processing and stripping metadata from photo...</p>}
        {uploadedImages.length > 0 && (
          <div className="portfolio-gallery" style={{ marginTop: '10px', marginBottom: '10px' }}>
            {uploadedImages.map((img) => (
              <figure key={img.id}>
                <img src={getRequestImageUrl(img.id)} alt="Uploaded garden space" />
                <figcaption>
                  <button className="table-action" type="button" onClick={() => handleRemovePhoto(img.id)}>
                    Remove photo
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <p className="form-note">
          This is an inquiry, not a confirmed booking. The gardener will evaluate feasibility and respond with an offer or suggested modifications, followed by mutual agreement.
        </p>
        <button className="button" type="submit" disabled={saving || uploadingPhoto || invalidTarget}>
          {saving ? 'Sending...' : 'Send direct inquiry'}
        </button>
      </form>
    </section>
  )
}

function formatDateTimeInput(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

function formatDateInput(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
}

const RESPONSE_TYPE_LABELS = {
  offer: 'Standard offer',
  feasible: 'Feasible as requested',
  modifications: 'Feasible with modifications',
  cannot_do: 'Cannot fulfill',
  interest: 'Expression of interest',
}

function InquiryDetails({ id }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [form, setForm] = useState({
    responseType: 'offer',
    amount: '',
    details: '',
    proposedChanges: '',
    availabilityStart: '',
    availabilityEnd: '',
    validUntil: '',
  })
  const [editingQuoteId, setEditingQuoteId] = useState(null)
  const [editingAgreement, setEditingAgreement] = useState(false)
  const [agreementForm, setAgreementForm] = useState({
    scopeOfWork: '',
    amount: '',
    priceBasis: '',
    scheduledStart: '',
    scheduledEnd: '',
    location: '',
    conditions: '',
  })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submittingQuote, setSubmittingQuote] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const load = useCallback(() => inquiriesApi.get(id).then((res) => {
    setData(res)
    if (res?.activeAgreement) {
      setAgreementForm({
        scopeOfWork: res.activeAgreement.scope_of_work || '',
        amount: res.activeAgreement.amount ?? '',
        priceBasis: res.activeAgreement.price_basis || '',
        scheduledStart: formatDateTimeInput(res.activeAgreement.scheduled_start),
        scheduledEnd: formatDateTimeInput(res.activeAgreement.scheduled_end),
        location: res.activeAgreement.location || '',
        conditions: res.activeAgreement.conditions || '',
      })
    }
  }).catch((loadError) => setError(loadError.message)), [id])
  useEffect(() => {
    load()
  }, [load])
  function startReviseQuote(quote) {
    setEditingQuoteId(quote.id)
    setForm({
      responseType: quote.response_type || 'offer',
      amount: quote.amount ?? '',
      details: quote.details || '',
      proposedChanges: quote.proposed_changes || '',
      availabilityStart: formatDateInput(quote.availability_start),
      availabilityEnd: formatDateInput(quote.availability_end),
      validUntil: formatDateInput(quote.valid_until),
    })
  }
  function cancelReviseQuote() {
    setEditingQuoteId(null)
    setForm({
      responseType: 'offer',
      amount: '',
      details: '',
      proposedChanges: '',
      availabilityStart: '',
      availabilityEnd: '',
      validUntil: '',
    })
  }
  async function sendQuote(event) {
    event.preventDefault(); setError(''); setMessage(''); setSubmittingQuote(true)
    try {
      if (editingQuoteId) {
        await inquiriesApi.reviseQuote(editingQuoteId, form)
        setEditingQuoteId(null)
        setMessage('Offer revised and previous version saved in history.')
      } else {
        await inquiriesApi.quote(id, form)
        setMessage('Response sent to the client.')
      }
      setForm({
        responseType: 'offer',
        amount: '',
        details: '',
        proposedChanges: '',
        availabilityStart: '',
        availabilityEnd: '',
        validUntil: '',
      })
      await load()
    } catch (quoteError) {
      setError(quoteError.message)
    } finally {
      setSubmittingQuote(false)
    }
  }
  async function handleWithdrawQuote(quotationId) {
    setError(''); setMessage(''); setUpdatingStatus(true)
    try {
      if (editingQuoteId === quotationId) cancelReviseQuote()
      await inquiriesApi.withdrawQuote(quotationId)
      setMessage('Quotation withdrawn.')
      await load()
    } catch (withdrawErr) {
      setError(withdrawErr.message)
    } finally {
      setUpdatingStatus(false)
    }
  }
  async function quoteStatus(quotationId, status) {
    setError(''); setMessage(''); setUpdatingStatus(true)
    try { await inquiriesApi.quoteStatus(quotationId, status); setMessage(`Quotation ${status}.`); await load() } catch (statusError) { setError(statusError.message) } finally { setUpdatingStatus(false) }
  }
  async function changeInquiryStatus(status) {
    setError(''); setMessage(''); setUpdatingStatus(true)
    try { await inquiriesApi.close(id, status); setMessage(`Inquiry marked as ${status}.`); await load() } catch (statusError) { setError(statusError.message) } finally { setUpdatingStatus(false) }
  }
  async function approveCurrentAgreement(agreement) {
    setError(''); setMessage(''); setUpdatingStatus(true)
    try {
      const res = await agreementsApi.approve(agreement.id, agreement.version)
      if (res.confirmed && res.booking?.id) {
        setMessage(`Both parties approved agreement v${agreement.version}. Booking #${res.booking.id} is now confirmed!`)
      } else {
        setMessage(`You approved agreement v${agreement.version}. Waiting for the other party to approve v${agreement.version}.`)
      }
      await load()
    } catch (approveErr) {
      setError(approveErr.message)
    } finally {
      setUpdatingStatus(false)
    }
  }
  async function saveAgreementRevision(event, agreement) {
    event.preventDefault(); setError(''); setMessage(''); setUpdatingStatus(true)
    try {
      const res = await agreementsApi.edit(agreement.id, {
        ...agreementForm,
        expectedVersion: agreement.version,
      })
      setEditingAgreement(false)
      setMessage(`Agreement updated to v${res.agreement.version}. Both parties must approve v${res.agreement.version}.`)
      await load()
    } catch (editErr) {
      setError(editErr.message)
    } finally {
      setUpdatingStatus(false)
    }
  }
  async function openConversation() {
    try { const result = await communicationApi.createConversation(inquiry.id); navigate(`/messages?conversationId=${result.id}`) } catch (conversationError) { setError(conversationError.message) }
  }
  if (!data) return <section className="container inquiry-content">{error ? <div className="form-error">{error}</div> : <p>Loading inquiry...</p>}</section>
  const { inquiry, quotations = [], images = [], activeAgreement = null, agreements = [] } = data
  if (!inquiry) return <section className="container inquiry-content"><div className="form-error" role="alert">The inquiry response was incomplete. Please return to the inquiry list and try again.</div></section>
  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value })
  const canCloseOrCancel = !['closed', 'cancelled', 'expired', 'confirmed'].includes(inquiry.status)
  const myActiveSentQuote = user.role === 'gardener'
    ? quotations.find((q) => q.gardener_id === user.id && q.status === 'sent' && !q.locked_at)
    : null
  const myAcceptedQuote = user.role === 'gardener'
    ? quotations.find((q) => q.gardener_id === user.id && q.status === 'accepted')
    : null
  const canGardenerRespond = user.role === 'gardener'
    && ['open', 'responded'].includes(inquiry.status)
    && !myAcceptedQuote
    && (!myActiveSentQuote || editingQuoteId === myActiveSentQuote.id)
  return (
    <section className="container inquiry-content">
      <Link className="back-link" to="/inquiries"><ArrowLeft size={15} /> Back to inquiries</Link>
      <p className="eyebrow">Inquiry #{inquiry.id} · {inquiry.request_type === 'general' ? 'General service request' : 'Direct provider inquiry'}</p>
      <h1>{inquiry.subject}</h1>
      <div className="inquiry-status-row">
        <span className={`inquiry-status status-${inquiry.status}`}>{inquiry.status}</span>
        <span>{inquiry.service_title || inquiry.category_name || 'Direct gardener inquiry'}</span>
        {inquiry.gardener_name && <span>Provider: {inquiry.gardener_name}</span>}
        <button className="table-action" type="button" onClick={openConversation}>Open conversation</button>
        {canCloseOrCancel && user.role === 'client' && (
          <button className="table-action" type="button" disabled={updatingStatus} onClick={() => changeInquiryStatus('cancelled')}>
            {updatingStatus ? 'Saving...' : 'Cancel inquiry'}
          </button>
        )}
        {canCloseOrCancel && (
          <button className="table-action" type="button" disabled={updatingStatus} onClick={() => changeInquiryStatus('closed')}>
            {updatingStatus ? 'Saving...' : 'Close inquiry'}
          </button>
        )}
      </div>
      {message && <div className="form-success" role="status" style={{ marginBottom: '16px' }}>{message}</div>}
      {error && <div className="form-error" role="alert" style={{ marginBottom: '16px' }}>{error}</div>}
      <div className="inquiry-detail-grid">
        <article className="dashboard-panel">
          <h2>Project details</h2>
          <p className="inquiry-description">{inquiry.description}</p>
          {inquiry.ai_summary && (
            <p className="form-note" style={{ marginTop: '8px' }}>
              <strong>AI-assisted requirement summary:</strong> {inquiry.ai_summary}
            </p>
          )}
          <div className="detail-facts">
            <span><strong>Requested date</strong>{formatDate(inquiry.requested_date) || 'Not specified'}</span>
            <span><strong>Location</strong>{inquiry.location || 'Not specified'}</span>
            {inquiry.expires_at && <span><strong>Expires</strong>{formatDate(inquiry.expires_at)}</span>}
          </div>
          {images.length > 0 && (
            <div style={{ marginTop: '14px', marginBottom: '14px' }}>
              <h3>Garden photos ({images.length})</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}>
                {images.map((img) => (
                  <a key={img.id} href={getRequestImageUrl(img.id)} target="_blank" rel="noreferrer">
                    <img
                      src={getRequestImageUrl(img.id)}
                      alt={img.originalName || `Garden photo #${img.id}`}
                      style={{ width: '110px', height: '110px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.12)' }}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
          <h2>Quotations and provider responses</h2>
          {quotations.length === 0 && <p className="form-note">No quotation has been sent yet.</p>}
          {quotations.map((quote) => (
            <div className="quotation-card" key={quote.id}>
              <div>
                <strong>
                  {quote.amount !== null && quote.amount !== undefined && quote.amount !== '' ? `₱${quote.amount}` : 'Indicative response'}
                  {quote.revision_number > 1 ? ` (v${quote.revision_number})` : ''}
                </strong>
                <span className={`inquiry-status status-${quote.status}`}>{quote.status}</span>
              </div>
              <p className="form-note" style={{ margin: '4px 0' }}>
                <strong>Assessment:</strong> {RESPONSE_TYPE_LABELS[quote.response_type] || quote.response_type}
                {quote.gardener_name ? ` · ${quote.gardener_name}` : ''}
                {quote.locked_at ? ' · Locked after client acceptance' : ''}
              </p>
              <p>{quote.details}</p>
              {quote.proposed_changes && (
                <p className="form-note" style={{ marginTop: '6px' }}>
                  <strong>Proposed modifications:</strong> {quote.proposed_changes}
                </p>
              )}
              <small>
                {quote.availability_start
                  ? `Availability: ${formatDate(quote.availability_start)} to ${formatDate(quote.availability_end) || 'open'}`
                  : 'Availability to be discussed'}
                {quote.valid_until ? ` · Valid until ${formatDate(quote.valid_until)}` : ''}
              </small>
              {user.role === 'client' && quote.status === 'sent' && ['open', 'responded'].includes(inquiry.status) && (
                <div className="inline-actions">
                  {quote.response_type !== 'cannot_do' && (
                    <button className="button" type="button" disabled={updatingStatus} onClick={() => quoteStatus(quote.id, 'accepted')}>
                      {updatingStatus ? 'Saving...' : 'Accept quotation'}
                    </button>
                  )}
                  <button className="table-action" type="button" disabled={updatingStatus} onClick={() => quoteStatus(quote.id, 'declined')}>
                    {updatingStatus ? 'Saving...' : 'Decline'}
                  </button>
                </div>
              )}
              {user.role === 'gardener' && quote.gardener_id === user.id && quote.status === 'sent' && !quote.locked_at && ['open', 'responded'].includes(inquiry.status) && (
                <div className="inline-actions">
                  <button className="table-action" type="button" disabled={updatingStatus} onClick={() => startReviseQuote(quote)}>
                    Revise offer
                  </button>
                  <button className="table-action" type="button" disabled={updatingStatus} onClick={() => handleWithdrawQuote(quote.id)}>
                    {updatingStatus ? 'Saving...' : 'Withdraw'}
                  </button>
                </div>
              )}
              {user.role === 'client' && quote.status === 'accepted' && !activeAgreement && (
                <div className="inline-actions">
                  <Link className="button" to={`/bookings/new?inquiryId=${inquiry.id}&quotationId=${quote.id}`}>Propose mutual agreement</Link>
                </div>
              )}
              {Array.isArray(quote.revisions) && quote.revisions.length > 0 && (
                <details style={{ marginTop: '8px' }}>
                  <summary>Offer revision history ({quote.revisions.length} previous {quote.revisions.length === 1 ? 'version' : 'versions'})</summary>
                  {quote.revisions.map((rev) => (
                    <div key={rev.id} style={{ marginTop: '6px', paddingLeft: '10px', borderLeft: '2px solid rgba(0,0,0,0.12)' }}>
                      <small>
                        <strong>v{rev.revision_number}</strong> ({RESPONSE_TYPE_LABELS[rev.response_type] || rev.response_type})
                        {rev.amount !== null && rev.amount !== undefined ? ` — ₱${rev.amount}` : ''}
                      </small>
                      <p style={{ margin: '2px 0' }}>{rev.details}</p>
                      {rev.proposed_changes && <small>Proposed modifications: {rev.proposed_changes}</small>}
                    </div>
                  ))}
                </details>
              )}
            </div>
          ))}
          {activeAgreement && (
            <div className="quotation-card" style={{ marginTop: '18px' }}>
              <div>
                <strong>Mutual Agreement v{activeAgreement.version} — ₱{activeAgreement.amount}</strong>
                <span className={`inquiry-status status-${activeAgreement.status}`}>{activeAgreement.status}</span>
              </div>
              <p>{activeAgreement.scope_of_work}</p>
              <small>
                Schedule: {new Date(activeAgreement.scheduled_start).toLocaleString()} to {new Date(activeAgreement.scheduled_end).toLocaleString()} · Location: {activeAgreement.location}
              </small>
              <p className="form-note" style={{ marginTop: '8px' }}>
                Client approval: {activeAgreement.client_approved_at ? 'Approved' : 'Pending'} · Gardener approval: {activeAgreement.gardener_approved_at ? 'Approved' : 'Pending'}
              </p>
              {activeAgreement.status === 'proposed' && (
                <div className="inline-actions" style={{ marginTop: '10px' }}>
                  {((user.role === 'client' && !activeAgreement.client_approved_at) || (user.role === 'gardener' && !activeAgreement.gardener_approved_at)) && (
                    <button className="button" type="button" disabled={updatingStatus} onClick={() => approveCurrentAgreement(activeAgreement)}>
                      {updatingStatus ? 'Saving...' : `Approve v${activeAgreement.version}`}
                    </button>
                  )}
                  <button className="table-action" type="button" onClick={() => setEditingAgreement((open) => !open)}>
                    {editingAgreement ? 'Cancel edit' : 'Edit terms (creates new version)'}
                  </button>
                </div>
              )}
              {activeAgreement.booking_id && (
                <div className="inline-actions" style={{ marginTop: '10px' }}>
                  <Link className="button" to={`/bookings/${activeAgreement.booking_id}`}>View confirmed booking #{activeAgreement.booking_id}</Link>
                </div>
              )}
              {editingAgreement && activeAgreement.status === 'proposed' && (
                <form className="profile-form" onSubmit={(e) => saveAgreementRevision(e, activeAgreement)} style={{ marginTop: '14px' }}>
                  <label>Scope of work
                    <textarea required rows="3" value={agreementForm.scopeOfWork} onChange={(e) => setAgreementForm({ ...agreementForm, scopeOfWork: e.target.value })} />
                  </label>
                  <div className="form-row">
                    <label>Agreed price (PHP)
                      <input required type="number" min="0" step="0.01" value={agreementForm.amount} onChange={(e) => setAgreementForm({ ...agreementForm, amount: e.target.value })} />
                    </label>
                    <label>Price basis
                      <input value={agreementForm.priceBasis} onChange={(e) => setAgreementForm({ ...agreementForm, priceBasis: e.target.value })} />
                    </label>
                  </div>
                  <div className="form-row">
                    <label>Start date and time
                      <input required type="datetime-local" value={agreementForm.scheduledStart} onChange={(e) => setAgreementForm({ ...agreementForm, scheduledStart: e.target.value })} />
                    </label>
                    <label>End date and time
                      <input required type="datetime-local" value={agreementForm.scheduledEnd} onChange={(e) => setAgreementForm({ ...agreementForm, scheduledEnd: e.target.value })} />
                    </label>
                  </div>
                  <label>Location
                    <input required maxLength="255" value={agreementForm.location} onChange={(e) => setAgreementForm({ ...agreementForm, location: e.target.value })} />
                  </label>
                  <label>Conditions
                    <textarea rows="2" value={agreementForm.conditions} onChange={(e) => setAgreementForm({ ...agreementForm, conditions: e.target.value })} />
                  </label>
                  <button className="button" type="submit" disabled={updatingStatus}>
                    {updatingStatus ? 'Saving...' : `Save as v${activeAgreement.version + 1} (resets approvals)`}
                  </button>
                </form>
              )}
            </div>
          )}
          {agreements.length > 1 && (
            <details style={{ marginTop: '12px' }}>
              <summary>Agreement version history ({agreements.length} versions)</summary>
              {agreements.map((ver) => (
                <div className="quotation-card" key={ver.id} style={{ marginTop: '8px' }}>
                  <strong>v{ver.version} ({ver.status}) — ₱{ver.amount}</strong>
                  <p>{ver.scope_of_work}</p>
                </div>
              ))}
            </details>
          )}
        </article>
        {canGardenerRespond && (
          <form className="dashboard-panel profile-form" onSubmit={sendQuote}>
            <p className="eyebrow">{editingQuoteId ? 'Revise active offer' : 'Respond to client'}</p>
            <h2>{editingQuoteId ? 'Update your offer before acceptance.' : 'Evaluate feasibility and send an offer.'}</h2>
            <label>Response type
              <select value={form.responseType} onChange={change('responseType')}>
                <option value="offer">Standard offer</option>
                <option value="feasible">Feasible as requested</option>
                <option value="modifications">Feasible with modifications</option>
                <option value="cannot_do">Cannot fulfill request</option>
              </select>
            </label>
            {form.responseType !== 'cannot_do' && (
              <label>Indicative amount (PHP)
                <input type="number" min="0" step="0.01" value={form.amount} onChange={change('amount')} />
              </label>
            )}
            <label>Details
              <textarea required rows="4" value={form.details} onChange={change('details')} placeholder="Explain what is included, feasibility assessment, and any conditions." />
            </label>
            {form.responseType === 'modifications' && (
              <label>Proposed modifications
                <textarea required rows="3" value={form.proposedChanges} onChange={change('proposedChanges')} placeholder="Describe suggested adjustments to scope, schedule, or materials." />
              </label>
            )}
            {form.responseType !== 'cannot_do' && (
              <>
                <div className="form-row">
                  <label>Available from<input type="date" value={form.availabilityStart} onChange={change('availabilityStart')} /></label>
                  <label>Available until<input type="date" value={form.availabilityEnd} onChange={change('availabilityEnd')} /></label>
                </div>
                <label>Quotation valid until<input type="date" value={form.validUntil} onChange={change('validUntil')} /></label>
              </>
            )}
            <div className="inline-actions">
              <button className="button" type="submit" disabled={submittingQuote}>
                {submittingQuote ? 'Saving...' : editingQuoteId ? 'Save revised offer' : 'Send response'}
              </button>
              {editingQuoteId && (
                <button className="table-action" type="button" onClick={cancelReviseQuote}>
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  )
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
