import { useState } from 'react'
import { ArrowLeft, Leaf, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { requestGardenPlan } from '../services/ai'

const promptExamples = [
  'I have a small sunny balcony in Zamboanga City. What low-maintenance plants could work?',
  'Suggest a simple tropical garden layout for a small front yard.',
  'How can I maintain herbs in containers during the rainy season?',
]

export default function AssistantPage() {
  const [input, setInput] = useState('')
  const [answer, setAnswer] = useState('')
  const [disclaimer, setDisclaimer] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setLoading(true); setError(''); setAnswer('')
    try { const result = await requestGardenPlan(input); setAnswer(result.answer); setDisclaimer(result.disclaimer) } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }

  return <main className="marketplace-page"><header className="dashboard-header container"><Link className="brand" to="/"><span className="brand-mark"><Leaf size={19} /></span><span>Huga<span>Tiera</span></span></Link><Link className="button button-outline" to="/dashboard">Dashboard</Link></header><section className="container assistant-page-content"><Link className="back-link" to="/"><ArrowLeft size={15} /> Back home</Link><div className="assistant-page-heading"><span className="assistant-icon"><Sparkles size={25} /></span><div><p className="eyebrow">Garden Planning Assistant</p><h1>Turn a garden idea into a practical starting point.</h1></div></div><p className="assistant-page-intro">Describe your space, light, goals, and preferences. The assistant can suggest plants, layouts, and basic care ideas for your next conversation with a gardener.</p><div className="assistant-layout"><form className="dashboard-panel profile-form assistant-form" onSubmit={submit}><label htmlFor="garden-request">What would you like help with?<textarea id="garden-request" required maxLength="3000" rows="9" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Example: I have a shaded 3m x 4m home garden and want a low-maintenance tropical style." /></label><small className="field-note">{input.length}/3000 characters</small>{error && <div className="form-error" role="alert">{error}</div>}<button className="button" type="submit" disabled={loading}>{loading ? 'Thinking...' : 'Create garden suggestions'}</button><p className="assistant-disclaimer">Suggestions are informational and should be checked with a qualified local gardening professional.</p></form><aside className="assistant-examples dashboard-panel"><h2>Try asking about</h2>{promptExamples.map((example) => <button type="button" key={example} onClick={() => setInput(example)}>{example}</button>)}</aside></div>{answer && <article className="dashboard-panel assistant-answer"><p className="eyebrow">Your garden plan</p><div className="assistant-answer-text">{answer}</div><p className="assistant-disclaimer">{disclaimer}</p></article>}</section></main>
}
