import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  CreditCard,
  ExternalLink,
  FileText,
  MapPin,
  MessageCircle,
  Search,
  Send,
  Star,
  UserRound,
} from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { formatStatusLabel, getStatusBadgeClass } from '../services/bookings'
import { communicationApi } from '../services/communication'
import AppSidebar from '../components/AppSidebar'

function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'HT'
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}

function getConversationStatus(conversation) {
  if (conversation.booking_status) {
    const key = ['completed', 'cancelled', 'in_progress'].includes(conversation.booking_status)
      ? conversation.booking_status
      : (conversation.booking_stage || conversation.booking_status)
    return { key, label: formatStatusLabel(key) }
  }
  if (conversation.inquiry_status) {
    return { key: conversation.inquiry_status, label: formatStatusLabel(conversation.inquiry_status) }
  }
  return null
}

function formatMessageTime(dateInput) {
  const parsed = new Date(dateInput)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatMessageDayHeader(dateInput) {
  const parsed = new Date(dateInput)
  if (Number.isNaN(parsed.getTime())) return ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86400000
  const msgDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime()
  if (msgDay === startOfToday) return 'Today'
  if (msgDay === startOfYesterday) return 'Yesterday'
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRelativeTime(dateInput) {
  const parsed = new Date(dateInput)
  if (Number.isNaN(parsed.getTime())) return ''
  const diffMs = Date.now() - parsed.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getDateBucketLabel(dateInput) {
  const parsed = new Date(dateInput)
  if (Number.isNaN(parsed.getTime())) return 'Earlier'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86400000
  const ts = parsed.getTime()
  if (ts >= startOfToday) return 'Today'
  if (ts >= startOfYesterday) return 'Yesterday'
  return 'Earlier'
}

function ConversationItem({ conversation, currentUserId, onSelect, selected }) {
  const status = getConversationStatus(conversation)
  const projectLabel = conversation.inquiry_subject || conversation.service_title || 'General conversation'
  const isOwnLatest = Number(conversation.latest_sender_id) === Number(currentUserId)
  const previewText = conversation.latest_message
    ? `${isOwnLatest ? 'You: ' : ''}${conversation.latest_message}`
    : 'No messages yet — start the conversation'
  const roleLabel = conversation.other_party_role === 'gardener' ? 'Gardener' : 'Client'

  return (
    <button
      className={`conversation-item msg-inbox-row${selected ? ' is-selected' : ''}${conversation.unread_count > 0 ? ' has-unread' : ''}`}
      type="button"
      onClick={() => onSelect(conversation)}
    >
      <span className={`msg-avatar${conversation.other_party_role === 'gardener' ? ' is-gardener' : ''}`} aria-hidden="true">
        {getInitials(conversation.other_party_name)}
      </span>
      <div className="msg-inbox-body">
        <div className="msg-inbox-top">
          <strong className="msg-inbox-name">{conversation.other_party_name || 'Conversation'}</strong>
          <small className="msg-inbox-time">
            {formatRelativeTime(conversation.latest_message_at || conversation.created_at)}
          </small>
        </div>
        <div className="msg-inbox-project-row">
          <span className="msg-inbox-project">{projectLabel}</span>
          {status ? (
            <span className={`${getStatusBadgeClass(status.key)} msg-inbox-status`}>{status.label}</span>
          ) : (
            <span className="msg-role-tag">{roleLabel}</span>
          )}
        </div>
        <div className="msg-inbox-preview-row">
          <small className="msg-inbox-preview">{previewText}</small>
          {conversation.unread_count > 0 && (
            <b className="msg-unread-pill" aria-label={`${conversation.unread_count} unread`}>
              {conversation.unread_count}
            </b>
          )}
        </div>
      </div>
    </button>
  )
}

function notificationPath(notification, user) {
  if (user?.role === 'clerk') {
    if (notification.related_entity_type === 'booking' || notification.related_entity_type === 'payment') {
      return '/dashboard?tab=payments'
    }
    if (notification.related_entity_type === 'conversation') return null
    if (['inquiry', 'review', 'gardener_profile'].includes(notification.related_entity_type)) {
      return '/dashboard'
    }
    return null
  }
  if (user?.role === 'administrator') {
    if (notification.related_entity_type === 'inquiry') return `/inquiries/${notification.related_entity_id}`
    if (notification.related_entity_type === 'gardener_profile') return '/dashboard?tab=approvals'
    if (notification.related_entity_type === 'report') return '/dashboard?tab=reports'
    return '/dashboard'
  }
  if (notification.related_entity_type === 'inquiry') return `/inquiries/${notification.related_entity_id}`
  if (notification.related_entity_type === 'booking') return `/bookings/${notification.related_entity_id}`
  if (notification.related_entity_type === 'conversation') return `/messages?conversationId=${notification.related_entity_id}`
  if (notification.related_entity_type === 'review') return user?.role === 'gardener' ? `/gardeners/${user.id}` : '/bookings'
  if (notification.related_entity_type === 'gardener_profile') return '/dashboard'
  return null
}

const notificationPresentationByType = {
  new_message: { category: 'message', group: 'messages', label: 'Message', Icon: MessageCircle },
  new_inquiry: { category: 'request', group: 'requests', label: 'Inquiry', Icon: ClipboardList, requiresAction: true },
  inquiry_status: { category: 'request', group: 'requests', label: 'Request', Icon: ClipboardList },
  new_quotation: { category: 'offer', group: 'requests', label: 'Offer', Icon: FileText, requiresAction: true },
  quotation_revised: { category: 'offer', group: 'requests', label: 'Offer', Icon: FileText, requiresAction: true },
  quotation_status: { category: 'offer', group: 'requests', label: 'Offer', Icon: FileText },
  agreement_proposed: { category: 'agreement', group: 'requests', label: 'Agreement', Icon: FileText, requiresAction: true },
  agreement_revised: { category: 'agreement', group: 'requests', label: 'Agreement', Icon: FileText, requiresAction: true },
  agreement_approved: { category: 'agreement', group: 'requests', label: 'Agreement', Icon: FileText },
  agreement_cancelled: { category: 'agreement', group: 'requests', label: 'Agreement', Icon: FileText },
  booking_confirmed: { category: 'booking', group: 'bookings', label: 'Booking', Icon: CalendarDays },
  booking_status: { category: 'booking', group: 'bookings', label: 'Booking', Icon: CalendarDays },
  booking_reschedule: { category: 'booking', group: 'bookings', label: 'Schedule', Icon: CalendarDays },
  booking_reminder: { category: 'booking', group: 'bookings', label: 'Reminder', Icon: CalendarDays },
  booking_payment: { category: 'payment', group: 'bookings', label: 'Payment', Icon: CreditCard },
  new_review: { category: 'review', group: 'messages', label: 'Review', Icon: Star },
  clerk_assignment: { category: 'account', group: 'messages', label: 'Account', Icon: UserRound },
}

const NOTIFICATION_TABS = [
  { key: 'all', label: 'All' },
  { key: 'action', label: 'Needs action' },
  { key: 'requests', label: 'Requests & Offers' },
  { key: 'bookings', label: 'Bookings & Payments' },
  { key: 'messages', label: 'Messages & Other' },
]

function getNotificationPresentation(notification) {
  const type = notification.notification_type
  const presentation = notificationPresentationByType[type] || {
    category: 'general',
    group: 'messages',
    label: 'Update',
    Icon: Bell,
  }
  const title = notification.title || ''
  const urgentReminder = type === 'booking_reminder' && /^(Overdue schedule:|Urgent\s+—)/i.test(title)
  const actionRequired = presentation.requiresAction
    || (type === 'booking_reschedule' && /^Reschedule requested/i.test(title))
    || (type === 'booking_payment' && /^Payment proof (submitted|rejected)/i.test(title))
    || urgentReminder

  return {
    ...presentation,
    priority: urgentReminder ? 'urgent' : actionRequired ? 'action' : null,
  }
}

export default function CommunicationPage({ mode = 'messages' }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [inboxSearch, setInboxSearch] = useState('')
  const [inboxUnreadOnly, setInboxUnreadOnly] = useState(false)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [notifications, setNotifications] = useState([])
  const [notifCategory, setNotifCategory] = useState('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [visibleNotifCount, setVisibleNotifCount] = useState(12)
  const [error, setError] = useState('')
  const initialSelectionHandled = useRef(false)
  const messageHistoryRef = useRef(null)
  const isNotificationsView = mode === 'notifications'
  const isMemberWorkspace = ['client', 'gardener'].includes(user?.role)

  const selected = useMemo(
    () => conversations.find((item) => item.id === selectedId) || null,
    [conversations, selectedId],
  )

  const loadConversations = useCallback(() => {
    if (isNotificationsView) return Promise.resolve()
    return communicationApi.conversations().then((result) => {
      const list = result.conversations || []
      setConversations(list)
      if (!initialSelectionHandled.current) {
        initialSelectionHandled.current = true
        const targetId = params.get('conversationId')
        if (targetId) {
          const match = list.find((item) => item.id === Number(targetId))
          if (match) {
            setLoadingMessages(true)
            setSelectedId(match.id)
            return
          }
        }
        if (list.length > 0 && window.innerWidth > 900) {
          setLoadingMessages(true)
          setSelectedId(list[0].id)
        }
      }
    }).catch((loadError) => setError(loadError.message))
  }, [isNotificationsView, params])

  useEffect(() => {
    loadConversations()
    if (isNotificationsView) {
      communicationApi.notifications()
        .then((result) => setNotifications(result.notifications || []))
        .catch((loadError) => setError(loadError.message))
    }
  }, [isNotificationsView, loadConversations])

  useEffect(() => {
    if (isNotificationsView || !selectedId) return undefined
    let active = true
    const fetchThread = (isPoll = false) => {
      communicationApi.messages(selectedId)
        .then((result) => {
          if (!active) return
          setMessages(result.messages || [])
          if (!isPoll) {
            loadConversations()
            window.dispatchEvent(new Event('hugatiera:notifications-updated'))
          }
        })
        .catch((loadError) => { if (active && !isPoll) setError(loadError.message) })
        .finally(() => { if (active && !isPoll) setLoadingMessages(false) })
    }

    fetchThread(false)
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchThread(true)
        loadConversations()
      }
    }, 10000)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [isNotificationsView, selectedId, loadConversations])

  useEffect(() => {
    const container = messageHistoryRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messages, selectedId])

  async function send(event) {
    event.preventDefault()
    if (!draft.trim() || !selected || sending) return
    setSending(true)
    setError('')
    try {
      await communicationApi.sendMessage(selected.id, draft)
      setDraft('')
      const result = await communicationApi.messages(selected.id)
      setMessages(result.messages || [])
      loadConversations()
    } catch (sendError) {
      setError(sendError.message)
    } finally {
      setSending(false)
    }
  }

  async function markAllRead() {
    try {
      await communicationApi.markAllNotificationsRead()
      setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })))
      window.dispatchEvent(new Event('hugatiera:notifications-updated'))
    } catch (readError) {
      setError(readError.message)
    }
  }

  async function openNotification(notification) {
    if (!notification.read_at) {
      try {
        await communicationApi.markNotificationRead(notification.id)
        setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item))
        window.dispatchEvent(new Event('hugatiera:notifications-updated'))
      } catch (readError) {
        setError(readError.message)
        return
      }
    }
    const path = notificationPath(notification, user)
    if (path) navigate(path)
  }

  const enrichedNotifications = notifications.map((notification) => ({
    ...notification,
    presentation: getNotificationPresentation(notification),
  }))

  const unreadCount = enrichedNotifications.filter((item) => !item.read_at).length
  const tabCounts = {
    all: enrichedNotifications.length,
    action: enrichedNotifications.filter((item) => Boolean(item.presentation.priority)).length,
    requests: enrichedNotifications.filter((item) => item.presentation.group === 'requests').length,
    bookings: enrichedNotifications.filter((item) => item.presentation.group === 'bookings').length,
    messages: enrichedNotifications.filter((item) => item.presentation.group === 'messages').length,
  }

  const filteredNotifications = enrichedNotifications.filter((item) => {
    if (unreadOnly && item.read_at) return false
    if (notifCategory === 'action') return Boolean(item.presentation.priority)
    if (notifCategory === 'requests') return item.presentation.group === 'requests'
    if (notifCategory === 'bookings') return item.presentation.group === 'bookings'
    if (notifCategory === 'messages') return item.presentation.group === 'messages'
    return true
  })

  const shownNotifications = filteredNotifications.slice(0, visibleNotifCount)
  const groupedNotifications = ['Today', 'Yesterday', 'Earlier']
    .map((bucket) => ({
      bucket,
      items: shownNotifications.filter((item) => getDateBucketLabel(item.created_at) === bucket),
    }))
    .filter((section) => section.items.length > 0)

  const unreadConversationCount = conversations.filter((conv) => Number(conv.unread_count) > 0).length
  const filteredConversations = useMemo(() => {
    const query = inboxSearch.trim().toLowerCase()
    return conversations.filter((conv) => {
      if (inboxUnreadOnly && Number(conv.unread_count) === 0) return false
      if (!query) return true
      const haystack = [
        conv.other_party_name,
        conv.inquiry_subject,
        conv.service_title,
        conv.latest_message,
        conv.inquiry_location,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [conversations, inboxSearch, inboxUnreadOnly])

  const groupedMessages = useMemo(() => {
    const groups = []
    for (const msg of messages) {
      const dayLabel = formatMessageDayHeader(msg.sent_at)
      const lastGroup = groups[groups.length - 1]
      if (lastGroup && lastGroup.dayLabel === dayLabel) {
        lastGroup.items.push(msg)
      } else {
        groups.push({ dayLabel, items: [msg] })
      }
    }
    return groups
  }, [messages])

  const selectedStatus = selected ? getConversationStatus(selected) : null
  const selectedProjectLabel = selected
    ? (selected.inquiry_subject || selected.service_title || 'General conversation')
    : ''

  return (
    <main className={`marketplace-page protected-page${isMemberWorkspace ? ' member-workspace' : ''}`} data-workspace={user?.role}>
      <AppSidebar />
      <section className="container communication-content">
        <div className="communication-heading">
          <div>
            <h1>{isNotificationsView ? 'Notifications.' : 'Messages.'}</h1>
            <p className="communication-lead">
              {isNotificationsView
                ? 'Filter by what needs action, requests & offers, bookings & payments, or messages.'
                : 'Chat directly about inquiries, offers, and confirmed schedules with project context right beside each thread.'}
            </p>
          </div>
          {isNotificationsView ? (
            <div className="inline-actions">
              {unreadCount > 0 && (
                <button className="button button-outline button-sm" type="button" onClick={markAllRead}>
                  Mark all read ({unreadCount})
                </button>
              )}
              {user?.role === 'clerk' ? (
                <Link className="button button-outline button-sm" to="/dashboard?tab=payments">Open payment desk</Link>
              ) : user?.role === 'administrator' ? (
                <Link className="button button-outline button-sm" to="/dashboard">Back to dashboard</Link>
              ) : (
                <Link className="button button-outline button-sm" to="/messages">Open messages</Link>
              )}
            </div>
          ) : (
            <Link className="button button-outline button-sm" to="/notifications">View notifications</Link>
          )}
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        {isNotificationsView ? (
          <section className="dashboard-panel notification-panel">
            <div className="notif-toolbar">
              <div className="notif-filter-tabs" role="tablist" aria-label="Filter notifications by category">
                {NOTIFICATION_TABS.map((tab) => {
                  const count = tabCounts[tab.key] || 0
                  const active = notifCategory === tab.key
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`notif-filter-pill${active ? ' is-active' : ''}`}
                      onClick={() => {
                        setNotifCategory(tab.key)
                        setVisibleNotifCount(12)
                      }}
                    >
                      <span>{tab.label}</span>
                      {count > 0 && <span className="notif-filter-count">{count}</span>}
                    </button>
                  )
                })}
              </div>
              <label className="notif-unread-toggle">
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(event) => {
                    setUnreadOnly(event.target.checked)
                    setVisibleNotifCount(12)
                  }}
                />
                <span>Unread only ({unreadCount})</span>
              </label>
            </div>

            {filteredNotifications.length === 0 ? (
              <div className="empty-state" style={{ marginTop: '14px' }}>
                {unreadOnly
                  ? 'You are all caught up — no unread notifications in this view.'
                  : notifCategory === 'action'
                    ? 'Nothing needs your immediate action right now.'
                    : 'No notifications in this category yet.'}
              </div>
            ) : (
              <div className="notif-groups">
                {groupedNotifications.map(({ bucket, items }) => (
                  <div className="notif-date-group" key={bucket}>
                    <p className="notif-date-heading">{bucket}</p>
                    <div className="notification-list notification-feed-compact">
                      {items.map((notification) => {
                        const { presentation } = notification
                        const Icon = presentation.Icon
                        const hasLink = Boolean(notificationPath(notification, user))
                        return (
                          <button
                            className={`notification-item notif-row-clean${notification.read_at ? '' : ' is-unread'}`}
                            type="button"
                            onClick={() => openNotification(notification)}
                            key={notification.id}
                          >
                            <span className={`notif-icon-tile notif-icon-tile--${presentation.category}`} aria-hidden="true">
                              <Icon size={16} strokeWidth={2} />
                            </span>
                            <div className="notification-body">
                              <div className="notification-row-top">
                                <div className="notification-title-group">
                                  {!notification.read_at && <span className="notif-unread-dot" aria-label="Unread" />}
                                  <strong>{notification.title}</strong>
                                  {presentation.priority && (
                                    <span className={`notification-importance notification-importance--${presentation.priority}`}>
                                      {presentation.priority === 'urgent' ? 'Urgent' : 'Action needed'}
                                    </span>
                                  )}
                                </div>
                                <small title={new Date(notification.created_at).toLocaleString()}>
                                  {formatRelativeTime(notification.created_at)}
                                </small>
                              </div>
                              <p className="notif-message-clamp">{notification.message}</p>
                            </div>
                            {hasLink && (
                              <span className="notif-open-chevron" aria-hidden="true">
                                <ChevronRight size={16} />
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filteredNotifications.length > visibleNotifCount && (
              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <button
                  className="button button-outline button-sm"
                  type="button"
                  onClick={() => setVisibleNotifCount((c) => c + 12)}
                >
                  Show more ({filteredNotifications.length - visibleNotifCount} remaining)
                </button>
              </div>
            )}
          </section>
        ) : (
          <div className={`communication-grid msg-workspace-grid${selected ? ' has-selected' : ''}`}>
            <aside className="dashboard-panel conversation-list msg-inbox-panel">
              <div className="msg-inbox-header">
                <div className="msg-inbox-title-row">
                  <h2>Conversations</h2>
                  <span className="panel-count">{conversations.length}</span>
                </div>
                <div className="msg-inbox-search">
                  <Search size={15} aria-hidden="true" />
                  <input
                    aria-label="Search conversations by name or project"
                    placeholder="Search person or project..."
                    value={inboxSearch}
                    onChange={(event) => setInboxSearch(event.target.value)}
                  />
                </div>
                <div className="msg-inbox-filters" role="group" aria-label="Filter inbox">
                  <button
                    type="button"
                    className={`msg-filter-chip${!inboxUnreadOnly ? ' is-active' : ''}`}
                    onClick={() => setInboxUnreadOnly(false)}
                  >
                    All ({conversations.length})
                  </button>
                  <button
                    type="button"
                    className={`msg-filter-chip${inboxUnreadOnly ? ' is-active' : ''}`}
                    onClick={() => setInboxUnreadOnly(true)}
                  >
                    Unread ({unreadConversationCount})
                  </button>
                </div>
              </div>

              <div className="msg-inbox-scroll">
                {filteredConversations.length === 0 ? (
                  <p className="form-note" style={{ padding: '12px 4px' }}>
                    {conversations.length === 0
                      ? 'No conversations yet. Open any inquiry or booking to start messaging.'
                      : 'No conversations match your search.'}
                  </p>
                ) : (
                  filteredConversations.map((conversation) => (
                    <ConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      currentUserId={user.id}
                      selected={selected?.id === conversation.id}
                      onSelect={(conv) => {
                        setError('')
                        if (conv.id !== selectedId) {
                          setMessages([])
                          setLoadingMessages(true)
                        }
                        setSelectedId(conv.id)
                      }}
                    />
                  ))
                )}
              </div>
            </aside>

            <section className="dashboard-panel message-panel msg-thread-panel">
              {selected ? (
                <>
                  <div className="msg-thread-header">
                    <div className="msg-thread-identity">
                      <button
                        className="msg-mobile-back"
                        type="button"
                        onClick={() => setSelectedId(null)}
                        aria-label="Back to conversations"
                      >
                        <ArrowLeft size={16} />
                      </button>
                      <span className={`msg-avatar${selected.other_party_role === 'gardener' ? ' is-gardener' : ''}`} aria-hidden="true">
                        {getInitials(selected.other_party_name)}
                      </span>
                      <div className="msg-thread-identity-copy">
                        <div className="msg-thread-name-row">
                          <h2>{selected.other_party_name || 'Conversation'}</h2>
                          <span className="msg-role-tag">
                            {selected.other_party_role === 'gardener' ? 'Gardener' : 'Client'}
                          </span>
                        </div>
                        <div className="msg-thread-meta-row">
                          <strong>{selectedProjectLabel}</strong>
                          {selectedStatus && (
                            <span className={getStatusBadgeClass(selectedStatus.key)}>{selectedStatus.label}</span>
                          )}
                          {selected.inquiry_location && (
                            <span className="msg-meta-chip">
                              <MapPin size={12} aria-hidden="true" /> {selected.inquiry_location}
                            </span>
                          )}
                          {selected.booking_scheduled_start && (
                            <span className="msg-meta-chip">
                              <CalendarDays size={12} aria-hidden="true" />{' '}
                              {new Date(selected.booking_scheduled_start).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="msg-thread-actions">
                      {selected.inquiry_id && (
                        <Link className="button button-outline button-sm" to={`/inquiries/${selected.inquiry_id}`}>
                          <ClipboardList size={14} /> Open inquiry
                        </Link>
                      )}
                      {selected.booking_id && (
                        <Link className="button button-outline button-sm" to={`/bookings/${selected.booking_id}`}>
                          <CalendarDays size={14} /> Open booking
                        </Link>
                      )}
                      {selected.other_party_role === 'gardener' && selected.other_party_id && (
                        <Link className="button button-outline button-sm" to={`/gardeners/${selected.other_party_id}`}>
                          <ExternalLink size={14} /> Profile
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="message-history msg-thread-history" ref={messageHistoryRef}>
                    {loadingMessages && <p className="form-note">Loading messages...</p>}
                    {!loadingMessages && messages.length === 0 && (
                      <div className="msg-empty-thread">
                        <MessageCircle size={24} aria-hidden="true" />
                        <strong>No messages yet</strong>
                        <p>Send a message below to discuss scope, schedule, or site details for &ldquo;{selectedProjectLabel}&rdquo;.</p>
                      </div>
                    )}
                    {!loadingMessages && groupedMessages.map((group) => (
                      <div className="msg-day-group" key={group.dayLabel}>
                        <div className="msg-day-divider">
                          <span>{group.dayLabel}</span>
                        </div>
                        {group.items.map((message) => {
                          const isOwn = Number(message.sender_id) === Number(user.id)
                          return (
                            <div className={`message-bubble msg-bubble-clean${isOwn ? ' message-own' : ''}`} key={message.id}>
                              <p>{message.message_text}</p>
                              <small className="msg-bubble-meta">
                                <span>{formatMessageTime(message.sent_at)}</span>
                                {isOwn && (
                                  <span className="msg-read-receipt" title={message.read_at ? 'Seen' : 'Sent'}>
                                    {message.read_at ? <CheckCheck size={13} aria-label="Seen" /> : <Check size={13} aria-label="Sent" />}
                                  </span>
                                )}
                              </small>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>

                  <form className="message-form msg-compose-form" onSubmit={send}>
                    <input
                      aria-label="Message"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      maxLength="5000"
                      placeholder={`Reply to ${selected.other_party_name || 'conversation'}...`}
                    />
                    <button className="button" type="submit" disabled={!draft.trim() || sending}>
                      <Send size={15} /> {sending ? 'Sending...' : 'Send'}
                    </button>
                  </form>
                </>
              ) : (
                <div className="msg-empty-thread">
                  <MessageCircle size={28} aria-hidden="true" />
                  <strong>Select a conversation</strong>
                  <p>Choose a thread on the left to review messages and jump straight to the linked inquiry or booking.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  )
}
