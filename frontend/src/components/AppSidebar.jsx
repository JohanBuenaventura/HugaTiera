import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Images,
  Leaf,
  LogOut,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { communicationApi } from '../services/communication'
import { getDashboardNavLinks } from '../services/profiles'
import AiAssistantWidget from './AiAssistantWidget'

export default function AppSidebar() {
  const { user, logout, switchRole } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [unreadCounts, setUnreadCounts] = useState({})
  const [switchingRole, setSwitchingRole] = useState(false)
  const [roleSwitchError, setRoleSwitchError] = useState('')
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('hugatiera.sidebar.collapsed') === 'true')
  const [mobileOpen, setMobileOpen] = useState(false)

  const refreshUnreadCounts = useCallback(() => {
    if (!user || !['client', 'gardener', 'clerk', 'administrator'].includes(user.role)) return
    communicationApi.notifications().then((result) => {
      const unread = result.notifications.filter((notification) => !notification.read_at)
      const count = (type) => new Set(
        unread
          .filter((notification) => notification.related_entity_type === type && notification.related_entity_id)
          .map((notification) => notification.related_entity_id),
      ).size
      const general = unread.filter(
        (notification) => !['inquiry', 'booking', 'conversation'].includes(notification.related_entity_type),
      ).length
      setUnreadCounts({
        inquiries: count('inquiry'),
        bookings: count('booking'),
        messages: count('conversation'),
        notifications: unread.length,
        general,
      })
    }).catch(() => {})
  }, [user])

  useEffect(() => {
    refreshUnreadCounts()
  }, [refreshUnreadCounts, location.pathname, location.search])

  useEffect(() => {
    const handleSync = () => refreshUnreadCounts()
    window.addEventListener('hugatiera:notifications-updated', handleSync)
    return () => window.removeEventListener('hugatiera:notifications-updated', handleSync)
  }, [refreshUnreadCounts])

  if (!user) return null

  const links = getDashboardNavLinks(user.role, unreadCounts)
  const isActive = (item) => {
    if (item.type === 'anchor') {
      return location.pathname === '/dashboard' && location.hash === item.href
    }
    if (item.to === '/dashboard') {
      return location.pathname === '/dashboard' && !location.search && !location.hash
    }
    if (item.to.includes('tab=')) {
      const tabValue = item.to.split('tab=')[1]
      return (location.pathname === '/dashboard' && location.search.includes(`tab=${tabValue}`))
        || (tabValue === 'profile' && location.pathname === '/profile')
    }
    const base = item.to.split('?')[0]
    return location.pathname === base || location.pathname.startsWith(`${base}/`)
  }
  const badge = (count) => count > 0 && <b className="notification-badge">{count > 99 ? '99+' : count}</b>
  const iconFor = (label) => ({
    Overview: BarChart3,
    Analytics: PieChart,
    Inquiries: ClipboardList,
    Messages: MessageCircle,
    Notifications: Bell,
    Bookings: CalendarCheck,
    Calendar: CalendarDays,
    Schedule: CalendarDays,
    Schedules: CalendarDays,
    Payments: CreditCard,
    Services: Briefcase,
    'My services': Briefcase,
    Portfolio: Images,
    'My Clerks': Users,
    'My Staff': Users,
    'AI Assistant': Sparkles,
    Profile: UserCog,
    Approvals: ShieldCheck,
    Pricing: Tag,
    Activity: BarChart3,
    Reports: ClipboardList,
    Accounts: Users,
    Marketplace: Store,
  }[label] || Settings)

  async function handleRoleSwitch() {
    if (!user?.isDualRole || switchingRole) return
    const nextRole = user.role === 'client' ? 'gardener' : 'client'
    setSwitchingRole(true)
    setRoleSwitchError('')
    try {
      await switchRole(nextRole)
      closeMobile()
      navigate('/dashboard')
    } catch (error) {
      setRoleSwitchError(error?.message || 'Unable to switch role right now.')
    } finally {
      setSwitchingRole(false)
    }
  }

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current
      localStorage.setItem('hugatiera.sidebar.collapsed', String(next))
      return next
    })
  }

  const closeMobile = () => setMobileOpen(false)

  const renderLink = (item) => {
    const Icon = iconFor(item.label)
    const active = isActive(item)
    const destination = item.type === 'anchor' ? `/dashboard${item.href}` : item.to
    return (
      <Link
        key={item.label}
        to={destination}
        onClick={closeMobile}
        className={`${active ? 'is-active ' : ''}app-sidebar-link`}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
      >
        <span className="app-sidebar-link-icon"><Icon size={17} strokeWidth={1.9} /></span>
        <span className="app-sidebar-link-label">{item.label}</span>
        {badge(item.badge)}
      </Link>
    )
  }

  const skipToMainContent = (event) => {
    const target = document.getElementById('main-content') || document.querySelector('main h1, main')
    if (!target) return
    event.preventDefault()
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
    target.focus()
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const mobileNavLinks = links.slice(0, 4)

  return (
    <>
      <a className="skip-link visually-hidden" href="#main-content" onClick={skipToMainContent}>
        Skip to main content
      </a>
      <aside className={`app-sidebar${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' is-mobile-open' : ''}`} data-user-role={user.role}>
        <div className="app-sidebar-topline">
          <Link
            className="brand app-sidebar-brand"
            to="/dashboard"
            onClick={closeMobile}
            aria-label="HugaTiera dashboard"
            title={collapsed ? 'HugaTiera dashboard' : undefined}
          >
            <span className="brand-mark" aria-hidden="true"><Leaf size={18} /></span>
            <span className="app-sidebar-brand-label">Huga<span>Tiera</span></span>
          </Link>
          <button
            className="app-sidebar-toggle"
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button
            className="app-sidebar-mobile-toggle"
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <div className="app-sidebar-drawer">
          <nav className="app-sidebar-nav" aria-label="Application navigation">
            {links.map((item, idx) => {
              const hasGroups = links.some((entry) => Boolean(entry.group))
              const showGroupHeader = hasGroups
                ? item.group !== links[idx - 1]?.group
                : idx === 0
              const groupLabel = hasGroups ? item.group : 'Navigation'
              return (
                <div key={item.label} className="app-sidebar-nav-item-wrap">
                  {showGroupHeader && (
                    <div className={`app-sidebar-section-label${idx > 0 ? ' is-secondary' : ''}`}>
                      {groupLabel}
                    </div>
                  )}
                  {renderLink(item)}
                </div>
              )
            })}
          </nav>
          <div className="app-sidebar-role">
            <span className="app-sidebar-avatar" aria-hidden="true">{user.firstName?.slice(0, 1) || 'H'}</span>
            <span className="app-sidebar-role-copy">
              <strong>{user.firstName || 'Account'}</strong>
              <small>{user.role}{user.isDualRole ? ' · Dual role' : ''}</small>
            </span>
          </div>
          {user.isDualRole && (
            <>
              <button
                className="app-sidebar-switch-role"
                type="button"
                disabled={switchingRole}
                onClick={handleRoleSwitch}
                title={collapsed ? `Switch to ${user.role === 'client' ? 'Gardener' : 'Client'} mode` : undefined}
              >
                <ArrowLeftRight size={15} />
                <span className="app-sidebar-link-label">
                  {switchingRole
                    ? 'Switching...'
                    : `Switch to ${user.role === 'client' ? 'Gardener' : 'Client'}`}
                </span>
              </button>
              {roleSwitchError && (
                <small className="form-error" role="alert" style={{ padding: '6px 8px', margin: '4px 0 0' }}>
                  {roleSwitchError}
                </small>
              )}
            </>
          )}
          <button
            className="app-sidebar-logout"
            type="button"
            onClick={() => { closeMobile(); logout() }}
            title={collapsed ? 'Log out' : undefined}
          >
            <LogOut size={16} />
            <span className="app-sidebar-link-label">Log out</span>
          </button>
        </div>
      </aside>
      <nav className="mobile-bottom-nav" aria-label="Mobile quick navigation">
        {mobileNavLinks.map((item) => {
          const Icon = iconFor(item.label)
          const active = isActive(item)
          const destination = item.type === 'anchor' ? `/dashboard${item.href}` : item.to
          return (
            <Link
              key={`mobile-${item.label}`}
              to={destination}
              className={active ? 'is-active' : undefined}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={2} />
              <span>{item.label}</span>
              {item.badge > 0 && <b className="mobile-nav-badge">{item.badge > 9 ? '9+' : item.badge}</b>}
            </Link>
          )
        })}
      </nav>
      {!['administrator', 'clerk'].includes(user.role) && location.pathname !== '/assistant' && <AiAssistantWidget />}
    </>
  )
}
