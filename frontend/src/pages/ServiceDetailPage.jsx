import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Clock, Leaf, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import AppSidebar from '../components/AppSidebar'
import TransientSuccess from '../components/TransientSuccess'
import { useAuth } from '../hooks/useAuth'
import { servicesApi } from '../services/services'
import { formatWorkingDaysLabel, profileApi } from '../services/profiles'

export default function ServiceDetailPage() {
  const { serviceId } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [error, setError] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportForm, setReportForm] = useState({ reason: '', details: '' })
  const [reportStatus, setReportStatus] = useState({ error: '', message: '', submitting: false })
  const workspace = user?.role || 'public'
  const memberWorkspace = ['client', 'gardener'].includes(user?.role)

  useEffect(() => {
    let active = true
    servicesApi.detail(serviceId)
      .then((res) => {
        if (!active) return
        setData(res)
        if (res?.service?.gardener_id) {
          servicesApi.gardenerAvailability(res.service.gardener_id)
            .then((avail) => { if (active) setAvailability(avail) })
            .catch(() => {})
        }
      })
      .catch((loadError) => { if (active) setError(loadError.message) })
    return () => { active = false }
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

  if (error) return <main className={`marketplace-page${user ? ' protected-page' : ''}${memberWorkspace ? ' member-workspace' : ''}`} data-workspace={workspace}>{user ? <AppSidebar /> : <PageHeader />}<section className="container detail-content"><div className="form-error">{error}</div></section></main>
  if (!data) {
    return (
      <main className={`marketplace-page${user ? ' protected-page' : ''}${memberWorkspace ? ' member-workspace' : ''}`} data-workspace={workspace}>
        {user ? <AppSidebar /> : <PageHeader />}
        <section className="container detail-content">
          <div className="dashboard-panel skeleton-stack" aria-busy="true">
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
        </section>
      </main>
    )
  }
  const { service, portfolios } = data

  return (
    <main className={`marketplace-page${user ? ' protected-page' : ''}${memberWorkspace ? ' member-workspace' : ''}`} data-workspace={workspace}>
      {user ? <AppSidebar /> : <PageHeader />}
      <section className="container detail-content">
        <Link className="back-link" to="/services"><ArrowLeft size={15} /> Back to services</Link>
        <div className="detail-grid">
          <article className="detail-main">
            {service.image_path && (
              <div className="service-detail-cover">
                <img src={servicesApi.serviceImageUrl(service.id)} alt={service.title} />
              </div>
            )}
            <div className="category-pill">{service.category_name}</div>
            <h1>{service.title}</h1>
            <p className="detail-description">{service.description}</p>
            <div className="detail-facts">
              <span><strong>Service area</strong>{service.service_area}</span>
              <span><strong>Starting price</strong>{service.indicative_price ? `₱${Number(service.indicative_price).toLocaleString()} ${service.price_unit || ''}` : 'Custom quote — ask gardener'}</span>
              <span><strong>Workers needed</strong>{service.workers_required || 1} worker{(service.workers_required || 1) === 1 ? '' : 's'}</span>
            </div>
            {user?.role === 'client' && (
              <div className="service-detail-cta-grid">
                <Link className="service-cta-card is-primary" to={`/inquiries/new?serviceId=${service.id}`}>
                  <strong>Ask &amp; get a quote <ArrowRight size={15} /></strong>
                  <span>Not sure of the exact price yet? Share photos and details first.</span>
                </Link>
                {service.indicative_price !== null && (
                  <Link className="service-cta-card" to={`/bookings/new?serviceId=${service.id}`}>
                    <strong>Book with date &amp; price <ArrowRight size={15} /></strong>
                    <span>Ready to schedule? Propose a date and agreement directly.</span>
                  </Link>
                )}
              </div>
            )}
            {!user && <Link className="button" to="/login">Sign in to ask or book</Link>}
            {user && user.id === service.gardener_id && (
              <div className="inline-actions" style={{ marginTop: '14px' }}>
                <Link className="button button-outline button-sm" to="/dashboard?tab=services">
                  Manage this service in My services
                </Link>
              </div>
            )}
            {user && user.role !== 'client' && user.id !== service.gardener_id && (
              <p className="form-note">Switch to a Client account to ask about or book this service.</p>
            )}
            {service.indicative_price !== null && user?.role === 'client' && (
              <p className="booking-note">
                Nothing is locked until both you and the gardener approve the same scope, price, and schedule.
              </p>
            )}
          </article>
          <aside className="gardener-summary">
            <p className="eyebrow">Service provider</p>
            <h2>{service.business_name || `${service.first_name} ${service.last_name}`}</h2>
            <p>{service.gardener_description || 'A local gardening service provider on HugaTiera.'}</p>
            <Link className="text-link" to={`/gardeners/${service.gardener_id}`}>View gardener profile <ArrowRight size={15} /></Link>
            {availability?.schedule && (
              <div className="availability-preview-box">
                <p className="eyebrow" style={{ marginBottom: '6px' }}>Availability &amp; crew capacity</p>
                <span><CalendarDays size={13} /> {formatWorkingDaysLabel(availability.schedule.workingDays)}</span>
                <span><Clock size={13} /> {availability.schedule.workStartTime} – {availability.schedule.workEndTime}</span>
                <span><Users size={13} /> Daily crew: {availability.schedule.crewSize || 1} worker(s) · Needs {service.workers_required || 1} worker(s)</span>
                {Array.isArray(availability.fullyBookedDates) && availability.fullyBookedDates.length > 0 && (
                  <div className="fully-booked-row">
                    <strong>Fully booked dates:</strong>
                    <div className="fully-booked-chips">
                      {availability.fullyBookedDates.slice(0, 5).map((d) => (
                        <span className="fully-booked-pill" key={d.date || d}>{d.date || d}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {user && user.id !== service.gardener_id && (
              <div style={{ marginTop: '18px' }}>
                <button className="table-action" type="button" onClick={() => setReporting((open) => !open)}>
                  {reporting ? 'Cancel report' : 'Report listing'}
                </button>
              </div>
            )}
            {reportStatus.message && <TransientSuccess key={reportStatus.message} message={reportStatus.message} onDismiss={() => setReportStatus((prev) => ({ ...prev, message: '' }))} style={{ marginTop: '12px' }} />}
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
  return (
    <header className="dashboard-header public-header">
      <div className="container public-header-inner">
        <Link className="brand" to="/"><span className="brand-mark"><Leaf size={18} /></span><span>Huga<span>Tiera</span></span></Link>
        <div className="inline-actions">
          <Link className="text-link" to="/services">Services</Link>
          <Link className="button button-outline" to="/login">Sign in</Link>
        </div>
      </div>
    </header>
  )
}
