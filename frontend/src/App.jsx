import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Leaf,
  MapPin,
  Menu,
  MessageCircle,
  Scissors,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  Trees,
  Wrench,
  X,
} from 'lucide-react'
import './App.css'
import './App.css'
import './ClientGardener.css'
import './styles/botanical.css'
import editorialAbout from './assets/editorial-about.jpg'
import editorialFeature from './assets/editorial-feature.jpg'
import editorialProcess1 from './assets/editorial-process-1.jpg'
import editorialProcess2 from './assets/editorial-process-2.jpg'
import editorialProcess4 from './assets/editorial-process-4.jpg'
import {
  GardenPlanningIllustration,
  GardenerCareIllustration,
  WelcomeBotanicalScene,
} from './components/BotanicalIllustrations'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './hooks/useAuth'
import {
  FLOATING_MESSAGE_ICON_LABEL,
  shouldShowFloatingMessageIcon,
} from './services/profiles'
import { reviewsApi } from './services/reviews'
import { servicesApi } from './services/services'

const LoginPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.LoginPage })))
const RegisterPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.RegisterPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ServicesPage = lazy(() => import('./pages/ServicesPage'))
const ServiceDetailPage = lazy(() => import('./pages/ServiceDetailPage'))
const GardenerPage = lazy(() => import('./pages/GardenerPage'))
const InquiryPage = lazy(() => import('./pages/InquiryPage'))
const CommunicationPage = lazy(() => import('./pages/CommunicationPage'))
const BookingPage = lazy(() => import('./pages/BookingPage'))
const AssistantPage = lazy(() => import('./pages/AssistantPage'))

const categories = [
  {
    title: 'Garden maintenance',
    description: 'Routine care, trimming, weeding, and seasonal upkeep for healthy yards.',
    icon: Leaf,
  },
  {
    title: 'Landscaping',
    description: 'Garden layout, tropical planting, pathways, and full outdoor transformations.',
    icon: Sparkles,
  },
  {
    title: 'Lawn care',
    description: 'Mowing, edging, turf patching, and clean lawn upkeep.',
    icon: Scissors,
  },
  {
    title: 'Tree and plant care',
    description: 'Safe canopy pruning, palm trimming, and ongoing plant health support.',
    icon: Trees,
  },
  {
    title: 'Potted and terrace gardens',
    description: 'Small-space, balcony, and container garden setups built for city homes.',
    icon: Sprout,
  },
  {
    title: 'Garden improvement',
    description: 'Practical upgrades for soil, drainage, borders, and existing outdoor areas.',
    icon: Wrench,
  },
]

const workflowSteps = [
  {
    num: '01',
    title: 'Share your space',
    description: 'Browse approved local services or post an open request with garden photos and AI-assisted scope notes.',
    image: editorialFeature,
    alt: 'Raised wooden garden bed filled with fresh green herbs and leafy plants',
  },
  {
    num: '02',
    title: 'Compare clear offers',
    description: 'Approved Zamboanga City gardeners review site feasibility and send itemized offers.',
    image: editorialProcess2,
    alt: 'Collection of healthy potted indoor and terrace plants in bright natural light',
  },
  {
    num: '03',
    title: 'Agree together',
    description: 'Review and approve the exact scope, agreed price, schedule, and deposit on the same agreement version.',
    image: editorialProcess1,
    alt: 'Garden trowel with fresh potting soil prepared for planting',
  },
  {
    num: '04',
    title: 'Confirm & enjoy',
    description: 'Bookings are created only after mutual approval—with verified payment tracking and post-job reviews.',
    image: editorialProcess4,
    alt: 'Gardener carefully planting young green seedlings into prepared garden beds',
  },
]

const trustHighlights = [
  {
    icon: ShieldCheck,
    title: 'Approved local gardeners',
    description: 'Every public provider profile is reviewed and approved by the administrator before listing services.',
  },
  {
    icon: Check,
    title: 'Mutual agreement first',
    description: 'An inquiry or offer is never an automatic booking—both sides approve the same scope, price, and schedule.',
  },
  {
    icon: Sparkles,
    title: 'AI garden planning & photo help',
    description: 'Organize messy project notes and describe garden photos clearly before sending requests to providers.',
  },
  {
    icon: MessageCircle,
    title: 'Direct local conversations',
    description: 'Discuss site details, compare offers side by side, and keep schedules and payments organized in one workspace.',
  },
]

