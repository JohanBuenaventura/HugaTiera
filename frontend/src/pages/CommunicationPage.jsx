import { useCallback, useEffect, useState } from 'react'
import { Leaf, Send } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { communicationApi } from '../services/communication'

function Header() {
  return <header className="dashboard-header container"><Link className="brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link><Link className="button button-outline" to="/dashboard">Dashboard</Link></header>
}

function Conversation({ conversation, onSelect, selected }) {
  return <button className={`conversation-item${selected ? ' is-selected' : ''}`} type="button" onClick={() => onSelect(conversation)}><strong>{conversation.other_party_name || 'Conversation'}</strong><span>{conversation.inquiry_subject || 'General conversation'}</span><small>{conversation.latest_message || 'No messages yet'}</small>{conversation.unread_count > 0 && <b>{conversation.unread_count}</b>}</button>
}

function notificationPath(notification) {
  if (notification.related_entity_type === 'inquiry') return `/inquiries/${notification.related_entity_id}`
  if (notification.related_entity_type === 'booking') return `/bookings/${notification.related_entity_id}`
  if (notification.related_entity_type === 'conversation') return `/messages?conversationId=${notification.related_entity_id}`
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
    const path = notificationPath(notification)
    if (path) navigate(path)
  }

  return <main className="marketplace-page"><Header /><section className="container communication-content"><div className="communication-heading"><div><p className="eyebrow">Stay connected</p><h1>Messages and notifications.</h1><p className="communication-lead">Keep conversations, updates, and next steps in one clear workspace.</p></div><button className="table-action" type="button" onClick={markAllRead}>Mark notifications read</button></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="communication-grid"><aside className="dashboard-panel conversation-list"><div className="panel-heading"><div><p className="panel-kicker">Your inbox</p><h2>Conversations</h2></div><span className="panel-count">{conversations.length}</span></div><p className="panel-description">Messages with clients and gardeners.</p>{conversations.length === 0 && <p className="form-note">Your conversations will appear here.</p>}{conversations.map((conversation) => <Conversation key={conversation.id} conversation={conversation} selected={selected?.id === conversation.id} onSelect={setSelected} />)}</aside><section className="dashboard-panel message-panel"><div className="panel-heading"><div><p className="panel-kicker">Message thread</p><h2>{selected ? selected.other_party_name : 'Select a conversation'}</h2></div>{selected && <span className="conversation-status">Active conversation</span>}</div>{selected ? <><div className="message-history">{messages.length === 0 && <p className="form-note">No messages yet. Start the conversation.</p>}{messages.map((message) => <div className={`message-bubble${message.sender_id === user.id ? ' message-own' : ''}`} key={message.id}><p>{message.message_text}</p><small>{new Date(message.sent_at).toLocaleString()}</small></div>)}</div><form className="message-form" onSubmit={send}><input aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength="5000" placeholder="Write a message..." /><button className="button" type="submit"><Send size={16} /> Send</button></form></> : <p className="form-note message-empty">Choose a conversation to view its message history.</p>}</section><aside className="dashboard-panel notification-panel"><div className="panel-heading"><div><p className="panel-kicker">Stay updated</p><h2>Notifications</h2></div><span className="panel-count">{notifications.filter((notification) => !notification.read_at).length} unread</span></div><p className="panel-description">Inquiry, booking, approval, and messaging updates.</p>{notifications.length === 0 && <p className="form-note">No notifications yet.</p>}<div className="notification-list">{notifications.map((notification) => <button className={`notification-item${notification.read_at ? '' : ' is-unread'}`} type="button" onClick={() => openNotification(notification)} key={notification.id}><span className="notification-icon" aria-hidden="true" /><div><strong>{notification.title}</strong><p>{notification.message}</p><small>{new Date(notification.created_at).toLocaleString()}</small>{notificationPath(notification) && <span className="notification-link">Open related item</span>}</div></button>)}</div></aside></div></section></main>
}
