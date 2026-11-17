import { useEffect, useState } from 'react'
import { ExternalLink, Send, Sparkles, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchAiUsage, requestGardenPlan } from '../services/ai'

const QUICK_PROMPTS = [
  'Low-maintenance plants for a sunny balcony in Zamboanga City?',
  'Small front yard tropical layout ideas?',
]

export default function AiAssistantWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || usage) return
    fetchAiUsage().then(setUsage).catch(() => {})
  }, [open, usage])

  async function sendPrompt(textToSend) {
    const prompt = textToSend.trim()
    if (!prompt || loading) return
    setError('')
    setLoading(true)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: prompt }])
    try {
      const result = await requestGardenPlan(prompt)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: result.answer,
          model: result.model,
          fallbackUsed: Boolean(result.fallbackUsed),
        },
      ])
      fetchAiUsage().then(setUsage).catch(() => {})
    } catch (err) {
      setError(err.message)
      fetchAiUsage().then(setUsage).catch(() => {})
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ai-chat-dock">
      {open && (
        <section className="ai-chat-window" aria-label="AI Garden Assistant chat">
          <header className="ai-chat-header">
            <div className="ai-chat-title">
              <span className="ai-chat-badge" aria-hidden="true"><Sparkles size={15} /></span>
              <div>
                <strong>AI Garden Assistant</strong>
                <small>
                  {usage ? `${usage.remaining}/${usage.limit} hourly left` : 'Zamboanga garden ideas'}
                </small>
              </div>
            </div>
            <div className="ai-chat-header-actions">
              <Link to="/assistant" onClick={() => setOpen(false)} title="Open full assistant page" aria-label="Open full assistant page">
                <ExternalLink size={15} />
              </Link>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close AI assistant">
                <X size={16} />
              </button>
            </div>
          </header>

          <div className="ai-chat-body">
            {messages.length === 0 && (
              <div className="ai-chat-welcome">
                <p>Ask for plant suggestions, small-space layouts, or care tips tailored to Zamboanga City.</p>
                <div className="ai-chat-prompts">
                  {QUICK_PROMPTS.map((sample) => (
                    <button key={sample} type="button" onClick={() => sendPrompt(sample)}>
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div className={`ai-chat-msg ai-chat-msg-${msg.role}`} key={idx}>
                <p>{msg.text}</p>
                {msg.model && (
                  <small>
                    {msg.model}{msg.fallbackUsed ? ' (fallback)' : ''} · Informational only
                  </small>
                )}
              </div>
            ))}

            {loading && <p className="ai-chat-status">Thinking...</p>}
            {error && <div className="form-error" role="alert">{error}</div>}
          </div>

          <form
            className="ai-chat-form"
            onSubmit={(e) => {
              e.preventDefault()
              sendPrompt(input)
            }}
          >
            <input
              aria-label="Ask AI Garden Assistant"
              value={input}
              maxLength="3000"
              placeholder="Ask about plants, soil, layout..."
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="button" type="submit" disabled={loading || !input.trim()} aria-label="Send message to AI assistant">
              <Send size={15} />
            </button>
          </form>
        </section>
      )}

      <button
        className="ai-chat-fab"
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={open ? 'Close AI Garden Assistant' : 'Open AI Garden Assistant'}
      >
        {open ? <X size={18} /> : <Sparkles size={18} />}
        <span>AI Garden Assistant</span>
      </button>
    </div>
  )
}