function Logo({ to = '/' }) {
  return (
    <Link className="brand" to={to} aria-label="HugaTiera home">
      <span className="brand-mark" aria-hidden="true">
        <Leaf size={18} strokeWidth={2.4} />
      </span>
      <span>Huga<span>Tiera</span></span>
    </Link>
  )
}

function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'HT'
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}

function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [featuredServices, setFeaturedServices] = useState([])
  const [recentReviews, setRecentReviews] = useState([])
  const [categoryMap, setCategoryMap] = useState({})
  const { user } = useAuth()

  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    let active = true
    servicesApi.list({ sort: 'newest', limit: 3 })
      .then((result) => {
        if (active) setFeaturedServices(result?.services || [])
      })
      .catch(() => {})
    servicesApi.categories()
      .then((result) => {
        if (!active) return
        const byName = {}
        for (const item of result?.categories || []) {
          byName[String(item.name || '').toLowerCase()] = item.id
        }
        setCategoryMap(byName)
      })
      .catch(() => {})
    reviewsApi.recent(3)
      .then((result) => {
        if (active) setRecentReviews(result?.reviews || [])
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  return (
    <div className="landing-home" id="top">
      <a className="skip-link visually-hidden" href="#main-content">Skip to main content</a>
      <header className="landing-header botanical-landing-header">
        <div className="landing-container landing-nav">
          <Logo to={user ? '/dashboard' : '/'} />
          <button
            className="landing-menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <nav className={`landing-links${menuOpen ? ' is-open' : ''}`} aria-label="Main navigation">
            <a href="#services" onClick={closeMenu}>Services</a>
            <a href="#how-it-works" onClick={closeMenu}>How it works</a>
            <a href="#why-hugatiera" onClick={closeMenu}>Why HugaTiera</a>
            <a href="#reviews" onClick={closeMenu}>Reviews</a>
            <div className="landing-mobile-actions">
              {user ? (
                <Link className="landing-btn landing-btn-amber" to="/dashboard" onClick={closeMenu}>
                  Go to Dashboard <ArrowUpRight size={15} />
                </Link>
              ) : (
                <>
                  <Link className="landing-btn landing-btn-ghost" to="/login" onClick={closeMenu}>Sign in</Link>
                  <Link className="landing-btn landing-btn-amber" to="/register" onClick={closeMenu}>
                    Get started <ArrowUpRight size={15} />
                  </Link>
                </>
              )}
            </div>
          </nav>
          <div className="landing-nav-actions">
            {user ? (
              <Link className="landing-btn landing-btn-amber" to="/dashboard" onClick={closeMenu}>
                Dashboard <ArrowUpRight size={15} />
              </Link>
            ) : (
              <>
                <Link className="landing-nav-signin" to="/login" onClick={closeMenu}>Sign in</Link>
                <Link className="landing-btn landing-btn-amber" to="/register" onClick={closeMenu}>
                  Get started <ArrowUpRight size={15} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="landing-hero botanical-landing-hero">
          <div className="botanical-hero-leaves" aria-hidden="true">
            <Leaf className="botanical-hero-leaf" size={20} />
            <Leaf className="botanical-hero-leaf" size={20} />
            <Sprout className="botanical-hero-leaf" size={26} />
            <Leaf className="botanical-hero-leaf" size={22} />
            <Leaf className="botanical-hero-leaf" size={19} />
            <Sprout className="botanical-hero-leaf" size={22} />
            <Leaf className="botanical-hero-leaf" size={26} />
            <Leaf className="botanical-hero-leaf" size={18} />
            <Leaf className="botanical-hero-leaf" size={23} />
            <Sprout className="botanical-hero-leaf" size={20} />
            <Leaf className="botanical-hero-leaf" size={25} />
            <Leaf className="botanical-hero-leaf" size={21} />
            <Leaf className="botanical-hero-leaf" size={19} />
            <Sprout className="botanical-hero-leaf" size={24} />
            <Leaf className="botanical-hero-leaf" size={22} />
            <Leaf className="botanical-hero-leaf" size={20} />
          </div>
          <div className="landing-container landing-hero-grid" style={{ position: 'relative', zIndex: 1 }}>
            <div className="landing-hero-copy">
              <span className="landing-hero-badge">
                <MapPin size={13} aria-hidden="true" />
                Zamboanga City · Growing Together, One Leaf at a Time
              </span>
              <h1>Book trusted local gardeners, on clear terms.</h1>
              <p className="landing-hero-lead">
                Browse approved gardening providers or post photos of your outdoor space to compare offers, agree on scope and schedule together, and confirm with confidence.
              </p>
              <div className="landing-hero-actions">
                <Link className="landing-btn landing-btn-amber" to="/services">
                  Browse services <ArrowRight size={16} />
                </Link>
                <Link
                  className="landing-btn landing-btn-ghost"
                  to={user ? '/inquiries/new?type=general' : '/register?role=gardener'}
                >
                  {user ? 'Post a general request' : 'Offer gardening services'}
                </Link>
              </div>
              <div className="landing-hero-trust">
                <span><Check size={14} aria-hidden="true" /> Approved Zamboanga providers</span>
                <span><Check size={14} aria-hidden="true" /> Mutual agreement before booking</span>
                <span><Check size={14} aria-hidden="true" /> AI-assisted planning</span>
              </div>
            </div>

            <div className="landing-hero-visual">
              <div
                className="botanical-landing-hero-card landing-spotlight-surface"
                onMouseMove={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`)
                  event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`)
                }}
              >
                <WelcomeBotanicalScene />
                <div className="botanical-feature-tiles" style={{ marginTop: '14px', marginBottom: 0 }}>
                  <Link className="botanical-tile is-sage" to="/services" style={{ padding: '14px 16px' }}>
                    <div className="botanical-tile-copy">
                      <strong style={{ fontSize: '15px' }}>Explore Services</strong>
                      <span style={{ fontSize: '12px' }}>Verified local gardeners</span>
                    </div>
                    <ArrowUpRight size={18} />
                  </Link>
                  <Link className="botanical-tile is-orange" to="/assistant" style={{ padding: '14px 16px' }}>
                    <div className="botanical-tile-copy">
                      <strong style={{ fontSize: '15px' }}>AI Garden Plan</strong>
                      <span style={{ fontSize: '12px' }}>Ask for plant ideas</span>
                    </div>
                    <Sparkles size={18} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" id="services">
          <div className="landing-container">
            <div className="landing-section-head">
              <div>
                <h2>Services for every outdoor space.</h2>
                <p>Choose a category to explore approved gardeners in Zamboanga City, or post an open request for custom work.</p>
              </div>
              <Link className="landing-btn landing-btn-outline" to="/services">
                View all services <ArrowRight size={15} />
              </Link>
            </div>

            <div className="landing-category-grid">
              {categories.map(({ title, description, icon: Icon }) => {
                const matchedId = categoryMap[title.toLowerCase()]
                const targetUrl = matchedId ? `/services?categoryId=${matchedId}` : '/services'
                return (
                  <Link
                    className="landing-category-card landing-spotlight-surface"
                    to={targetUrl}
                    key={title}
                    onMouseMove={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`)
                      event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`)
                    }}
                  >
                    <span className="landing-category-icon" aria-hidden="true">
                      <Icon size={19} />
                    </span>
                    <div className="landing-category-copy">
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </div>
                    <span className="landing-category-arrow" aria-hidden="true">
                      <ArrowUpRight size={16} />
                    </span>
                  </Link>
                )
              })}
            </div>

            {featuredServices.length > 0 && (
              <div className="landing-live-showcase">
                <div className="landing-live-head">
                  <h3>
                    <span className="landing-live-dot" aria-hidden="true" />
                    Recently listed in the marketplace
                  </h3>
                  <Link className="landing-inline-link" to="/services">
                    Explore full catalog <ArrowRight size={14} />
                  </Link>
                </div>
                <div className="landing-live-grid">
                  {featuredServices.map((service) => {
                    const gardenerName = service.business_name || `${service.first_name || ''} ${service.last_name || ''}`.trim()
                    const hasPrice = service.indicative_price !== null && service.indicative_price !== undefined
                    return (
                      <Link className="landing-service-card" to={`/services/${service.id}`} key={service.id}>
                        <div className="landing-service-card-top">
                          <span className="landing-pill">{service.category_name || 'Gardening'}</span>
                          <strong className="landing-price">
                            {hasPrice ? `From ₱${Number(service.indicative_price).toLocaleString()}` : 'Quote available'}
                          </strong>
                        </div>
                        <h4>{service.title}</h4>
                        <p>{service.description}</p>
                        <div className="landing-service-card-meta">
                          <span>{gardenerName || 'Approved gardener'}</span>
                          <span><MapPin size={12} aria-hidden="true" /> {service.service_area || 'Zamboanga City'}</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="landing-section landing-section-alt" id="how-it-works">
          <div className="landing-container">
            <div className="landing-section-head">
              <div>
                <h2>Four clear steps from idea to booked service.</h2>
                <p>Inquiries, offers, mutual agreements, and confirmed bookings stay cleanly separated so both sides always know what happens next.</p>
              </div>
            </div>

            <div className="landing-process-grid">
              {workflowSteps.map((step) => (
                <article className="landing-process-card" key={step.num}>
                  <div className="landing-process-media">
                    <img src={step.image} alt={step.alt} loading="lazy" />
                    <span className="landing-step-num">{step.num}</span>
                  </div>
                  <div className="landing-process-body">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-section-alt" id="real-example">
          <div className="landing-container">
            <div className="landing-section-head">
              <div>
                <p className="eyebrow" style={{ marginBottom: '6px' }}>Real-life Zamboanga City walkthrough</p>
                <h2>See how a real backyard refresh works.</h2>
                <p>Example scenario: A homeowner in Barangay Tetuan wants to turn an overgrown 20 m² front yard into a low-maintenance tropical garden.</p>
              </div>
            </div>
            <div className="botanical-real-example-card">
              <div className="botanical-real-photo-wrap">
                <img
                  src={editorialAbout}
                  alt="Real landscaped home garden pathway with lush tropical plants and trimmed greenery"
                  loading="lazy"
                />
                <span className="botanical-photo-chip botanical-float">
                  <Sparkles size={13} aria-hidden="true" /> Live Care Preview
                </span>
                <svg className="botanical-photo-butterfly botanical-butterfly" viewBox="0 0 36 28" fill="none" aria-hidden="true">
                  <ellipse cx="11" cy="14" rx="8" ry="5" transform="rotate(-22 11 14)" fill="#D8A16F" />
                  <ellipse cx="25" cy="14" rx="8" ry="5" transform="rotate(22 25 14)" fill="#F7F5EC" stroke="#263D2E" strokeWidth="1.5" />
                  <line x1="18" y1="8" x2="18" y2="21" stroke="#263D2E" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <span className="landing-pill" style={{ marginBottom: '10px', display: 'inline-block' }}>Sample Project · Tetuan, Zamboanga City</span>
                <h3 style={{ fontSize: '26px', margin: '0 0 10px', color: 'var(--forest)' }}>Tropical Front Yard &amp; Potted Border</h3>
                <p style={{ color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
                  The client snaps 2 yard photos, asks the AI Assistant for sun-tolerant plants (Snake Plant, Areca Palm, Bougainvillea), and receives itemized offers from nearby approved gardeners before locking in a mutual agreement.
                </p>
                <div className="botanical-info-badges">
                  <div className="botanical-info-badge">
                    <small>Sunlight</small>
                    <strong>Bright / Partial</strong>
                  </div>
                  <div className="botanical-info-badge">
                    <small>Timeline</small>
                    <strong>1-Day Visit</strong>
                  </div>
                  <div className="botanical-info-badge">
                    <small>Typical Budget</small>
                    <strong>₱2,500 – ₱3,500</strong>
                  </div>
                </div>
                <div className="landing-hero-actions" style={{ marginTop: '14px' }}>
                  <Link className="landing-btn landing-btn-amber" to={user ? '/inquiries/new?type=general' : '/services'}>
                    Try this for your yard <ArrowRight size={15} />
                  </Link>
                  <Link className="landing-btn landing-btn-ghost" to="/assistant">
                    Ask AI Garden Plan
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" id="why-hugatiera">
          <div className="landing-container landing-why-grid">
            <div className="landing-why-copy">
              <h2>Built for real local gardening work.</h2>
              <p className="landing-why-lead">
                HugaTiera keeps homeowner expectations and gardener schedules aligned from the very first inquiry—no guesswork, no surprise commitments.
              </p>
              <div className="landing-benefit-grid">
                {trustHighlights.map(({ icon: Icon, title, description }) => (
                  <div className="landing-benefit-card" key={title}>
                    <span className="landing-category-icon" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="landing-why-visual botanical-landing-hero-card" style={{ display: 'grid', placeItems: 'center', background: 'var(--sage-soft)', padding: '32px' }}>
              <GardenerCareIllustration />
            </div>
          </div>
        </section>

        <section className="landing-section landing-reviews-section" id="reviews">
          <div className="landing-container">
            <div className="landing-section-head landing-section-head-light">
              <div>
                <h2>{recentReviews.length > 0 ? 'Verified reviews from local projects.' : 'Transparent, verified project reviews.'}</h2>
                <p>
                  {recentReviews.length > 0
                    ? 'Every rating comes from a completed, paid, and mutually closed booking on HugaTiera.'
                    : 'Ratings can only be submitted after a service is completed, fully paid, and closed by both client and gardener.'}
                </p>
              </div>
              <Link className="landing-btn landing-btn-ghost" to="/services">
                Explore providers <ArrowRight size={15} />
              </Link>
            </div>

            {recentReviews.length > 0 ? (
              <div className="landing-reviews-grid">
                {recentReviews.map((review) => (
                  <article className="landing-review-card" key={review.id}>
                    <div className="landing-review-stars" aria-label={`${review.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }, (_, idx) => (
                        <Star
                          key={idx}
                          size={15}
                          fill={idx < Number(review.rating) ? 'currentColor' : 'none'}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                    <blockquote>
                      &ldquo;{review.review_text || 'Great gardening work and smooth coordination.'}&rdquo;
                    </blockquote>
                    <div className="landing-review-author">
                      <span className="landing-review-avatar" aria-hidden="true">
                        {getInitials(review.client_name)}
                      </span>
                      <div>
                        <strong>{review.client_name}</strong>
                        <small>
                          for {review.gardener_name}{review.service_title ? ` · ${review.service_title}` : ''}
                        </small>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="landing-reviews-grid">
                <article className="landing-review-card">
                  <h3>Area-level privacy</h3>
                  <p>Open requests share only your barangay area until you choose a gardener and finalize an agreement.</p>
                </article>
                <article className="landing-review-card">
                  <h3>Versioned agreements</h3>
                  <p>Any change to price, scope, or schedule creates a new version that both sides must re-approve.</p>
                </article>
                <article className="landing-review-card">
                  <h3>Verified closing</h3>
                  <p>Reviews unlock only after work completion, payment verification, and mutual transaction closure.</p>
                </article>
              </div>
            )}
          </div>
        </section>

        <section className="landing-section landing-cta-wrap">
          <div className="landing-container">
            <div className="landing-cta-card">
              <div className="landing-cta-copy">
                <h2>Ready to get your garden sorted?</h2>
                <p>
                  Create a free account to message local gardeners, post photos for itemized offers, or list your gardening services in Zamboanga City.
                </p>
                <div className="landing-hero-actions">
                  <Link className="landing-btn landing-btn-amber" to={user ? '/dashboard' : '/register'}>
                    {user ? 'Open your workspace' : 'Create free account'} <ArrowRight size={16} />
                  </Link>
                  <Link className="landing-btn landing-btn-ghost" to="/services">
                    Browse marketplace
                  </Link>
                </div>
              </div>
              <div className="landing-cta-media" style={{ display: 'grid', placeItems: 'center', background: 'var(--sage-soft)', borderRadius: '24px', padding: '24px' }}>
                <GardenPlanningIllustration />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-grid">
          <div>
            <Logo to={user ? '/dashboard' : '/'} />
            <p className="landing-footer-desc">
              Connecting homeowners and local gardening professionals across Zamboanga City with clear agreements and verified work.
            </p>
          </div>
          <div className="landing-footer-col">
            <span>Marketplace</span>
            <Link to="/services">Browse services</Link>
            <a href="#services">Categories</a>
            <a href="#how-it-works">How it works</a>
          </div>
          <div className="landing-footer-col">
            <span>Account</span>
            <Link to="/login">Sign in</Link>
            <Link to="/register">Join as a client</Link>
            <Link to="/register?role=gardener">Join as a gardener</Link>
          </div>
        </div>
        <div className="landing-container landing-footer-bottom">
          <span>© 2026 HugaTiera · Zamboanga City</span>
          <span>Local gardening services marketplace <Leaf size={13} aria-hidden="true" /></span>
        </div>
      </footer>

      {shouldShowFloatingMessageIcon(user) && (
        <Link
          className="floating-help"
          to="/messages"
          aria-label={FLOATING_MESSAGE_ICON_LABEL}
          title={FLOATING_MESSAGE_ICON_LABEL}
        >
          <MessageCircle size={20} />
        </Link>
      )}
    </div>
  )
}

function RouteTitleUpdater() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(search)
    const tab = params.get('tab')
    let pageTitle = 'HugaTiera — Local Gardening Services in Zamboanga City'

    if (pathname === '/services') pageTitle = 'Marketplace | HugaTiera'
    else if (pathname.startsWith('/services/')) pageTitle = 'Service Details | HugaTiera'
    else if (pathname.startsWith('/gardeners/')) pageTitle = 'Gardener Profile | HugaTiera'
    else if (pathname === '/login') pageTitle = 'Sign In | HugaTiera'
    else if (pathname === '/register') pageTitle = 'Create Account | HugaTiera'
    else if (pathname === '/profile') pageTitle = 'Profile & Settings | HugaTiera'
    else if (pathname === '/dashboard') {
      const tabLabel = tab ? `${tab.charAt(0).toUpperCase()}${tab.slice(1)}` : 'Dashboard'
      pageTitle = `${tabLabel} | HugaTiera`
    } else if (pathname === '/inquiries/new') pageTitle = 'New Service Request | HugaTiera'
    else if (pathname.startsWith('/inquiries/')) pageTitle = 'Inquiry Details | HugaTiera'
    else if (pathname === '/inquiries') pageTitle = 'Inquiries & Requests | HugaTiera'
    else if (pathname === '/bookings/new') pageTitle = 'Propose Agreement | HugaTiera'
    else if (pathname.startsWith('/bookings/')) pageTitle = 'Booking Details | HugaTiera'
    else if (pathname === '/bookings') pageTitle = 'Reservations & Bookings | HugaTiera'
    else if (pathname === '/messages') pageTitle = 'Messages | HugaTiera'
    else if (pathname === '/notifications') pageTitle = 'Notifications | HugaTiera'
    else if (pathname === '/assistant') pageTitle = 'AI Garden Assistant | HugaTiera'

    document.title = pageTitle
  }, [pathname, search])

  return null
}

function PublicRedirect() {
  const { user } = useAuth()
  return <Navigate to={user ? '/dashboard' : '/'} replace />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RouteTitleUpdater />
        <ErrorBoundary>
          <Suspense fallback={<div className="route-loading" role="status" aria-live="polite">Loading page...</div>}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/services/:serviceId" element={<ServiceDetailPage />} />
              <Route path="/gardeners/:gardenerId" element={<GardenerPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/assistant" element={<AssistantPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/inquiries/:inquiryId" element={<InquiryPage detail />} />
                <Route element={<ProtectedRoute roles={['client', 'gardener', 'clerk', 'administrator']} />}>
                  <Route path="/notifications" element={<CommunicationPage mode="notifications" />} />
                </Route>
                <Route element={<ProtectedRoute roles={['client', 'gardener']} />}>
                  <Route path="/profile" element={<DashboardPage profileView />} />
                  <Route path="/inquiries" element={<InquiryPage />} />
                  <Route path="/inquiries/new" element={<InquiryPage create />} />
                  <Route path="/messages" element={<CommunicationPage mode="messages" />} />
                  <Route path="/bookings" element={<BookingPage />} />
                  <Route path="/bookings/new" element={<BookingPage create />} />
                  <Route path="/bookings/:bookingId" element={<BookingPage detail />} />
                </Route>
              </Route>
              <Route path="*" element={<PublicRedirect />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
