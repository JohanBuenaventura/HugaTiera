import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Clock, Leaf, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import AppSidebar from '../components/AppSidebar'
import { useAuth } from '../hooks/useAuth'
import { servicesApi } from '../services/services'
import { formatWorkingDaysLabel, profileApi } from '../services/profiles'

export default function GardenerPage() {
  const { gardenerId } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [error, setError] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportForm, setReportForm] = useState({ reason: '', details: '' })
  const [reportStatus, setReportStatus] = useState({ error: '', message: '', submitting: false })

  useEffect(() => {
    let active = true
    servicesApi.gardener(gardenerId).then((res) => { if (active) setData(res) }).catch((loadError) => { if (active) setError(loadError.message) })
    servicesApi.gardenerAvailability(gardenerId).then((avail) => { if (active) setAvailability(avail) }).catch(() => {})
    return () => { active = false }
  }, [gardenerId])

  async function submitReport(event) {
    event.preventDefault()
    setReportStatus({ error: '', message: '', submitting: true })
    try {
      await profileApi.createReport({
        reportedUserId: data.gardener.id,
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

  return (
    <main className={`marketplace-page${user ? ' protected-page' : ''}`}>
      {user ? (
        <AppSidebar />
      ) : (
        <header className="dashboard-header public-header">
          <div className="container public-header-inner">
            <Link className="brand" to="/"><span className="brand-mark"><Leaf size={18} /></span><span>Huga<span>Tiera</span></span></Link>
            <div className="inline-actions">
              <Link className="text-link" to="/services">Browse services</Link>
              <Link className="button button-outline" to="/login">Sign in</Link>
            </div>
          </div>
        </header>
      )}
      <section className="container detail-content">
        {error && <div className="form-error">{error}</div>}
        {!data && !error && (
          <div className="dashboard-panel skeleton-stack" aria-busy="true">
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
        )}
        {data && (
          <>
            <Link className="back-link" to="/services"><ArrowLeft size={15} /> Back to services</Link>
            <div className="gardener-profile-hero">
              <p className="eyebrow">Gardener profile</p>
              <h1>{data.gardener.business_name || `${data.gardener.first_name} ${data.gardener.last_name}`}</h1>
              <p>{data.gardener.description || 'A local gardening service provider on HugaTiera.'}</p>
              <span>
                {data.gardener.service_area}
                {data.gardener.years_of_experience ? ` · ${data.gardener.years_of_experience} years experience` : ''}
                {data.gardener.average_rating ? ` · ★ ${data.gardener.average_rating} (${data.gardener.review_count} review${data.gardener.review_count === 1 ? '' : 's'})` : ' · No ratings yet'}
              </span>
              {user?.role === 'client' && (
                <div className="inline-actions" style={{ marginTop: '14px' }}>
                  <Link className="button" to={`/inquiries/new?gardenerId=${data.gardener.id}`}>
                    Send direct inquiry
                  </Link>
                </div>
              )}
              {user && user.id !== data.gardener.id && (
                <div style={{ marginTop: '14px' }}>
                  <button className="table-action" type="button" onClick={() => setReporting((open) => !open)}>
                    {reporting ? 'Cancel report' : 'Report gardener'}
                  </button>
                </div>
              )}
              {reportStatus.message && <div className="form-success" role="status" style={{ marginTop: '12px' }}>{reportStatus.message}</div>}
              {reportStatus.error && <div className="form-error" role="alert" style={{ marginTop: '12px' }}>{reportStatus.error}</div>}
              {reporting && (
                <form className="profile-form" onSubmit={submitReport} style={{ marginTop: '14px', maxWidth: '520px' }}>
                  <label>Reason for report
                    <input required maxLength="255" value={reportForm.reason} onChange={(e) => setReportForm({ ...reportForm, reason: e.target.value })} placeholder="e.g. Inappropriate profile content" />
                  </label>
                  <label>Additional details
                    <textarea rows="3" maxLength="2000" value={reportForm.details} onChange={(e) => setReportForm({ ...reportForm, details: e.target.value })} placeholder="Optional context for the administrator" />
                  </label>
                  <button className="button" type="submit" disabled={reportStatus.submitting}>
                    {reportStatus.submitting ? 'Submitting...' : 'Submit report'}
                  </button>
                </form>
              )}
            </div>

            <section className="dashboard-panel schedule-public-card" style={{ marginTop: '20px' }}>
              <p className="eyebrow">Working schedule &amp; availability</p>
              <div className="estimate-meta-grid">
                <span><CalendarDays size={14} style={{ verticalAlign: 'text-bottom' }} /> <strong>Working days:</strong> {formatWorkingDaysLabel(data.gardener.working_days)}</span>
                <span><Clock size={14} style={{ verticalAlign: 'text-bottom' }} /> <strong>Hours:</strong> {data.gardener.work_start_time || '08:00'} – {data.gardener.work_end_time || '17:00'}</span>
                <span>
                  <Users size={14} style={{ verticalAlign: 'text-bottom' }} /> <strong>Daily crew:</strong>{' '}
                  {availability?.schedule?.crewSize || data.gardener.crew_size || 1} worker(s)/day ·{' '}
                  {Number(data.gardener.max_concurrent_jobs) > 1
                    ? `Up to ${data.gardener.max_concurrent_jobs} simultaneous jobs`
                    : '1 job at a time'}
                </span>
              </div>
              {Array.isArray(availability?.fullyBookedDates) && availability.fullyBookedDates.length > 0 && (
                <div className="fully-booked-row" style={{ marginTop: '10px' }}>
                  <strong>Fully booked (no service available):</strong>
                  <div className="fully-booked-chips">
                    {availability.fullyBookedDates.slice(0, 6).map((d) => (
                      <span className="fully-booked-pill" key={d.date || d}>{d.date || d}</span>
                    ))}
                  </div>
                </div>
              )}
              {data.gardener.availability_notes && (
                <p className="form-note" style={{ margin: '8px 0 0' }}>
                  <strong>Provider note:</strong> {data.gardener.availability_notes}
                </p>
              )}
              {Array.isArray(data.gardener.unavailable_dates) && data.gardener.unavailable_dates.length > 0 && (
                <p className="field-note" style={{ margin: '8px 0 0' }}>
                  <strong>Upcoming unavailable dates:</strong>{' '}
                  {data.gardener.unavailable_dates
                    .map((d) => (d.start_date === d.end_date ? d.start_date : `${d.start_date} to ${d.end_date}`))
                    .join(', ')}
                </p>
              )}
            </section>

            <h2 className="profile-section-title">Services offered</h2>
            {data.services?.length ? (
              <div className="marketplace-grid">
                {data.services.map((service) => (
                  <article className="marketplace-card" key={service.id}>
                    <h2>{service.title}</h2>
                    <p>{service.description}</p>
                    <div className="service-meta">
                      <span>{service.service_area}</span>
                      <span>{service.indicative_price ? `From ₱${service.indicative_price}` : 'Quotation available'}</span>
                    </div>
                    <Link to={`/services/${service.id}`}>View service <ArrowRight size={15} /></Link>
                  </article>
                ))}
              </div>
            ) : (
              <p className="form-note">No active services listed yet.</p>
            )}

            <section className="detail-portfolio">
              <p className="eyebrow">Previous work</p>
              <h2 className="profile-section-title">Portfolio</h2>
              {data.portfolios?.length ? (
                <div className="portfolio-gallery">
                  {data.portfolios.map((portfolio) => (
                    <figure key={portfolio.id}>
                      <img src={servicesApi.imageUrl(portfolio.id)} alt={portfolio.title} />
                      <figcaption>
                        <strong>{portfolio.title}</strong>
                        {portfolio.description && <span style={{ display: 'block', marginTop: '3px' }}>{portfolio.description}</span>}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="form-note">No portfolio images uploaded yet.</p>
              )}
            </section>

            <section className="detail-portfolio">
              <p className="eyebrow">Client feedback</p>
              <h2 className="profile-section-title">Client reviews</h2>
              <div className="review-list">
                {data.reviews?.length ? data.reviews.map((review) => (
                  <article className="review-card" key={review.id}>
                    <div className="review-heading">
                      <strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong>
                      <span>{review.client_name}</span>
                    </div>
                    <p>{review.review_text || 'No written feedback provided.'}</p>
                    <small>{new Date(review.created_at).toLocaleDateString()}</small>
                  </article>
                )) : <p className="form-note">No reviews yet.</p>}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  )
}
