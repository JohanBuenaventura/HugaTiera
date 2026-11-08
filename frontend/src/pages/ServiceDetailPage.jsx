import { useEffect, useState } from 'react'
import { ArrowLeft, Leaf } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { servicesApi } from '../services/services'

export default function ServiceDetailPage() {
  const { serviceId } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { servicesApi.detail(serviceId).then(setData).catch((loadError) => setError(loadError.message)) }, [serviceId])
  if (error) return <main className="marketplace-page"><PageHeader /><section className="container detail-content"><div className="form-error">{error}</div></section></main>
  if (!data) return <main className="marketplace-page"><PageHeader /><section className="container detail-content"><p>Loading service...</p></section></main>
  const { service, portfolios } = data
  return <main className="marketplace-page"><PageHeader /><section className="container detail-content"><Link className="back-link" to="/services"><ArrowLeft size={15} /> Back to services</Link><div className="detail-grid"><article className="detail-main"><div className="category-pill">{service.category_name}</div><h1>{service.title}</h1><p className="detail-description">{service.description}</p><div className="detail-facts"><span><strong>Service area</strong>{service.service_area}</span><span><strong>Indicative price</strong>{service.indicative_price ? `₱${service.indicative_price} ${service.price_unit || ''}` : 'Discuss with gardener'}</span></div>{user?.role === 'client' ? <div className="detail-actions"><Link className="button" to={`/inquiries/new?serviceId=${service.id}`}>Ask about this service</Link>{service.indicative_price !== null && <Link className="button button-outline" to={`/bookings/new?serviceId=${service.id}`}>Request direct booking</Link>}</div> : <Link className="button" to="/login">Sign in to continue</Link>}{service.indicative_price !== null && <p className="booking-note">Know what you need? Request a booking directly. The gardener must accept it before it is confirmed.</p>}</article><aside className="gardener-summary"><p className="eyebrow">Service provider</p><h2>{service.business_name || `${service.first_name} ${service.last_name}`}</h2><p>{service.gardener_description || 'A local gardening service provider on HugaTiera.'}</p><Link className="text-link" to={`/gardeners/${service.gardener_id}`}>View gardener profile <ArrowLeft size={15} /></Link></aside></div>{portfolios.length > 0 && <section className="detail-portfolio"><p className="eyebrow">Previous work</p><h2>Portfolio</h2><div className="portfolio-gallery">{portfolios.map((portfolio) => <figure key={portfolio.id}><img src={servicesApi.imageUrl(portfolio.id)} alt={portfolio.title} /><figcaption>{portfolio.title}</figcaption></figure>)}</div></section>}</section></main>
}

function PageHeader() {
  return <header className="dashboard-header container"><Link className="brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link><Link className="button button-outline" to="/login">Sign in</Link></header>
}
