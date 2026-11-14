import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import {
  ArrowRight,
  Layers,
  Leaf,
  MapPin,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Sprout,
  X,
} from 'lucide-react'
import './App.css'
import './design-system.css'
import editorialAbout from './assets/editorial-about.jpg'
import editorialProcess1 from './assets/editorial-process-1.jpg'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './hooks/useAuth'
import { LoginPage, RegisterPage } from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import ServicesPage from './pages/ServicesPage'
import ServiceDetailPage from './pages/ServiceDetailPage'
import GardenerPage from './pages/GardenerPage'
import InquiryPage from './pages/InquiryPage'
import CommunicationPage from './pages/CommunicationPage'
import BookingPage from './pages/BookingPage'
import AssistantPage from './pages/AssistantPage'
import {
  FLOATING_MESSAGE_ICON_LABEL,
  shouldShowFloatingMessageIcon,
} from './services/profiles'
import { servicesApi } from './services/services'

const categories = [
  {
    title: 'Garden maintenance',
    description: 'Keep outdoor spaces healthy, tidy, and ready to enjoy.',
    link: 'Browse maintenance',
    icon: Sprout,
  },
  {
    title: 'Landscaping',
    description: 'Find help shaping a garden that fits your home and lifestyle.',
    link: 'Browse landscaping',
    icon: Layers,
  },
  {
    title: 'Garden improvement',
    description: 'Discuss practical ideas for making your space feel better.',
    link: 'Browse improvements',
    icon: ShieldCheck,
  },
  {
    title: 'Potted and terrace gardens',
    description: 'Make small outdoor spaces feel lush, useful, and personal.',
    link: 'Browse small spaces',
    icon: Leaf,
  },
]

const steps = [
  ['Discover', 'Browse local services and explore provider portfolios.'],
  ['Ask and compare', 'Send an inquiry, discuss your needs, and review a quotation.'],
  ['Agree together', 'Shape the scope, schedule, and price with your chosen provider.'],
  ['Book with confidence', 'Confirm the service only when both sides approve.'],
]

const benefits = [
  {
    title: 'Local knowledge',
    description: 'Connect with people who understand the rhythm of gardens in our community.',
    icon: MapPin,
  },
  {
    title: 'Clear by design',
    description: 'Inquiries, offers, agreements, and bookings stay separate and easy to follow.',
    icon: ShieldCheck,
  },
  {
    title: 'Ideas that grow',
    description: 'Use the Garden Planning Assistant to explore possibilities before you begin.',
    icon: Sparkles,
  },
  {
    title: 'Human conversation',
    description: 'Ask questions, compare options, and choose with confidence.',
    icon: MessageCircle,
  },
]

function Logo() {
  return (
    <a className="landing-brand" href="#top" aria-label="HugaTiera home">
      <span className="landing-brand-mark" aria-hidden="true">
        <Leaf size={21} strokeWidth={2.5} />
      </span>
      <span className="landing-wordmark">Huga<span>Tiera</span></span>
    </a>
  )
}

function Button({ children, variant = 'primary', href = '/services', onClick, className = '' }) {
  return (
    <Link className={`button button-${variant} landing-button landing-button-${variant} ${className}`.trim()} to={href} onClick={onClick}>
      {children}
    </Link>
  )
}

function Container({ children, className = '' }) {
  return <div className={`landing-container ${className}`.trim()}>{children}</div>
}

function Section({ children, className = '', id, labelledBy }) {
  return (
    <section className={`landing-section ${className}`.trim()} id={id} aria-labelledby={labelledBy}>
      {children}
    </section>
  )
}

