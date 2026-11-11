import { useEffect, useState } from 'react'
import { ArrowRight, Leaf, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { servicesApi } from '../services/services'

function PageHeader() {
  const { user } = useAuth()
  return (
    <header className="dashboard-header container">
      <Link className="brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link>
      <Link className="button button-outline" to={user ? '/dashboard' : '/login'}>{user ? 'Dashboard' : 'Sign in'}</Link>
    </header>
  )
}

export default function ServicesPage() {
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

  useEffect(() => { servicesApi.categories().then((result) => setCategories(result.categories)).catch((loadError) => setError(loadError.message)) }, [])
  useEffect(() => {
    servicesApi.list({ ...filters, page: pagination.page }).then((result) => {
      setServices(result.services); setPagination(result.pagination)
    }).catch((loadError) => setError(loadError.message)).finally(() => setLoading(false))
  }, [filters, pagination.page])

  function changeFilter(field) {
    return (event) => {
      setLoading(true)
      setPagination((current) => ({ ...current, page: 1 }))
      setFilters((current) => ({ ...current, [field]: event.target.value }))
    }
  }

  return <main className="marketplace-page"><PageHeader /><section className="container marketplace-content"><p className="eyebrow">Explore local help</p><h1>Gardening services for your space.</h1><p className="marketplace-lead">Search active services from approved gardeners in Zamboanga City. Start with an inquiry when you find a good fit.</p><form className="marketplace-filters" onSubmit={(event) => event.preventDefault()}><label className="search-field"><Search size={17} /><input placeholder="Search services, gardeners, or keywords" value={filters.keyword} onChange={changeFilter('keyword')} /></label><select aria-label="Filter by category" value={filters.categoryId} onChange={changeFilter('categoryId')}><option value="">All categories</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select><input aria-label="Filter by service area" placeholder="Service area" value={filters.serviceArea} onChange={changeFilter('serviceArea')} /><select aria-label="Sort services" value={filters.sort} onChange={changeFilter('sort')}><option value="newest">Newest first</option><option value="price_low">Lowest price</option><option value="price_high">Highest price</option></select></form>{error && <div className="form-error" role="alert">{error}</div>}{loading && <p className="result-count">Loading services...</p>}{!loading && !error && services.length === 0 && <div className="empty-state">No approved services match your search yet. Try another keyword or category, or check back after more gardeners are approved.</div>}{!loading && <p className="result-count">{pagination.total} service{pagination.total === 1 ? '' : 's'} available</p>}<div className="marketplace-grid">{services.map((service) => <article className="marketplace-card" key={service.id}><div className="category-pill">{service.category_name}</div><h2>{service.title}</h2><p>{service.description}</p><div className="service-meta"><Link to={`/gardeners/${service.gardener_id}`}>{service.business_name || `${service.first_name} ${service.last_name}`}</Link><span>{service.indicative_price ? `From ₱${service.indicative_price}` : 'Quotation available'}</span></div><Link to={`/services/${service.id}`}>View service <ArrowRight size={15} /></Link></article>)}</div>{pagination.pages > 1 && <div className="pagination"><button type="button" disabled={pagination.page <= 1} onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}>Previous</button><span>Page {pagination.page} of {pagination.pages}</span><button type="button" disabled={pagination.page >= pagination.pages} onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}>Next</button></div>}</section></main>
}
