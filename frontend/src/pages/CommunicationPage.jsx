import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Send } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { communicationApi } from '../services/communication'
import AppSidebar from '../components/AppSidebar'

function Conversation({ conversation, onSelect, selected }) {
  return (
    <button
      className={`conversation-item${selected ? ' is-selected' : ''}`}
      type="button"
      onClick={() => onSelect(conversation)}
    >
      <strong>{conversation.other_party_name || 'Conversation'}</strong>
      <span>{conversation.inquiry_subject || 'General conversation'}</span>
      <small>{conversation.latest_message || 'No messages yet'}</small>
      {conversation.unread_count > 0 && <b>{conversation.unread_count}</b>}
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
  if (notification.related_entity_type === 'inquiry') return `/inquiries/${notification.related_entity_id}`
  if (notification.related_entity_type === 'booking') return `/bookings/${notification.related_entity_id}`
  if (notification.related_entity_type === 'conversation') return `/messages?conversationId=${notification.related_entity_id}`
  if (notification.related_entity_type === 'review') return user?.role === 'gardener' ? `/gardeners/${user.id}` : '/bookings'
  if (notification.related_entity_type === 'gardener_profile') return '/dashboard'
  return null
}

export default function CommunicationPage({ mode = 'messages' }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [conversations, setConversations] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [draft, setDraft] = useState('')
  const [notifications, setNotifications] = useState([])
  const [notifFilter, setNotifFilter] = useState('all')
  const [visibleNotifCount, setVisibleNotifCount] = useState(10)
  const [error, setError] = useState('')
  const initialParamHandled = useRef(false)
  const isNotificationsView = mode === 'notifications'

  const loadConversations = useCallback(() => {
    if (isNotificationsView) return Promise.resolve()
    return communicationApi.conversations().then((result) => {
      setConversations(result.conversations)
      const targetId = params.get('conversationId')
      if (!initialParamHandled.current && targetId) {
        initialParamHandled.current = true
        const match = result.conversations.find((item) => item.id === Number(targetId)) || null
        if (match) {
          setLoadingMessages(true)
          setSelected(match)
        }
      }
    }).catch((loadError) => setError(loadError.message))
  }, [isNotificationsView, params])

  useEffect(() => {
    loadConversations()
    if (isNotificationsView) {
      communicationApi.notifications()
        .then((result) => setNotifications(result.notifications))
        .catch((loadError) => setError(loadError.message))
    }
  }, [isNotificationsView, loadConversations])

  useEffect(() => {
    if (isNotificationsView || !selected) return
    let active = true
    communicationApi.messages(selected.id)
      .then((result) => {
        if (!active) return
        setMessages(result.messages)
        loadConversations()
      })
      .catch((loadError) => { if (active) setError(loadError.message) })
      .finally(() => { if (active) setLoadingMessages(false) })
    return () => { active = false }
  }, [isNotificationsView, selected, loadConversations])

  async function send(event) {
    event.preventDefault()
    if (!draft.trim() || !selected) return
    try {
      await communicationApi.sendMessage(selected.id, draft)
      setDraft('')
      const result = await communicationApi.messages(selected.id)
      setMessages(result.messages)
      loadConversations()
    } catch (sendError) {
      setError(sendError.message)
    }
  }

  async function markAllRead() {
    try {
      await communicationApi.markAllNotificationsRead()
      setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })))
    } catch (readError) {
      setError(readError.message)
    }
  }

  async function openNotification(notification) {
    if (!notification.read_at) {
      try {
        await communicationApi.markNotificationRead(notification.id)
        setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item))
      } catch (readError) {
        setError(readError.message)
        return
      }
    }
    const path = notificationPath(notification, user)
    if (path) navigate(path)
  }

  return (
    <main className="marketplace-page protected-page">
      <AppSidebar />
      <section className="container communication-content">
        <div className="communication-heading">
          <div>
            <p className="eyebrow">{isNotificationsView ? 'Stay updated' : 'Stay connected'}</p>
            <h1>{isNotificationsView ? 'Notifications.' : 'Messages.'}</h1>
            <p className="communication-lead">
              {isNotificationsView
                ? 'Review inquiry, offer, agreement, booking, approval, and messaging updates.'
                : 'Select a conversation below to open its message thread.'}
            </p>
          </div>
          {isNotificationsView ? (
            <div className="inline-actions">
              <button className="table-action" type="button" onClick={markAllRead}>Mark all notifications read</button>
              {user?.role === 'clerk' ? (
                <Link className="button button-outline" to="/dashboard?tab=payments">Open payment desk</Link>
              ) : (
                <Link className="button button-outline" to="/messages">Open messages</Link>
              )}
            </div>
          ) : (
            <Link className="button button-outline" to="/notifications">View notifications</Link>
          )}
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        {isNotificationsView ? (
          <section className="dashboard-panel notification-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Activity feed</p>
                <h2>All notifications</h2>
              </div>
              <div className="inline-actions">
                <button
                  className={notifFilter === 'all' ? 'button button-sm' : 'button button-outline button-sm'}
                  type="button"
                  onClick={() => { setNotifFilter('all'); setVisibleNotifCount(10) }}
                >
                  All ({notifications.length})
                </button>
                <button
                  className={notifFilter === 'unread' ? 'button button-sm' : 'button button-outline button-sm'}
                  type="button"
                  onClick={() => { setNotifFilter('unread'); setVisibleNotifCount(10) }}
                >
                  Unread ({notifications.filter((n) => !n.read_at).length})
                </button>
              </div>
            </div>
            {(() => {
              const filtered = notifFilter === 'unread'
                ? notifications.filter((n) => !n.read_at)
                : notifications
              const shown = filtered.slice(0, visibleNotifCount)
              return (
                <>
                  {filtered.length === 0 && (
                    <p className="form-note" style={{ marginTop: '14px' }}>
                      {notifFilter === 'unread' ? 'You are all caught up — no unread notifications.' : 'No notifications yet.'}
                    </p>
                  )}
                  <div className="notification-list notification-feed-compact">
                    {shown.map((notification) => (
                      <button
                        className={`notification-item${notification.read_at ? '' : ' is-unread'}`}
                        type="button"
                        onClick={() => openNotification(notification)}
                        key={notification.id}
                      >
                        <span className="notification-icon" aria-hidden="true" />
                        <div className="notification-body">
                          <div className="notification-row-top">
                            <strong>{notification.title}</strong>
                            <small>{new Date(notification.created_at).toLocaleString()}</small>
                          </div>
                          <p>{notification.message}</p>
                        </div>
                        {notificationPath(notification, user) && <span className="notification-link">Open</span>}
                      </button>
                    ))}
                  </div>
                  {filtered.length > visibleNotifCount && (
                    <div style={{ marginTop: '16px', textAlign: 'center' }}>
                      <button
                        className="button button-outline"
                        type="button"
                        onClick={() => setVisibleNotifCount((c) => c + 10)}
                      >
                        Show more ({filtered.length - visibleNotifCount} remaining)
                      </button>
                    </div>
                  )}
                </>
              )
            })()}
          </section>
        ) : (
          <div className={`communication-grid${selected ? ' has-selected' : ' is-inbox-only'}`}>
            <aside className="dashboard-panel conversation-list">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Your inbox</p>
                  <h2>Conversations</h2>
                </div>
                <span className="panel-count">{conversations.length}</span>
              </div>
              <p className="panel-description">Click a conversation to view and reply to messages.</p>
              {conversations.length === 0 && <p className="form-note">Your conversations will appear here.</p>}
              {conversations.map((conversation) => (
                <Conversation
                  key={conversation.id}
                  conversation={conversation}
                  selected={selected?.id === conversation.id}
                  onSelect={(conv) => {
                    setError('')
                    setMessages([])
                    setLoadingMessages(true)
                    setSelected(conv)
                  }}
                />
              ))}
            </aside>
            {selected && (
              <section className="dashboard-panel message-panel">
                <div className="panel-heading">
                  <div>
                    <p className="panel-kicker">Message thread</p>
                    <h2>{selected.other_party_name || 'Conversation'}</h2>
                    {selected.inquiry_subject && <small className="form-note">{selected.inquiry_subject}</small>}
                  </div>
                  <div className="inline-actions">
                    <span className="conversation-status">Active conversation</span>
                    <button className="table-action" type="button" onClick={() => setSelected(null)}>
                      <ArrowLeft size={14} /> Close
                    </button>
                  </div>
                </div>
                <div className="message-history">
                  {loadingMessages && <p className="form-note">Loading messages...</p>}
                  {!loadingMessages && messages.length === 0 && <p className="form-note">No messages yet. Start the conversation.</p>}
                  {!loadingMessages && messages.map((message) => (
                    <div className={`message-bubble${message.sender_id === user.id ? ' message-own' : ''}`} key={message.id}>
                      <p>{message.message_text}</p>
                      <small>{new Date(message.sent_at).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
                <form className="message-form" onSubmit={send}>
                  <input
                    aria-label="Message"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength="5000"
                    placeholder="Write a message..."
                  />
                  <button className="button" type="submit"><Send size={16} /> Send</button>
                </form>
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
