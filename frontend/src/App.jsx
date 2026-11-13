import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Leaf,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  X,
} from 'lucide-react'
import './App.css'
import './design-system.css'
import editorialAbout from './assets/editorial-about.jpg'
import editorialCta from './assets/editorial-cta.jpg'
import editorialFeature from './assets/editorial-feature.jpg'
import editorialProcess1 from './assets/editorial-process-1.jpg'
import editorialProcess2 from './assets/editorial-process-2.jpg'
import editorialProcess3 from './assets/editorial-process-3.jpg'
import editorialProcess4 from './assets/editorial-process-4.jpg'
import editorialWhy from './assets/editorial-why.jpg'
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
    icon: Leaf,
    tone: 'olive',
  },
  {
    title: 'Landscaping',
    description: 'Find help shaping a garden that fits your home and lifestyle.',
    icon: Sparkles,
    tone: 'orange',
  },
  {
    title: 'Garden improvement',
    description: 'Discuss practical ideas for making your space feel better.',
    icon: ShieldCheck,
    tone: 'sage',
  },
  {
    title: 'Potted and terrace gardens',
    description: 'Make small outdoor spaces feel lush, useful, and personal.',
    icon: Sprout,
    tone: 'forest',
  },
]

const steps = [
  ['01', 'Discover', 'Browse local services and explore provider portfolios.'],
  ['02', 'Ask and compare', 'Send an inquiry, discuss your needs, and review a quotation.'],
  ['03', 'Agree together', 'Shape the scope, schedule, and price with your chosen provider.'],
  ['04', 'Book with confidence', 'Confirm the service only when both sides approve.'],
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
  const [categoryMap, setCategoryMap] = useState({})
  const [featuredError, setFeaturedError] = useState('')
  const { user } = useAuth()

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

  return (
    <div className="editorial-home" id="top">
      <header className="editorial-header">
        <div className="editorial-nav container">
          <Logo />
          <button className="menu-toggle editorial-menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <nav className={menuOpen ? 'editorial-links is-open' : 'editorial-links'} aria-label="Main navigation">
            <a href="#about" onClick={closeMenu}>About</a>
            <a href="#services" onClick={closeMenu}>Services</a>
            <a href="#how-it-works" onClick={closeMenu}>Process</a>
            <Link to="/assistant" onClick={closeMenu}>Garden assistant</Link>
          </nav>
          <Button href={user ? '/dashboard' : '/login'} onClick={closeMenu}>{user ? 'Dashboard' : 'Get started'} <ArrowUpRight size={16} /></Button>
        </div>
      </header>

      <main>
        <section className="editorial-hero">
          <div className="container editorial-hero-grid">
            <div className="editorial-hero-copy">
              <p className="editorial-kicker"><span /> Gardening, thoughtfully connected</p>
              <h1>Let your garden<br /><em>come alive.</em></h1>
              <p className="editorial-hero-text">A considered way to discover local gardening expertise, shape your ideas, and create an outdoor space that feels like yours.</p>
              <div className="editorial-hero-actions">
                <Button href="/services">Find your gardener <ArrowUpRight size={17} /></Button>
                <a className="editorial-text-link" href="#about">Our approach <ArrowRight size={16} /></a>
              </div>
              <div className="editorial-hero-note"><span className="editorial-note-icon"><Check size={14} /></span><span><strong>Made for Zamboanga City</strong><small>Local people. Real garden conversations.</small></span></div>
            </div>
            <div className="editorial-hero-visual">
              <img src={editorialProcess1} alt="Lush green garden with a stone path" />
              <div className="editorial-image-label"><span>01</span><span>A garden is<br />always growing.</span></div>
              <div className="editorial-overlap-card">
                <img src={editorialProcess2} alt="Hands caring for a young plant" />
                <div><span className="editorial-mini-label">Start here</span><strong>Tell us about your space.</strong><Link to="/services">Explore services <ArrowUpRight size={14} /></Link></div>
              </div>
            </div>
          </div>
          <div className="editorial-scroll-mark"><span>Scroll to explore</span><span className="editorial-scroll-line" /></div>
        </section>

        <section className="editorial-about editorial-section" id="about">
          <div className="container editorial-about-grid">
            <div className="editorial-about-image editorial-tall-image"><img src={editorialAbout} alt="Peaceful landscaped garden surrounded by greenery" /><span className="editorial-image-caption">Cultivating better<br />everyday spaces</span></div>
            <div className="editorial-about-copy"><p className="editorial-kicker">A more personal marketplace</p><h2>Good gardens begin with <em>good questions.</em></h2><p>HugaTiera brings clients and gardeners together in a space built around conversation. Browse real services, explore previous work, and take the time to find the right fit for your home.</p><p>From the first idea to a mutual agreement, every step stays clear, human, and considered.</p><Link className="editorial-text-link" to="/services">Meet the local marketplace <ArrowUpRight size={16} /></Link><div className="editorial-stats"><div><strong>01</strong><span>Local-first<br />community</span></div><div><strong>04</strong><span>Clear steps<br />to booking</span></div><div><strong>∞</strong><span>Ways to<br />grow</span></div></div></div>
          </div>
        </section>

        <section className="editorial-services editorial-section" id="services">
          <div className="container">
            <div className="editorial-section-heading"><div><p className="editorial-kicker">Find your fit</p><h2>Services for the way<br /><em>you live outside.</em></h2></div><p>Whether you need a gentle refresh or a complete transformation, start with the kind of help your garden is asking for.</p></div>
            <div className="editorial-feature-grid">
              {categories.map(({ title, description, icon: Icon, tone }, index) => {
                const matchedId = categoryMap[title.toLowerCase()]
                const targetUrl = matchedId ? `/services?categoryId=${matchedId}` : '/services'
                return <Link className={`editorial-feature-card feature-${tone}`} to={targetUrl} key={title}><span className="editorial-feature-index">0{index + 1}</span><span className="editorial-feature-icon"><Icon size={21} /></span><h3>{title}</h3><p>{description}</p><span className="editorial-card-arrow"><ArrowUpRight size={17} /></span></Link>
              })}
              <Link className="editorial-feature-card feature-image" to="/services"><img src={editorialFeature} alt="Close-up of bright garden foliage" /><span>See all services <ArrowUpRight size={16} /></span></Link>
            </div>
            {featuredError && <div className="form-error" role="alert">{featuredError}</div>}
            {!featuredError && featuredServices.length > 0 && <div className="editorial-live-row"><span><span className="editorial-live-dot" /> Recently added in the marketplace</span>{featuredServices.slice(0, 2).map((service) => <Link to={`/services/${service.id}`} key={service.id}>{service.title} <ArrowUpRight size={13} /></Link>)}</div>}
          </div>
        </section>

        <section className="editorial-why editorial-section">
          <div className="container">
            <div className="editorial-section-heading editorial-centered-heading"><div><p className="editorial-kicker">Why HugaTiera</p><h2>Rooted in care.<br /><em>Designed for trust.</em></h2></div></div>
            <div className="editorial-why-grid">
              <div className="editorial-benefit benefit-one"><span><Leaf size={18} /></span><strong>Local knowledge</strong><p>Connect with people who understand the rhythm of gardens in our community.</p></div>
              <div className="editorial-benefit benefit-two"><span><ShieldCheck size={18} /></span><strong>Clear by design</strong><p>Inquiries, offers, agreements, and bookings stay separate and easy to follow.</p></div>
              <div className="editorial-why-image"><img src={editorialWhy} alt="Person tending plants in a bright garden" /><span>Care makes<br />the difference.</span></div>
              <div className="editorial-benefit benefit-three"><span><Sparkles size={18} /></span><strong>Ideas that grow</strong><p>Use the Garden Planning Assistant to explore possibilities before you begin.</p></div>
              <div className="editorial-benefit benefit-four"><span><MessageCircle size={18} /></span><strong>Human conversation</strong><p>Ask questions, compare options, and choose with confidence.</p></div>
            </div>
          </div>
        </section>

        <section className="editorial-testimonials editorial-section">
          <div className="container editorial-testimonial-grid">
            <div><p className="editorial-kicker editorial-kicker-light">A little inspiration</p><h2>“The best gardens<br /><em>feel like you.”</em></h2><div className="editorial-testimonial-controls"><button type="button" aria-label="Previous testimonial"><ChevronLeft size={18} /></button><button type="button" aria-label="Next testimonial"><ChevronRight size={18} /></button></div></div>
            <article className="editorial-quote-card"><div className="editorial-stars" aria-label="5 out of 5 stars"><Star size={15} fill="currentColor" /><Star size={15} fill="currentColor" /><Star size={15} fill="currentColor" /><Star size={15} fill="currentColor" /><Star size={15} fill="currentColor" /></div><blockquote>“I finally knew where to start. Seeing local work and being able to ask questions made the whole process feel much less overwhelming.”</blockquote><div className="editorial-quote-person"><span>AM</span><div><strong>Anna Marie</strong><small>Home gardener · Zamboanga City</small></div></div></article>
          </div>
        </section>

        <section className="editorial-process editorial-section" id="how-it-works">
          <div className="container"><div className="editorial-section-heading"><div><p className="editorial-kicker">The simple way forward</p><h2>From first thought<br /><em>to flourishing.</em></h2></div><p>Take your time. HugaTiera gives every garden conversation room to become something real.</p></div><div className="editorial-process-grid">{steps.map(([number, title, description], index) => <div className="editorial-process-step" key={title}><span className="editorial-process-number">{number}</span><div className="editorial-process-image"><img src={[editorialProcess1, editorialProcess2, editorialProcess3, editorialProcess4][index]} alt="" /></div><h3>{title}</h3><p>{description}</p></div>)}</div></div>
        </section>

        <section className="editorial-cta-section">
          <div className="container editorial-cta"><div><p className="editorial-kicker editorial-kicker-light">Ready when you are</p><h2>Make room for<br /><em>something green.</em></h2><p>Find a gardener, share your idea, and take the first small step toward a space you will love coming home to.</p><Button variant="light" href="/services">Explore local services <ArrowUpRight size={17} /></Button></div><div className="editorial-cta-image"><img src={editorialCta} alt="Sunlit garden path surrounded by plants" /></div></div>
        </section>
      </main>

      <footer className="editorial-footer">
        <div className="container editorial-footer-grid"><div><Logo /><p>Making space for better gardens<br />in Zamboanga City.</p></div><div className="editorial-footer-links"><span>Explore</span><Link to="/services">Services</Link><a href="#about">Our approach</a><a href="#how-it-works">Process</a></div><div className="editorial-footer-links"><span>Connect</span><Link to="/assistant">Garden assistant</Link><Link to="/register?role=gardener">Join as a gardener</Link><a href="mailto:hello@hugatiera.local">hello@hugatiera.local</a></div></div><div className="container editorial-footer-bottom"><span>© 2026 HugaTiera</span><span>Built with care for local gardens <Leaf size={13} /></span></div>
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
