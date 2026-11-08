import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Leaf,
  Menu,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import './App.css'
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
import { servicesApi } from './services/services'

const categories = [
  {
    title: 'Garden maintenance',
    description: 'Keep outdoor spaces healthy, tidy, and ready to enjoy.',
    icon: Leaf,
  },
  {
    title: 'Landscaping',
    description: 'Find help shaping a garden that fits your home and lifestyle.',
    icon: Sparkles,
  },
  {
    title: 'Garden improvement',
    description: 'Discuss practical ideas for making your space feel better.',
    icon: ShieldCheck,
  },
]

const steps = [
  ['Discover', 'Browse local services and explore provider portfolios.'],
  ['Ask and compare', 'Send an inquiry, discuss your needs, and review a quotation.'],
  ['Book with confidence', 'Request a booking only when you are ready to proceed.'],
]

function Logo() {
  return (
    <a className="brand" href="#top" aria-label="HugaTiera home">
      <span className="brand-mark" aria-hidden="true">
        <Leaf size={19} strokeWidth={2.5} />
      </span>
      <span>Huga<span>Tiera</span></span>
    </a>
  )
}

function Button({ children, variant = 'primary', href = '/services', onClick }) {
  return (
    <Link className={`button button-${variant}`} to={href} onClick={onClick}>
      {children}
    </Link>
  )
}

