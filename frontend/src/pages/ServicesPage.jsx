import { useEffect, useState } from 'react'
import { ArrowRight, Leaf, MapPin, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import AppSidebar from '../components/AppSidebar'
import { useAuth } from '../hooks/useAuth'
import { servicesApi } from '../services/services'
import { ZAMBOANGA_BARANGAYS } from '../utils/zamboangaAddress'

function PublicHeader() {
  return (
    <header className="dashboard-header public-header">
      <div className="container public-header-inner">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true"><Leaf size={18} /></span>
          <span>Huga<span>Tiera</span></span>
        </Link>
        <div className="inline-actions">
          <Link className="text-link" to="/assistant">Garden assistant</Link>
          <Link className="button button-outline" to="/login">Sign in</Link>
        </div>
      </div>
    </header>
  )
}

export default function ServicesPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [services, setServices] = useState([])
  const [categories, setCategories] = useState([])
  const [filters, setFilters] = useState({
    keyword: searchParams.get('keyword') || '',
    categoryId: searchParams.get('categoryId') || '',
    serviceArea: searchParams.get('serviceArea') || '',
    sort: 'newest',
  })
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    servicesApi.categories()
      .then((result) => setCategories(result.categories))
      .catch((loadError) => setError(loadError.message))
  }, [])

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      if (!active) return
      servicesApi.list({ ...filters, page: pagination.page })
        .then((result) => {
          if (!active) return
          setServices(result.services)
          setPagination(result.pagination)
        })
        .catch((loadError) => { if (active) setError(loadError.message) })
        .finally(() => { if (active) setLoading(false) })
    }, 220)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [filters, pagination.page])

  function changeFilter(field) {
    return (event) => {
      setLoading(true)
      setPagination((current) => ({ ...current, page: 1 }))
      setFilters((current) => ({ ...current, [field]: event.target.value }))
    }
  }

  return (
    <main className={`marketplace-page${user ? ' protected-page' : ''}${['client', 'gardener'].includes(user?.role) ? ' member-workspace' : ''}`} data-workspace={user?.role || 'public'}>
      {user ? <AppSidebar /> : <PublicHeader />}
      <section className="container marketplace-content">
        <h1>Gardening services for your space.</h1>
        <p className="marketplace-lead">
          Search active services from approved gardeners in Zamboanga City. Browse provider portfolios or start with an inquiry.
        </p>

        <form className="marketplace-filters" role="search" aria-label="Filter gardening services" onSubmit={(event) => event.preventDefault()}>
          <label className="search-field">
            <Search size={17} aria-hidden="true" />
            <input aria-label="Search services, gardeners, or keywords" placeholder="Search services, gardeners, or keywords" value={filters.keyword} onChange={changeFilter('keyword')} />
          </label>
          <select aria-label="Filter by category" value={filters.categoryId} onChange={changeFilter('categoryId')}>
            <option value="">All categories</option>
            {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
          <input
            aria-label="Filter by service area"
            list="zamboanga-barangays-marketplace"
            placeholder="Service area (e.g. Tetuan)"
            value={filters.serviceArea}
            onChange={changeFilter('serviceArea')}
          />
          <datalist id="zamboanga-barangays-marketplace">
            {ZAMBOANGA_BARANGAYS.map((brgy) => <option key={brgy} value={brgy} />)}
          </datalist>
          <select aria-label="Sort services" value={filters.sort} onChange={changeFilter('sort')}>
            <option value="newest">Newest first</option>
            <option value="price_low">Lowest price</option>
            <option value="price_high">Highest price</option>
          </select>
        </form>

        {error && <div className="form-error" role="alert">{error}</div>}
        {loading && (
          <div className="marketplace-grid marketplace-card-grid" aria-busy="true" role="status" aria-label="Loading services">
            {[1, 2, 3].map((idx) => (
              <div className="dashboard-panel skeleton-stack" key={idx}>
                <div className="skeleton-line" style={{ height: '140px' }} />
                <div className="skeleton-line" />
                <div className="skeleton-line short" />
              </div>
            ))}
          </div>
        )}
        {!loading && !error && services.length === 0 && (
          <div className="empty-state" role="status">
            No approved services match your search yet. Try another keyword or category, or check back after more gardeners are approved.
          </div>
        )}
        {!loading && (
          <div className="marketplace-results-bar">
            <p className="result-count" role="status" style={{ margin: 0 }}>
              {pagination.total} service{pagination.total === 1 ? '' : 's'} available
            </p>
            {(filters.keyword || filters.categoryId || filters.serviceArea || filters.sort !== 'newest') && (
              <button
                type="button"
                className="table-action"
                onClick={() => {
                  setLoading(true)
                  setPagination((current) => ({ ...current, page: 1 }))
                  setFilters({ keyword: '', categoryId: '', serviceArea: '', sort: 'newest' })
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="marketplace-grid marketplace-card-grid">
          {services.map((service) => {
            const coverUrl = service.image_path
              ? servicesApi.serviceImageUrl(service.id)
              : (service.first_portfolio_id ? servicesApi.imageUrl(service.first_portfolio_id) : null)
            const gardenerName = service.business_name || `${service.first_name} ${service.last_name}`
            return (
              <article className="marketplace-card visual-market-card" key={service.id} aria-labelledby={`service-title-${service.id}`}>
                <Link className="marketplace-card-media card-media-link" to={`/services/${service.id}`} aria-label={`View ${service.title}`}>
                  {coverUrl ? (
                    <img src={coverUrl} alt={`${service.title} by ${gardenerName}`} loading="lazy" />
                  ) : (
                    <div className="marketplace-card-placeholder" aria-hidden="true">
                      <Leaf size={26} />
                    </div>
                  )}
                  <span className="category-pill media-badge">{service.category_name}</span>
                </Link>
                <div className="marketplace-card-body">
                  <h2 id={`service-title-${service.id}`}>
                    <Link className="card-title-link" to={`/services/${service.id}`}>{service.title}</Link>
                  </h2>
                  <p>{service.description}</p>
                  <div className="service-meta">
                    <Link to={`/gardeners/${service.gardener_id}`}>{gardenerName}</Link>
                    <strong className="card-price">
                      {service.indicative_price ? `From ₱${Number(service.indicative_price).toLocaleString()}` : 'Quotation available'}
                    </strong>
                  </div>
                  <div className="marketplace-card-footer">
                    <span className="card-area"><MapPin size={13} aria-hidden="true" /> {service.service_area}</span>
                    <Link className="card-cta" to={`/services/${service.id}`}>
                      View service <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        {pagination.pages > 1 && (
          <nav className="pagination" aria-label="Services pagination">
            <button type="button" aria-label="Previous page" disabled={pagination.page <= 1} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}>
              Previous
            </button>
            <span aria-live="polite">Page {pagination.page} of {pagination.pages}</span>
            <button type="button" aria-label="Next page" disabled={pagination.page >= pagination.pages} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}>
              Next
            </button>
          </nav>
        )}
      </section>
    </main>
  )
}
