import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Leaf, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { communicationApi } from '../services/communication'
import { getDashboardNavLinks } from '../services/profiles'

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
    if (item.to === '/dashboard') return location.pathname === '/dashboard' && !location.search
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
        {links.map((item) => item.type === 'anchor'
          ? <a className={isActive(item) ? 'is-active' : ''} href={item.href} key={item.label}>{item.label} {badge(item.badge)}</a>
          : <Link className={isActive(item) ? 'is-active' : ''} to={item.to} key={item.label}>{item.label} {badge(item.badge)}</Link>)}
      </nav>
      <button className="app-sidebar-logout" type="button" onClick={logout}><LogOut size={16} /> Log out</button>
    </aside>
  )
}