function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [featuredServices, setFeaturedServices] = useState([])
  const [featuredError, setFeaturedError] = useState('')
  const { user } = useAuth()

  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    servicesApi.list({ sort: 'newest', limit: 3 })
      .then((result) => setFeaturedServices(result.services))
      .catch((error) => setFeaturedError(error.message))
  }, [])

  return (
    <div className="site-shell" id="top">
      <header className="site-header">
        <div className="container nav-container">
          <Logo />
          <button
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">
            <Link to="/services" onClick={closeMenu}>Explore services</Link>
            <a href="#how-it-works" onClick={closeMenu}>How it works</a>
            <Link to="/assistant" onClick={closeMenu}>Garden assistant</Link>
            <Button variant="outline" href="/login" onClick={closeMenu}>Sign in</Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="eyebrow"><span className="eyebrow-dot" /> Gardening made more personal</p>
              <h1>Grow a better outdoor space with the right help.</h1>
              <p className="hero-text">
                Discover trusted gardening services in Zamboanga City, ask questions,
                and find a provider who understands your space.
              </p>
              <div className="hero-actions">
                <Button>Explore local services <ArrowRight size={17} /></Button>
                <a className="text-link" href="#how-it-works">See how it works <ArrowRight size={16} /></a>
              </div>
              <div className="hero-proof">
                <div className="avatar-stack" aria-hidden="true">
                  <span>JM</span><span>RA</span><span>CL</span>
                </div>
                <p><strong>Built for local gardens</strong><br />A simple way to start the conversation.</p>
              </div>
            </div>
            <div className="hero-art" aria-label="Illustration of a garden">
              <div className="sun" />
              <div className="hill hill-back" />
              <div className="hill hill-front" />
              <div className="plant plant-one"><span /><i /><i /><i /></div>
              <div className="plant plant-two"><span /><i /><i /></div>
              <div className="plant plant-three"><span /><i /><i /><i /></div>
              <div className="hero-card">
                <span className="card-icon"><Check size={15} /></span>
                <div><strong>Start with an inquiry</strong><small>No commitment required</small></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section services-section" id="services">
          <div className="container">
            <div className="section-heading">
              <div><p className="eyebrow">Find the right fit</p><h2>Ideas and services for every kind of garden.</h2></div>
              <Link className="text-link" to="/services">View all services <ArrowRight size={16} /></Link>
            </div>
            <div className="category-grid">
              {categories.map(({ title, description, icon: Icon }) => (
                <article className="category-card" key={title}>
                  <div className="category-icon"><Icon size={22} /></div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <Link to="/services" aria-label={`Explore ${title}`}>Explore <ArrowRight size={15} /></Link>
                </article>
              ))}
            </div>
            <div className="featured-heading"><div><p className="eyebrow">Live marketplace</p><h3>Recently added approved services.</h3></div><Link className="text-link" to="/services">Browse all <ArrowRight size={16} /></Link></div>
            {featuredError && <div className="form-error" role="alert">{featuredError}</div>}
            {!featuredError && featuredServices.length === 0 && <p className="form-note">Approved services will appear here as gardeners join HugaTiera.</p>}
            <div className="featured-services">{featuredServices.map((service) => <Link className="featured-service" to={`/services/${service.id}`} key={service.id}><span className="category-pill">{service.category_name}</span><strong>{service.title}</strong><small>{service.business_name || `${service.first_name} ${service.last_name}`} · {service.service_area}</small></Link>)}</div>
          </div>
        </section>

        <section className="section process-section" id="how-it-works">
          <div className="container">
            <div className="process-intro">
              <p className="eyebrow">A thoughtful process</p>
              <h2>From first idea to a garden you can enjoy.</h2>
              <p>Take your time. HugaTiera keeps inquiries, quotations, and bookings clear and separate.</p>
            </div>
            <div className="steps-grid">
              {steps.map(([title, description], index) => (
                <div className="step" key={title}>
                  <span className="step-number">0{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="assistant-section" id="assistant">
          <div className="container assistant-card">
            <div className="assistant-icon"><Sparkles size={25} /></div>
            <div><p className="eyebrow">Garden Planning Assistant</p><h2>Have a garden idea? Start with a conversation.</h2><p>Explore text-based concepts before speaking with a professional.</p></div>
            <Button variant="light" href="/assistant">Try the assistant <ArrowRight size={17} /></Button>
          </div>
        </section>

        <section className="section join-section" id="join">
          <div className="container join-card">
            <div><p className="eyebrow">Ready when you are</p><h2>Good gardens start with good questions.</h2><p>Create an account to discover services, or join as a gardener and share your work.</p></div>
            <div className="join-actions"><Button href="/services">I need a gardener</Button><Button variant="outline" href="/register">I offer services</Button></div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-content">
          <Logo />
          <p>Connecting people with better gardens in Zamboanga City.</p>
          <div className="footer-links"><Link to="/services">Services</Link><a href="#how-it-works">How it works</a><Link to="/assistant">Garden assistant</Link></div>
          <p className="copyright">© 2026 HugaTiera</p>
        </div>
      </footer>
      <Link className="floating-help" to={user ? '/messages' : '/login'} aria-label={user ? 'Open messages' : 'Sign in to contact HugaTiera'} title={user ? 'Open messages' : 'Sign in to contact HugaTiera'}><MessageCircle size={20} /></Link>
      <span className="search-decoration" aria-hidden="true"><Search size={16} /></span>
    </div>
  )
}

function PublicRedirect() {
  const { user } = useAuth()
  return <Navigate to={user ? '/dashboard' : '/'} replace />
}

function App() {
  return <BrowserRouter><AuthProvider><Routes><Route path="/" element={<HomePage />} /><Route path="/services" element={<ServicesPage />} /><Route path="/services/:serviceId" element={<ServiceDetailPage />} /><Route path="/gardeners/:gardenerId" element={<GardenerPage />} /><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /><Route element={<ProtectedRoute />}><Route path="/assistant" element={<AssistantPage />} /><Route path="/dashboard" element={<DashboardPage />} /><Route path="/inquiries" element={<InquiryPage />} /><Route path="/inquiries/new" element={<InquiryPage create />} /><Route path="/inquiries/:inquiryId" element={<InquiryPage detail />} /><Route path="/messages" element={<CommunicationPage />} /><Route path="/bookings" element={<BookingPage />} /><Route path="/bookings/new" element={<BookingPage create />} /><Route path="/bookings/:bookingId" element={<BookingPage detail />} /></Route><Route path="*" element={<PublicRedirect />} /></Routes></AuthProvider></BrowserRouter>
}

export default App
