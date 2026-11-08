import { useEffect, useState } from 'react'
import { ArrowLeft, Leaf } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { servicesApi } from '../services/services'

export default function GardenerPage() {
  const { gardenerId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { servicesApi.gardener(gardenerId).then(setData).catch((loadError) => setError(loadError.message)) }, [gardenerId])
  return <main className="marketplace-page"><header className="dashboard-header container"><Link className="brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link><Link className="button button-outline" to="/services">Browse services</Link></header><section className="container detail-content">{error && <div className="form-error">{error}</div>}{!data && !error && <p>Loading gardener profile...</p>}{data && <><Link className="back-link" to="/services"><ArrowLeft size={15} /> Back to services</Link><div className="gardener-profile-hero"><p className="eyebrow">Gardener profile</p><h1>{data.gardener.business_name || `${data.gardener.first_name} ${data.gardener.last_name}`}</h1><p>{data.gardener.description || 'A local gardening service provider on HugaTiera.'}</p><span>{data.gardener.service_area} {data.gardener.years_of_experience ? `· ${data.gardener.years_of_experience} years experience` : ''}</span></div><h2 className="profile-section-title">Services offered</h2><div className="marketplace-grid">{data.services.map((service) => <article className="marketplace-card" key={service.id}><h2>{service.title}</h2><p>{service.description}</p><Link to={`/services/${service.id}`}>View service <ArrowLeft size={15} /></Link></article>)}</div><h2 className="profile-section-title">Client reviews</h2><div className="review-list">{data.reviews?.length ? data.reviews.map((review) => <article className="review-card" key={review.id}><div className="review-heading"><strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong><span>{review.client_name}</span></div><p>{review.review_text || 'No written feedback provided.'}</p><small>{new Date(review.created_at).toLocaleDateString()}</small></article>) : <p className="form-note">No reviews yet.</p>}</div></>}</section></main>
}
