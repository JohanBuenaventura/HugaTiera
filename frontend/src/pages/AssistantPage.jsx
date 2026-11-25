import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { fetchAiUsage, requestGardenPlan } from '../services/ai'
import AppSidebar from '../components/AppSidebar'

const promptExamples = [
  'I have a small sunny balcony in Zamboanga City. What low-maintenance plants could work?',
  'Suggest a simple tropical garden layout for a small front yard.',
  'How can I maintain herbs in containers during the rainy season?',
]

export default function AssistantPage() {
  const { user } = useAuth()
  const [input, setInput] = useState('')
  const [answer, setAnswer] = useState('')
  const [disclaimer, setDisclaimer] = useState('')
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchAiUsage().then(setUsage).catch(() => {})
  }, [])

  async function submit(event) {
    event.preventDefault()
    setLoading(true); setError(''); setAnswer('')
    try {
      const result = await requestGardenPlan(input)
      setAnswer(result.answer)
      setDisclaimer(result.disclaimer)
      fetchAiUsage().then(setUsage).catch(() => {})
    } catch (requestError) {
      setError(requestError.message)
      fetchAiUsage().then(setUsage).catch(() => {})
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={`marketplace-page protected-page${['client', 'gardener'].includes(user?.role) ? ' member-workspace' : ''}`} data-workspace={user?.role}>
      <AppSidebar />
      <section className="container assistant-page-content">
        <Link className="back-link" to={user ? '/dashboard' : '/'}>
          <ArrowLeft size={15} /> {user ? 'Back to dashboard' : 'Back home'}
        </Link>
        <div className="assistant-page-heading">
          <span className="assistant-icon"><Sparkles size={25} /></span>
          <div>
            <h1>Turn a garden idea into a practical starting point.</h1>
          </div>
        </div>
        <p className="assistant-page-intro">
          Describe your yard, sunlight, and what you want to achieve. The assistant will suggest plants, layout ideas, and simple next steps before you talk to a local gardener.
        </p>
        {usage && (
          <p className="form-note" style={{ marginBottom: '12px' }}>
            You have <strong>{usage.remaining}</strong> of <strong>{usage.limit}</strong> AI questions remaining this hour.
          </p>
        )}
        <div className="assistant-layout">
          <form className="dashboard-panel profile-form assistant-form" onSubmit={submit}>
            <label htmlFor="garden-request">
              What would you like help with?
              <textarea
                id="garden-request"
                required
                maxLength="3000"
                rows="9"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Example: I have a shaded 3m x 4m home garden and want a low-maintenance tropical style."
              />
            </label>
            <small className="field-note">{input.length}/3000 characters</small>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button" type="submit" disabled={loading}>
              {loading ? 'Thinking...' : 'Get garden ideas'}
            </button>
            <p className="assistant-disclaimer">
              Suggestions are informational and should be checked with a qualified local gardening professional.
            </p>
          </form>
          <aside className="assistant-examples dashboard-panel">
            <h2>Tap an example to try</h2>
            {promptExamples.map((example) => (
              <button type="button" key={example} onClick={() => setInput(example)}>{example}</button>
            ))}
          </aside>
        </div>
        {answer && (
          <article className="dashboard-panel assistant-answer">
            <p className="eyebrow">Your garden plan</p>
            <div className="assistant-answer-text">{answer}</div>
            <p className="assistant-disclaimer">{disclaimer}</p>
            {user?.role === 'client' && (
              <div className="inline-actions" style={{ marginTop: '14px' }}>
                <Link className="button button-sm" to="/inquiries/new?type=general">
                  Post this as a service request <ArrowRight size={15} />
                </Link>
                <Link className="button button-outline button-sm" to="/services">
                  Browse local gardeners
                </Link>
              </div>
            )}
          </article>
        )}
      </section>
    </main>
  )
}
