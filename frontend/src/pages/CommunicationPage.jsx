import { useCallback, useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { communicationApi } from '../services/communication'
import AppSidebar from '../components/AppSidebar'

function Conversation({ conversation, onSelect, selected }) {
  return <button className={`conversation-item${selected ? ' is-selected' : ''}`} type="button" onClick={() => onSelect(conversation)}><strong>{conversation.other_party_name || 'Conversation'}</strong><span>{conversation.inquiry_subject || 'General conversation'}</span><small>{conversation.latest_message || 'No messages yet'}</small>{conversation.unread_count > 0 && <b>{conversation.unread_count}</b>}</button>
}

function notificationPath(notification, user) {
  if (notification.related_entity_type === 'inquiry') return `/inquiries/${notification.related_entity_id}`
  if (notification.related_entity_type === 'booking') return `/bookings/${notification.related_entity_id}`
  if (notification.related_entity_type === 'conversation') return `/messages?conversationId=${notification.related_entity_id}`
  if (notification.related_entity_type === 'review') return user?.role === 'gardener' ? `/gardeners/${user.id}` : '/bookings'
  if (notification.related_entity_type === 'gardener_profile') return '/dashboard'
  return null
}

export default function CommunicationPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [conversations, setConversations] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [notifications, setNotifications] = useState([])
  const [error, setError] = useState('')

  const loadConversations = useCallback(() => communicationApi.conversations().then((result) => { setConversations(result.conversations); if (!selected && params.get('conversationId')) setSelected(result.conversations.find((item) => item.id === Number(params.get('conversationId'))) || null) }).catch((loadError) => setError(loadError.message)), [params, selected])
  useEffect(() => { loadConversations(); communicationApi.notifications().then((result) => setNotifications(result.notifications)).catch((loadError) => setError(loadError.message)) }, [loadConversations])
  useEffect(() => { if (selected) communicationApi.messages(selected.id).then((result) => { setMessages(result.messages); loadConversations() }).catch((loadError) => setError(loadError.message)) }, [selected, loadConversations])

  async function send(event) {
    event.preventDefault()
    if (!draft.trim() || !selected) return
    try { await communicationApi.sendMessage(selected.id, draft); setDraft(''); const result = await communicationApi.messages(selected.id); setMessages(result.messages); loadConversations() } catch (sendError) { setError(sendError.message) }
  }

  async function markAllRead() {
    try { await communicationApi.markAllNotificationsRead(); setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))) } catch (readError) { setError(readError.message) }
  }

  async function openNotification(notification) {
    if (!notification.read_at) {
      try {
        await communicationApi.markNotificationRead(notification.id)
        setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item))
      } catch (readError) { setError(readError.message); return }
    }
    const path = notificationPath(notification, user)
    if (path) navigate(path)
  }

  return (
    <main className="marketplace-page protected-page">
      <AppSidebar />
      <section className="container communication-content">
        <div className="communication-heading">
          <h1>Messages</h1>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="communication-grid">
          <div className="dashboard-panel communication-workspace">
            <aside className="conversation-list">
              <div className="panel-heading">
                <h2>Conversations</h2>
                <span className="panel-count">{conversations.length}</span>
              </div>
              <p className="panel-description">Messages with clients and gardeners.</p>
              {conversations.length === 0 && <p className="form-note">Your conversations will appear here.</p>}
              {conversations.map((conversation) => (
                <Conversation
                  key={conversation.id}
                  conversation={conversation}
                  selected={selected?.id === conversation.id}
                  onSelect={setSelected}
                />
              ))}
            </aside>
            <section className="message-panel">
              <div className="panel-heading">
                <h2>{selected ? selected.other_party_name : 'Select a conversation'}</h2>
                {selected && <span className="conversation-status">Active conversation</span>}
              </div>
              {selected ? <>
                <div className="message-history">
                  {messages.length === 0 && <p className="form-note">No messages yet. Start the conversation.</p>}
                  {messages.map((message) => (
                    <div className={`message-bubble${message.sender_id === user.id ? ' message-own' : ''}`} key={message.id}>
                      <p>{message.message_text}</p>
                      <small>{new Date(message.sent_at).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
                <form className="message-form" onSubmit={send}>
                  <input aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength="5000" placeholder="Write a message..." />
                  <button className="button" type="submit"><Send size={16} /> Send</button>
                </form>
              </> : <>
                <p className="form-note message-empty">Select a conversation to view its message history.</p>
                <form className="message-form" onSubmit={(event) => event.preventDefault()}>
                  <input aria-label="Message" disabled placeholder="Select a conversation to write a message" />
                  <button className="button" type="button" disabled><Send size={16} /> Send</button>
                </form>
              </>}
            </section>
          </div>
          <aside className="dashboard-panel notification-panel">
            <div className="panel-heading">
              <h2>Notifications</h2>
              <div className="notification-panel-actions">
                <button className="table-action" type="button" onClick={markAllRead}>Mark all as read</button>
                <span className="panel-count">{notifications.filter((notification) => !notification.read_at).length} unread</span>
              </div>
            </div>
            <p className="panel-description">Inquiry, booking, approval, review, and messaging updates.</p>
            {notifications.length === 0 && <p className="form-note">No notifications yet.</p>}
            <div className="notification-list">
              {notifications.map((notification) => (
                <button
                  className={`notification-item${notification.read_at ? '' : ' is-unread'}`}
                  type="button"
                  onClick={() => openNotification(notification)}
                  key={notification.id}
                >
                  <span className="notification-icon" aria-hidden="true" />
                  <div>
                    <strong>{notification.title}</strong>
                    <p>{notification.message}</p>
                    <small>{new Date(notification.created_at).toLocaleString()}</small>
                    {notificationPath(notification, user) && <span className="notification-link">Open related item</span>}
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
