import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Send, Sparkles, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchAiUsage, requestGardenPlanStream } from '../services/ai'

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
  const bodyRef = useRef(null)
  const msgCounterRef = useRef(0)

  useEffect(() => {
    if (!open || usage) return
    fetchAiUsage().then(setUsage).catch(() => {})
  }, [open, usage])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, loading])

  async function sendPrompt(textToSend) {
    const prompt = textToSend.trim()
    if (!prompt || loading) return
    setError('')
    setLoading(true)
    setInput('')
    msgCounterRef.current += 1
    const msgId = msgCounterRef.current
    setMessages((prev) => [
      ...prev,
      { id: `${msgId}-u`, role: 'user', text: prompt },
      { id: `${msgId}-a`, role: 'assistant', text: '', streaming: true },
    ])
    try {
      const result = await requestGardenPlanStream(prompt, {
        onChunk: (_piece, fullSoFar) => {
          setMessages((prev) => prev.map((m) => (
            m.id === `${msgId}-a` ? { ...m, text: fullSoFar } : m
          )))
        },
      })
      setMessages((prev) => prev.map((m) => (
        m.id === `${msgId}-a`
          ? { ...m, text: result?.answer || m.text, streaming: false }
          : m
      )))
      fetchAiUsage().then(setUsage).catch(() => {})
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== `${msgId}-a` || m.text))
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

          <div className="ai-chat-body" ref={bodyRef}>
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
              <div className={`ai-chat-msg ai-chat-msg-${msg.role}`} key={msg.id || idx}>
                <p>{msg.text || (msg.streaming ? 'Thinking...' : '')}</p>
                {msg.role === 'assistant' && !msg.streaming && msg.text && (
                  <small>Informational only · Verify with a local gardener</small>
                )}
              </div>
            ))}

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
