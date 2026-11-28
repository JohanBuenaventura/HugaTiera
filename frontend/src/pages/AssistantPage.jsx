import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Leaf, MessageSquare, PanelLeft, Plus, Send, Sparkles, Sprout, Sun, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { fetchAiUsage, requestGardenPlan } from '../services/ai'
import AppSidebar from '../components/AppSidebar'
import { GardenPlanningIllustration } from '../components/BotanicalIllustrations'

const promptExamples = [
  {
    title: 'Sunny balcony plants',
    prompt: 'I have a small sunny balcony in Zamboanga City. What low-maintenance plants could work?',
    Icon: Sun,
  },
  {
    title: 'Front yard tropical layout',
    prompt: 'Suggest a simple tropical garden layout for a small front yard.',
    Icon: Leaf,
  },
  {
    title: 'Rainy-season herb care',
    prompt: 'How can I maintain herbs in containers during the rainy season?',
    Icon: Sprout,
  },
]

function getStorageKey(userId) {
  return `hugatiera.assistant.chats.${userId || 'guest'}`
}

function loadSavedChats(userId) {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveChats(userId, chats) {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(chats.slice(0, 20)))
  } catch {
    // Ignore storage errors
  }
}

export default function AssistantPage() {
  const { user } = useAuth()
  const [input, setInput] = useState('')
  const [chats, setChats] = useState(() => loadSavedChats(user?.id))
  const [activeChatId, setActiveChatId] = useState(() => loadSavedChats(user?.id)[0]?.id || null)
  const [historyOpen, setHistoryOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 960 : true))
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const threadEndRef = useRef(null)
  const nextIdRef = useRef(0)

  const activeChat = chats.find((c) => c.id === activeChatId) || null
  const messages = activeChat?.messages || []

  useEffect(() => {
    fetchAiUsage().then(setUsage).catch(() => {})
  }, [])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages.length, loading, activeChatId])

  function updateChats(updater) {
    setChats((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveChats(user?.id, next)
      return next
    })
  }

  function startNewChat() {
    setActiveChatId(null)
    setError('')
    setInput('')
  }

  function deleteChat(chatId, event) {
    event.stopPropagation()
    updateChats((prev) => {
      const next = prev.filter((c) => c.id !== chatId)
      if (activeChatId === chatId) {
        setActiveChatId(next[0]?.id || null)
      }
      return next
    })
  }

  async function sendPrompt(rawText) {
    const prompt = rawText.trim()
    if (!prompt || loading) return
    setLoading(true)
    setError('')
    setInput('')
    nextIdRef.current += 1
    const userMsg = { id: `u-${nextIdRef.current}`, role: 'user', text: prompt }

    let targetChatId = activeChatId
    if (!targetChatId) {
      nextIdRef.current += 1
      targetChatId = `chat-${nextIdRef.current}-${prompt.slice(0, 12)}`
      const title = prompt.length > 36 ? `${prompt.slice(0, 36)}…` : prompt
      const newChat = { id: targetChatId, title, messages: [userMsg] }
      setActiveChatId(targetChatId)
      updateChats((prev) => [newChat, ...prev])
    } else {
      updateChats((prev) => prev.map((c) => (
        c.id === targetChatId ? { ...c, messages: [...c.messages, userMsg] } : c
      )))
    }

    try {
      const result = await requestGardenPlan(prompt)
      nextIdRef.current += 1
      const aiMsg = {
        id: `a-${nextIdRef.current}`,
        role: 'assistant',
        text: result.answer,
        disclaimer: result.disclaimer,
      }
      updateChats((prev) => prev.map((c) => (
        c.id === targetChatId ? { ...c, messages: [...c.messages, aiMsg] } : c
      )))
      fetchAiUsage().then(setUsage).catch(() => {})
    } catch (requestError) {
      setError(requestError.message)
      fetchAiUsage().then(setUsage).catch(() => {})
    } finally {
      setLoading(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    sendPrompt(input)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendPrompt(input)
    }
  }

  return (
    <main className={`marketplace-page protected-page${['client', 'gardener'].includes(user?.role) ? ' member-workspace' : ''}`} data-workspace={user?.role}>
      <AppSidebar />
      <section className="assistant-gemini-workspace" id="main-content" tabIndex={-1}>
        <header className="assistant-gemini-header">
          <div className="assistant-gemini-brand">
            <Link className="assistant-gemini-back" to={user ? '/dashboard' : '/'} aria-label={user ? 'Back to dashboard' : 'Back home'}>
              <ArrowLeft size={18} />
            </Link>
            <button
              type="button"
              className="assistant-gemini-back"
              onClick={() => setHistoryOpen((open) => !open)}
              aria-label={historyOpen ? 'Hide chat list' : 'Show chat list'}
              aria-expanded={historyOpen}
              title={historyOpen ? 'Hide chat list' : 'Show chat list'}
            >
              <PanelLeft size={18} />
            </button>
            <div className="assistant-gemini-title">
              <Sparkles size={16} className="assistant-gemini-spark" aria-hidden="true" />
              <strong>{activeChat?.title || 'Garden Assistant'}</strong>
              <span>Zamboanga City</span>
            </div>
          </div>
          <div className="assistant-gemini-actions">
            {usage && (
              <span className="assistant-gemini-quota" title="Hourly AI requests remaining">
                {usage.remaining}/{usage.limit} left
              </span>
            )}
            <button
              type="button"
              className="assistant-gemini-newchat"
              onClick={startNewChat}
            >
              <Plus size={15} /> New chat
            </button>
          </div>
        </header>

        <div className="assistant-gemini-body">
          {historyOpen && (
            <aside className="assistant-gemini-history" aria-label="Previous garden chats">
              <div className="assistant-history-head">
                <span>Your chats</span>
                <button type="button" className="assistant-history-add" onClick={startNewChat} aria-label="Start new chat" title="New chat">
                  <Plus size={14} />
                </button>
              </div>
              {chats.length === 0 ? (
                <p className="assistant-history-empty">No saved chats yet. Ask a question to start your first one.</p>
              ) : (
                <ul className="assistant-history-list">
                  {chats.map((chat) => {
                    const isActive = chat.id === activeChatId
                    return (
                      <li key={chat.id}>
                        <div
                          className={`assistant-history-item${isActive ? ' is-active' : ''}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => { setActiveChatId(chat.id); setError('') }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setActiveChatId(chat.id)
                              setError('')
                            }
                          }}
                        >
                          <MessageSquare size={14} className="assistant-history-icon" aria-hidden="true" />
                          <span className="assistant-history-title">{chat.title}</span>
                          <button
                            type="button"
                            className="assistant-history-del"
                            aria-label={`Delete chat ${chat.title}`}
                            onClick={(e) => deleteChat(chat.id, e)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </aside>
          )}

          <div className="assistant-gemini-main">
            <div className="assistant-gemini-scroll" role="log" aria-live="polite">
          <div className="assistant-gemini-column">
            {messages.length === 0 ? (
              <div className="assistant-gemini-welcome">
                <div className="assistant-gemini-art">
                  <GardenPlanningIllustration />
                </div>
                <strong>Hi, How can i help you today?</strong>
                <p className="assistant-gemini-greeting">
                  Hi {user?.firstName || 'there'},
                </p>
                <h1>Where should we start your garden?</h1>
                <div className="assistant-gemini-prompts">
                  {promptExamples.map(({ title, prompt, Icon }) => (
                    <button
                      type="button"
                      key={title}
                      className="assistant-gemini-prompt-card"
                      onClick={() => sendPrompt(prompt)}
                    >
                      <span className="assistant-gemini-prompt-icon" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <strong>{title}</strong>
                      <span>{prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="assistant-gemini-messages">
                {messages.map((msg) => (
                  <div key={msg.id} className={`assistant-gemini-turn assistant-gemini-turn--${msg.role}`}>
                    {msg.role === 'user' ? (
                      <div className="assistant-gemini-user-pill">{msg.text}</div>
                    ) : (
                      <div className="assistant-gemini-reply">
                        <div className="assistant-gemini-avatar" aria-hidden="true">
                          <Sparkles size={15} />
                        </div>
                        <div className="assistant-gemini-reply-body">
                          <div className="assistant-bubble-text">{msg.text}</div>
                          {msg.disclaimer && (
                            <p className="assistant-bubble-disclaimer">{msg.disclaimer}</p>
                          )}
                          {user?.role === 'client' && (
                            <div className="inline-actions" style={{ marginTop: '12px' }}>
                              <Link className="button button-sm" to="/inquiries/new?type=general">
                                Post as service request <ArrowRight size={14} />
                              </Link>
                              <Link className="button button-outline button-sm" to="/services">
                                Browse gardeners
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {loading && (
              <div className="assistant-gemini-reply" aria-label="AI is thinking">
                <div className="assistant-gemini-avatar" aria-hidden="true">
                  <Sparkles size={15} />
                </div>
                <div className="assistant-gemini-reply-body">
                  <div className="assistant-typing-dots">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}

            {error && <div className="form-error" role="alert" style={{ marginTop: '12px' }}>{error}</div>}
            <div ref={threadEndRef} />
          </div>
        </div>

        <div className="assistant-gemini-composer-dock">
          <form className="assistant-gemini-composer" onSubmit={submit}>
            <textarea
              id="garden-request"
              aria-label="Ask Garden Assistant"
              required
              maxLength="3000"
              rows="1"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about plants, yard layouts, or care tips..."
            />
            <button
              className="assistant-gemini-send"
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </form>
          <p className="assistant-gemini-footnote">
            Garden Assistant gives informational suggestions · {input.length}/3000
          </p>
        </div>
          </div>
        </div>
      </section>
    </main>
  )
}
