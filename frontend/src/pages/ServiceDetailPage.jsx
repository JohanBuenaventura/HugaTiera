import { useEffect, useState } from 'react'
import { ArrowLeft, Leaf } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { servicesApi } from '../services/services'
import { profileApi } from '../services/profiles'

export default function ServiceDetailPage() {
  const { serviceId } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportForm, setReportForm] = useState({ reason: '', details: '' })
  const [reportStatus, setReportStatus] = useState({ error: '', message: '', submitting: false })

  useEffect(() => {
    servicesApi.detail(serviceId).then(setData).catch((loadError) => setError(loadError.message))
  }, [serviceId])

  async function submitReport(event) {
    event.preventDefault()
    setReportStatus({ error: '', message: '', submitting: true })
    try {
      await profileApi.createReport({
        reportedServiceId: data.service.id,
        reportedUserId: data.service.gardener_id,
        reason: reportForm.reason,
        details: reportForm.details,
      })
      setReportForm({ reason: '', details: '' })
      setReporting(false)
      setReportStatus({ error: '', message: 'Report submitted for administrator review.', submitting: false })
    } catch (reportError) {
      setReportStatus({ error: reportError.message, message: '', submitting: false })
    }
  }

  if (error) return <main className="marketplace-page"><PageHeader /><section className="container detail-content"><div className="form-error">{error}</div></section></main>
  if (!data) return <main className="marketplace-page"><PageHeader /><section className="container detail-content"><p>Loading service...</p></section></main>
  const { service, portfolios } = data

  return (
    <main className="marketplace-page">
      <PageHeader />
      <section className="container detail-content">
        <Link className="back-link" to="/services"><ArrowLeft size={15} /> Back to services</Link>
        <div className="detail-grid">
          <article className="detail-main">
            <div className="category-pill">{service.category_name}</div>
            <h1>{service.title}</h1>
            <p className="detail-description">{service.description}</p>
            <div className="detail-facts">
              <span><strong>Service area</strong>{service.service_area}</span>
              <span><strong>Indicative price</strong>{service.indicative_price ? `₱${service.indicative_price} ${service.price_unit || ''}` : 'Discuss with gardener'}</span>
            </div>
            {user?.role === 'client' && (
              <div className="inline-actions">
                <Link className="button" to={`/inquiries/new?serviceId=${service.id}`}>Ask about this service</Link>
                {service.indicative_price !== null && <Link className="button button-outline" to={`/bookings/new?serviceId=${service.id}`}>Propose service agreement</Link>}
              </div>
            )}
            {!user && <Link className="button" to="/login">Sign in to continue</Link>}
            {user && user.role !== 'client' && (
              <p className="form-note">Client accounts can submit inquiries or propose service agreements for this service.</p>
            )}
            {service.indicative_price !== null && <p className="booking-note">Know what you need? Propose a mutual agreement with scope, price, and schedule. A booking is confirmed only after both you and the gardener approve the same agreement version.</p>}
          </article>
          <aside className="gardener-summary">
            <p className="eyebrow">Service provider</p>
            <h2>{service.business_name || `${service.first_name} ${service.last_name}`}</h2>
            <p>{service.gardener_description || 'A local gardening service provider on HugaTiera.'}</p>
            <Link className="text-link" to={`/gardeners/${service.gardener_id}`}>View gardener profile <ArrowLeft size={15} /></Link>
            {user && user.id !== service.gardener_id && (
              <div style={{ marginTop: '18px' }}>
                <button className="table-action" type="button" onClick={() => setReporting((open) => !open)}>
                  {reporting ? 'Cancel report' : 'Report listing'}
                </button>
              </div>
            )}
            {reportStatus.message && <div className="form-success" role="status" style={{ marginTop: '12px' }}>{reportStatus.message}</div>}
            {reportStatus.error && <div className="form-error" role="alert" style={{ marginTop: '12px' }}>{reportStatus.error}</div>}
            {reporting && (
              <form className="profile-form" onSubmit={submitReport} style={{ marginTop: '14px' }}>
                <label>Reason for report
                  <input required maxLength="255" value={reportForm.reason} onChange={(e) => setReportForm({ ...reportForm, reason: e.target.value })} placeholder="e.g. Misleading service information" />
                </label>
                <label>Additional details
                  <textarea rows="3" maxLength="2000" value={reportForm.details} onChange={(e) => setReportForm({ ...reportForm, details: e.target.value })} placeholder="Optional context for the administrator" />
                </label>
                <button className="button" type="submit" disabled={reportStatus.submitting}>
                  {reportStatus.submitting ? 'Submitting...' : 'Submit report'}
                </button>
              </form>
            )}
          </aside>
        </div>
        {portfolios.length > 0 && (
          <section className="detail-portfolio">
            <p className="eyebrow">Previous work</p>
            <h2>Portfolio</h2>
            <div className="portfolio-gallery">
              {portfolios.map((portfolio) => (
                <figure key={portfolio.id}>
                  <img src={servicesApi.imageUrl(portfolio.id)} alt={portfolio.title} />
                  <figcaption>{portfolio.title}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

function PageHeader() {
  const { user } = useAuth()
  return (
    <header className="dashboard-header container">
      <Link className="brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link>
      <Link className="button button-outline" to={user ? '/dashboard' : '/login'}>{user ? 'Dashboard' : 'Sign in'}</Link>
    </header>
  )
}
