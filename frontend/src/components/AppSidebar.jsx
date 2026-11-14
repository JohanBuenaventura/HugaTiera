import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Activity,
  Calendar,
  Flag,
  FileText,
  Home,
  Leaf,
  LogOut,
  MessageSquare,
  ShieldCheck,
  Store,
  User,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { communicationApi } from '../services/communication'
import { getDashboardNavLinks } from '../services/profiles'

const navIcons = {
  Overview: Home,
  Inquiries: FileText,
  Messages: MessageSquare,
  Bookings: Calendar,
  Profile: User,
  Approvals: ShieldCheck,
  Activity,
  Reports: Flag,
  Accounts: UsersRound,
  Marketplace: Store,
}

export default function AppSidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [unreadCounts, setUnreadCounts] = useState({})

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
    const dashboardTab = new URLSearchParams(location.search).get('tab')
    if (item.to === '/dashboard') {
      return location.pathname === '/dashboard' && !['profile', 'settings'].includes(dashboardTab)
    }
    if (item.to === '/dashboard?tab=profile') {
      return location.pathname === '/profile'
        || (location.pathname === '/dashboard' && ['profile', 'settings'].includes(dashboardTab))
    }
    return location.pathname === item.to.split('?')[0]
  }
  const badge = (count) => count > 0 && <b className="notification-badge">{count}</b>

  return (
    <aside className="app-sidebar">
      <Link className="brand app-sidebar-brand" to="/">
        <span className="brand-mark"><Leaf size={19} /></span>
        <span>Huga<span>Tiera</span></span>
      </Link>
      <div className="app-sidebar-role">
        <span className="app-sidebar-avatar">{user.firstName?.slice(0, 1) || 'H'}</span>
        <span><strong>{user.firstName || 'Account'}</strong><small>{user.role}</small></span>
      </div>
      <nav className="app-sidebar-nav" aria-label="Application navigation">
        {links.map((item) => {
          const Icon = navIcons[item.label] || Leaf
          const active = isActive(item)
          const contents = <><Icon size={17} aria-hidden="true" /><span>{item.label}</span>{badge(item.badge)}</>
          return item.type === 'anchor'
            ? <a className={active ? 'is-active' : ''} href={item.href} key={item.label} aria-current={active ? 'location' : undefined}>{contents}</a>
            : <Link className={active ? 'is-active' : ''} to={item.to} key={item.label} aria-current={active ? 'page' : undefined}>{contents}</Link>
        })}
      </nav>
      <button className="app-sidebar-logout" type="button" onClick={logout}><LogOut size={16} /> Log out</button>
    </aside>
  )
}
