import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  Leaf,
  LogOut,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Settings,
  ShieldCheck,
  Store,
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

  useEffect(() => {
    if (!user || !['client', 'gardener'].includes(user.role)) return
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
    Bookings: CalendarDays,
    Profile: Settings,
    Approvals: ShieldCheck,
    Activity: BarChart3,
    Reports: ClipboardList,
    Accounts: Users,
    Marketplace: Store,
  }[label] || ClipboardList)

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current
      localStorage.setItem('hugatiera.sidebar.collapsed', String(next))
      return next
    })
  }

  const closeMobile = () => setMobileOpen(false)
  const availableRoles = user.roles || [user.role]

  async function handleRoleChange(event) {
    const role = event.target.value
    if (!role || role === user.role) return
    setSwitchingRole(true); setRoleSwitchError('')
    try {
      await switchRole(role)
      closeMobile()
      navigate('/dashboard')
    } catch (error) {
      setRoleSwitchError(error.message)
    } finally {
      setSwitchingRole(false)
    }
  }

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

  return (
    <>
      <aside className={`app-sidebar${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}>
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
          <div className="app-sidebar-section-label">Navigation</div>
          <nav className="app-sidebar-nav" aria-label="Application navigation">
            {links.map(renderLink)}
          </nav>
          <div className="app-sidebar-role">
            <span className="app-sidebar-avatar" aria-hidden="true">{user.firstName?.slice(0, 1) || 'H'}</span>
            <span className="app-sidebar-role-copy">
              <strong>{user.firstName || 'Account'}</strong>
              <small>{user.role}</small>
            </span>
          </div>
          {availableRoles.length > 1 && (
            <label className="app-sidebar-mode">
              <span>Switch mode</span>
              <select aria-label="Switch account mode" value={user.role} disabled={switchingRole} onChange={handleRoleChange}>
                {availableRoles.map((role) => (
                  <option value={role} key={role}>{role === 'gardener' ? 'Gardener' : role === 'client' ? 'Client' : 'Administrator'}</option>
                ))}
              </select>
              {roleSwitchError && <small className="form-error" role="alert">{roleSwitchError}</small>}
            </label>
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
      {user.role !== 'administrator' && location.pathname !== '/assistant' && <AiAssistantWidget />}
    </>
  )
}
