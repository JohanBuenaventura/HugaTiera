import { useEffect, useState } from 'react'
import { ArrowRight, Leaf, MapPin, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import AppSidebar from '../components/AppSidebar'
import { EmptyGardenIllustration, GardenPlanningIllustration, PottedPlantIllustration } from '../components/BotanicalIllustrations'
import { useAuth } from '../hooks/useAuth'
import { servicesApi } from '../services/services'

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
  const [gardenerCovers, setGardenerCovers] = useState({})
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
    servicesApi.list({ ...filters, page: pagination.page })
      .then(async (result) => {
        if (!active) return
        setServices(result.services)
        setPagination(result.pagination)

        const uniqueGardenerIds = [...new Set(result.services.map((s) => s.gardener_id).filter(Boolean))]
        if (uniqueGardenerIds.length === 0) return
        const settled = await Promise.allSettled(
          uniqueGardenerIds.map((gid) => servicesApi.gardener(gid).then((res) => [gid, res.portfolios?.[0]?.id || null])),
        )
        if (!active) return
        const nextCovers = {}
        for (const item of settled) {
          if (item.status === 'fulfilled') {
            const [gid, portfolioId] = item.value
            if (portfolioId) nextCovers[gid] = servicesApi.imageUrl(portfolioId)
          }
        }
        setGardenerCovers((prev) => ({ ...prev, ...nextCovers }))
      })
      .catch((loadError) => { if (active) setError(loadError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
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
        <div className="botanical-hero-banner">
          <div>
            <p className="eyebrow">Explore local help</p>
            <h1>Gardening services for your space.</h1>
            <p>
              Search active services from approved gardeners in Zamboanga City. Browse provider portfolios or start with an inquiry.
            </p>
          </div>
          <div className="botanical-hero-art">
            <GardenPlanningIllustration />
          </div>
        </div>

        <form className="marketplace-filters" role="search" aria-label="Filter gardening services" onSubmit={(event) => event.preventDefault()}>
          <label className="search-field">
            <Search size={17} aria-hidden="true" />
            <input aria-label="Search services, gardeners, or keywords" placeholder="Search services, gardeners, or keywords" value={filters.keyword} onChange={changeFilter('keyword')} />
          </label>
          <select aria-label="Filter by category" value={filters.categoryId} onChange={changeFilter('categoryId')}>
            <option value="">All categories</option>
            {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
          <input aria-label="Filter by service area" placeholder="Service area" value={filters.serviceArea} onChange={changeFilter('serviceArea')} />
          <select aria-label="Sort services" value={filters.sort} onChange={changeFilter('sort')}>
            <option value="newest">Newest first</option>
            <option value="price_low">Lowest price</option>
            <option value="price_high">Highest price</option>
          </select>
        </form>

        {error && <div className="form-error" role="alert">{error}</div>}
        {loading && <p className="result-count" role="status">Loading services...</p>}
        {!loading && !error && services.length === 0 && (
          <div className="botanical-empty-state" role="status">
            <EmptyGardenIllustration />
            <strong>No matching services yet</strong>
            <p>Try another keyword or category, or check back after more gardeners in Zamboanga City are approved.</p>
          </div>
        )}
        {!loading && <p className="result-count" role="status">{pagination.total} service{pagination.total === 1 ? '' : 's'} available</p>}

        <div className="marketplace-grid marketplace-card-grid">
          {services.map((service, idx) => {
            const coverUrl = service.image_path
              ? servicesApi.serviceImageUrl(service.id)
              : (gardenerCovers[service.gardener_id] || null)
            const gardenerName = service.business_name || `${service.first_name} ${service.last_name}`
            return (
              <article className="marketplace-card visual-market-card" key={service.id} aria-labelledby={`service-title-${service.id}`}>
                <Link className="marketplace-card-media card-media-link" to={`/services/${service.id}`} aria-label={`View ${service.title}`}>
                  {coverUrl ? (
                    <img src={coverUrl} alt={`${service.title} by ${gardenerName}`} loading="lazy" />
                  ) : (
                    <div className="marketplace-card-placeholder" aria-hidden="true" style={{ padding: '10px' }}>
                      <div style={{ width: '92px', height: '92px' }}>
                        <PottedPlantIllustration variant={idx % 2 === 0 ? 'monstera' : 'orange'} />
                      </div>
                      <span>{service.category_name}</span>
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
