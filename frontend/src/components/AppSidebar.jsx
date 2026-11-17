import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Leaf,
  LogOut,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { communicationApi } from '../services/communication'
import { getDashboardNavLinks } from '../services/profiles'

export default function AppSidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [unreadCounts, setUnreadCounts] = useState({})
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('hugatiera.sidebar.collapsed') === 'true')

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
        messages: count('conversation') + general,
      })
    }).catch(() => {})
  }, [user])

  if (!user) return null

  const links = getDashboardNavLinks(user.role, unreadCounts)
  const isActive = (item) => {
    if (item.type === 'anchor') return location.hash === item.href.slice(1)
    if (item.to === '/dashboard') return location.pathname === '/dashboard' && !location.search
    return location.pathname === item.to.split('?')[0]
  }
  const badge = (count) => count > 0 && <b className="notification-badge">{count}</b>
  const iconFor = (label) => ({
    Overview: BarChart3,
    Inquiries: ClipboardList,
    'Garden Projects': Leaf,
    Messages: MessageCircle,
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
  const itemProps = (item) => ({
    className: `${isActive(item) ? 'is-active' : ''} app-sidebar-link`,
    'aria-current': isActive(item) ? 'page' : undefined,
    title: collapsed ? item.label : undefined,
  })
  const renderLink = (item) => {
    const Icon = iconFor(item.label)
    const content = <><span className="app-sidebar-link-icon"><Icon size={17} strokeWidth={1.9} /></span><span className="app-sidebar-link-label">{item.label}</span>{badge(item.badge)}</>
    return item.type === 'anchor'
      ? <a {...itemProps(item)} href={item.href} key={item.label}>{content}</a>
      : <Link {...itemProps(item)} to={item.to} key={item.label}>{content}</Link>
  }

  return (
    <aside className={`app-sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="app-sidebar-topline">
        <Link className="brand app-sidebar-brand" to="/" title={collapsed ? 'HugaTiera' : undefined}>
        <span className="brand-mark"><Leaf size={19} /></span>
          <span className="app-sidebar-brand-label">Huga<span>Tiera</span></span>
        </Link>
        <button className="app-sidebar-toggle" type="button" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>
      <div className="app-sidebar-section-label">Main</div>
      <nav className="app-sidebar-nav" aria-label="Application navigation">
        {links.map(renderLink)}
      </nav>
      <div className="app-sidebar-role">
        <span className="app-sidebar-avatar">{user.firstName?.slice(0, 1) || 'H'}</span>
        <span className="app-sidebar-role-copy"><strong>{user.firstName || 'Account'}</strong><small>{user.role}</small></span>
      </div>
      <button className="app-sidebar-logout" type="button" onClick={logout} title={collapsed ? 'Log out' : undefined}><LogOut size={16} /><span className="app-sidebar-link-label">Log out</span></button>
    </aside>
  )
}