function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [featuredServices, setFeaturedServices] = useState([])
  const [categoryMap, setCategoryMap] = useState({})
  const [featuredError, setFeaturedError] = useState('')
  const { user } = useAuth()
  const menuButtonRef = useRef(null)

  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    servicesApi.list({ sort: 'newest', limit: 3 })
      .then((result) => setFeaturedServices(result.services))
      .catch((error) => setFeaturedError(error.message))
    servicesApi.categories()
      .then((result) => {
        const byName = {}
        for (const item of result.categories || []) {
          byName[item.name.toLowerCase()] = item.id
        }
        setCategoryMap(byName)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  return (
    <div className="landing-page" id="top">
      <main className="landing-main">
        <Section className="landing-hero" labelledBy="landing-hero-title">
          <header className="landing-header">
            <Container className="landing-nav">
              <Logo />
              <button
                ref={menuButtonRef}
                className="landing-menu-button"
                type="button"
                aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
                aria-expanded={menuOpen}
                aria-controls="landing-navigation"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
              </button>
              <nav
                id="landing-navigation"
                className={`landing-nav-links${menuOpen ? ' is-open' : ''}`}
                aria-label="Main navigation"
              >
                <a href="#services" onClick={closeMenu}>Services</a>
                <a href="#how-it-works" onClick={closeMenu}>How it works</a>
                <Link to="/assistant" onClick={closeMenu}>Garden assistant</Link>
                {user ? (
                  <Link className="landing-mobile-dashboard-link" to="/dashboard" onClick={closeMenu}>Dashboard</Link>
                ) : (
                  <>
                    <Link className="landing-login-link" to="/login" onClick={closeMenu}>Log in</Link>
                    <Button href="/register" onClick={closeMenu}>Get started <ArrowRight size={16} aria-hidden="true" /></Button>
                  </>
                )}
              </nav>
              {user && (
                <Button className="landing-desktop-dashboard" href="/dashboard">Dashboard <ArrowRight size={16} aria-hidden="true" /></Button>
              )}
            </Container>
          </header>

          <Container className="landing-hero-body">
            <div className="landing-hero-copy">
              <h1 className="landing-hero-title" id="landing-hero-title">
                <span>Let your garden</span>
                <span>come alive.</span>
              </h1>
              <p className="landing-hero-lead">
                Find local gardeners in Zamboanga City, send an inquiry, and agree on the work together.
              </p>
              <div className="landing-hero-actions">
                <Button href="/services">Find your gardener <ArrowRight size={18} aria-hidden="true" /></Button>
                <a className="landing-button landing-button-secondary" href="#how-it-works">
                  See how it works <ArrowRight size={18} aria-hidden="true" />
                </a>
              </div>
              <p className="landing-local-note">
                <MapPin size={18} aria-hidden="true" />
                <span>Made for Zamboanga City. Local people, real garden conversations.</span>
              </p>
            </div>
            <img
              className="landing-hero-image"
              src={editorialProcess1}
              alt="A trowel in potting soil beside garden tools"
              width="600"
              height="400"
              loading="eager"
              fetchPriority="high"
            />
          </Container>
        </Section>

        <Section className="landing-services" id="services" labelledBy="landing-services-title">
          <Container>
            <div className="landing-section-heading">
              <h2 id="landing-services-title">Services for the way you live outside.</h2>
              <p>Whether you need a gentle refresh or a complete transformation, start with the kind of help your garden is asking for.</p>
            </div>
            <div className="landing-service-grid">
              {categories.map(({ title, description, link, icon: Icon }) => {
                const matchedId = categoryMap[title.toLowerCase()]
                const targetUrl = matchedId ? `/services?categoryId=${matchedId}` : '/services'
                return (
                  <Link className="landing-service-card" to={targetUrl} key={title}>
                    <Icon className="landing-service-icon" size={32} aria-hidden="true" />
                    <h3>{title}</h3>
                    <p>{description}</p>
                    <span className="landing-service-link">{link} <ArrowRight size={17} aria-hidden="true" /></span>
                  </Link>
                )
              })}
            </div>
            {featuredError && <p className="landing-featured-error" role="alert">{featuredError}</p>}
            {!featuredError && featuredServices.length > 0 && (
              <div className="landing-live-row" role="region" aria-label="Recently added services">
                <span>Recently added in the marketplace</span>
                {featuredServices.slice(0, 2).map((service) => (
                  <Link to={`/services/${service.id}`} key={service.id}>{service.title} <ArrowRight size={14} aria-hidden="true" /></Link>
                ))}
              </div>
            )}
          </Container>
        </Section>

        <Section className="landing-process" id="how-it-works" labelledBy="landing-process-title">
          <Container>
            <div className="landing-section-heading">
              <h2 id="landing-process-title">From first thought to flourishing.</h2>
              <p>Take your time. HugaTiera gives every garden conversation room to become something real.</p>
            </div>
            <ol className="landing-step-list">
              {steps.map(([title, description], index) => (
                <li className="landing-step" key={title}>
                  <div className="landing-step-indicator">
                    <span className="landing-step-number">{index + 1}</span>
                    {index < steps.length - 1 && <span className="landing-step-connector" aria-hidden="true" />}
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </li>
              ))}
            </ol>
          </Container>
        </Section>

        <Section className="landing-why" id="about" labelledBy="landing-why-title">
          <Container className="landing-why-layout">
            <img
              className="landing-why-image"
              src={editorialAbout}
              alt="Camellia-lined garden path leading to a gazebo"
              width="1000"
              height="600"
              loading="lazy"
            />
            <div className="landing-why-copy">
              <h2 id="landing-why-title">Good gardens begin with good questions.</h2>
              <p className="landing-why-lead">
                HugaTiera brings clients and gardeners together in a space built around conversation. Browse real services, explore previous work, and take the time to find the right fit for your home.
              </p>
              <div className="landing-benefits">
                {benefits.map(({ title, description, icon: Icon }) => (
                  <article className="landing-benefit" key={title}>
                    <Icon size={26} aria-hidden="true" />
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </article>
                ))}
              </div>
            </div>
          </Container>
        </Section>

        {/* Add real testimonials here when verified customer quotes are available. */}

        <Section className="landing-cta" labelledBy="landing-cta-title">
          <Container>
            <h2 id="landing-cta-title">Take the first small step.</h2>
            <p>Find a gardener, share your idea, and take the first small step toward a space you will love coming home to.</p>
            <div className="landing-cta-actions">
              <Button href="/services">Explore local services <ArrowRight size={18} aria-hidden="true" /></Button>
              <Link to="/register?role=gardener">Are you a gardener? Join HugaTiera</Link>
            </div>
          </Container>
        </Section>
      </main>

      <footer className="landing-footer">
        <Container className="landing-footer-content">
          <div className="landing-footer-brand">
            <Logo />
            <span>· Zamboanga City</span>
          </div>
          <nav aria-label="Footer navigation">
            <Link to="/services">Services</Link>
            <a href="#how-it-works">How it works</a>
            <a href="#about">Our approach</a>
            <Link to="/login">Log in</Link>
            <Link to="/register">Create an account</Link>
            <a href="mailto:hello@hugatiera.local">Contact</a>
          </nav>
        </Container>
      </footer>
      {shouldShowFloatingMessageIcon(user) && (
        <Link
          className="floating-help landing-floating-help"
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

function PublicRedirect() {
  const { user } = useAuth()
  return <Navigate to={user ? '/dashboard' : '/'} replace />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
            <Route element={<ProtectedRoute roles={['client', 'gardener']} />}>
              <Route path="/profile" element={<DashboardPage profileView />} />
              <Route path="/inquiries" element={<InquiryPage />} />
              <Route path="/inquiries/new" element={<InquiryPage create />} />
              <Route path="/messages" element={<CommunicationPage />} />
              <Route path="/bookings" element={<BookingPage />} />
              <Route path="/bookings/new" element={<BookingPage create />} />
              <Route path="/bookings/:bookingId" element={<BookingPage detail />} />
            </Route>
          </Route>
          <Route path="*" element={<PublicRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
