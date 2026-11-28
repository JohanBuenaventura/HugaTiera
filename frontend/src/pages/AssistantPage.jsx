import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Download, ExternalLink, ImagePlus, Sparkles, Wand2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { fetchAiUsage, requestGardenImagePreview, requestGardenPlanStream } from '../services/ai'
import { getRequestImageUrl } from '../services/requestImages'
import AppSidebar from '../components/AppSidebar'

const promptExamples = [
  'I have a small sunny balcony in Zamboanga City. What low-maintenance plants could work?',
  'Suggest a simple tropical garden layout for a small front yard.',
  'How can I maintain herbs in containers during the rainy season?',
]

const visualEditExamples = [
  'Remove dry yellowish grass and loose pebbles, trim the lawn evenly, and add flowering bougainvillea along the fence.',
  'Clear overgrown weeds along the concrete wall and add a neat stepping-stone walkway with tropical foliage plants.',
  'Keep the patio and walls intact, replace bare soil with trimmed carabao grass, and add potted palms in the corners.',
]

function renderInlineBold(text, keyPrefix) {
  const segments = String(text).split(/(\*\*[^*]+\*\*)/g)
  return segments.map((segment, idx) => {
    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      return <strong key={`${keyPrefix}-b-${idx}`}>{segment.slice(2, -2)}</strong>
    }
    return segment
  })
}

function renderFormattedPlan(rawText) {
  const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let listItems = []
  let listOrdered = false

  const flushList = (keyIdx) => {
    if (listItems.length === 0) return
    const Tag = listOrdered ? 'ol' : 'ul'
    blocks.push(
      <Tag className="assistant-plan-list" key={`list-${keyIdx}`}>
        {listItems.map((item, idx) => (
          <li key={`li-${keyIdx}-${idx}`}>{renderInlineBold(item, `li-${keyIdx}-${idx}`)}</li>
        ))}
      </Tag>,
    )
    listItems = []
  }

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      flushList(index)
      return
    }
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      flushList(index)
      blocks.push(
        <h3 className="assistant-plan-heading" key={`h-${index}`}>
          {renderInlineBold(headingMatch[2], `h-${index}`)}
        </h3>,
      )
      return
    }
    const bulletMatch = /^[-*•]\s+(.+)$/.exec(trimmed)
    if (bulletMatch) {
      if (listItems.length > 0 && listOrdered) flushList(index)
      listOrdered = false
      listItems.push(bulletMatch[1])
      return
    }
    const orderedMatch = /^\d+[.)]\s+(.+)$/.exec(trimmed)
    if (orderedMatch) {
      if (listItems.length > 0 && !listOrdered) flushList(index)
      listOrdered = true
      listItems.push(orderedMatch[1])
      return
    }
    flushList(index)
    blocks.push(
      <p className="assistant-plan-para" key={`p-${index}`}>
        {renderInlineBold(trimmed, `p-${index}`)}
      </p>,
    )
  })
  flushList(lines.length)
  return blocks
}

export default function AssistantPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('chat')
  const [input, setInput] = useState('')
  const [answer, setAnswer] = useState('')
  const [disclaimer, setDisclaimer] = useState('')
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Visual Garden Preview (photo editing) state
  const [visualFile, setVisualFile] = useState(null)
  const [visualUploadedOriginalId, setVisualUploadedOriginalId] = useState(null)
  const [visualInstructions, setVisualInstructions] = useState('')
  const [visualLoading, setVisualLoading] = useState(false)
  const [visualError, setVisualError] = useState('')
  const [visualResult, setVisualResult] = useState(null)

  const visualLocalPreview = useMemo(() => (visualFile ? URL.createObjectURL(visualFile) : ''), [visualFile])

  useEffect(() => {
    fetchAiUsage().then(setUsage).catch(() => {})
  }, [])

  useEffect(() => {
    if (!visualLocalPreview) return undefined
    return () => URL.revokeObjectURL(visualLocalPreview)
  }, [visualLocalPreview])

  async function submit(event) {
    event.preventDefault()
    setLoading(true); setError(''); setAnswer(''); setDisclaimer('')
    try {
      const result = await requestGardenPlanStream(input, {
        onChunk: (_piece, fullSoFar) => {
          setAnswer(fullSoFar)
        },
      })
      if (result?.answer) setAnswer(result.answer)
      setDisclaimer(result?.disclaimer || '')
      fetchAiUsage().then(setUsage).catch(() => {})
    } catch (requestError) {
      setError(requestError.message)
      fetchAiUsage().then(setUsage).catch(() => {})
    } finally {
      setLoading(false)
    }
  }

  async function submitVisualPreview(event) {
    event.preventDefault()
    if (!visualFile && !visualUploadedOriginalId) {
      setVisualError('Please select a photo of your yard or garden first.')
      return
    }
    if (!visualInstructions.trim()) {
      setVisualError('Please describe what changes you want the AI to remove, clean, or add.')
      return
    }
    setVisualLoading(true)
    setVisualError('')
    try {
      const result = await requestGardenImagePreview(
        visualUploadedOriginalId
          ? { parentImageId: visualUploadedOriginalId, instructions: visualInstructions.trim() }
          : { file: visualFile, instructions: visualInstructions.trim() },
      )
      setVisualResult(result)
      if (result?.originalImage?.id) {
        setVisualUploadedOriginalId(result.originalImage.id)
      }
      fetchAiUsage().then(setUsage).catch(() => {})
    } catch (editError) {
      setVisualError(editError.message)
      fetchAiUsage().then(setUsage).catch(() => {})
    } finally {
      setVisualLoading(false)
    }
  }

  function handleUseVisualInRequest() {
    if (!visualResult) return
    const prefillImages = [visualResult.originalImage, visualResult.generatedImage].filter(Boolean)
    navigate('/inquiries/new?type=general', {
      state: {
        prefillImages,
        prefillDescription: visualInstructions.trim(),
      },
    })
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
          Ask for Zamboanga City plant &amp; layout advice, or upload a real photo of your yard to preview visual changes before messaging a local gardener.
        </p>
        <div className="assistant-mode-tabs" role="tablist" aria-label="AI assistant modes">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'chat'}
            className={`assistant-mode-tab${activeTab === 'chat' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <Sparkles size={15} /> Garden Ideas (Chat)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'visual'}
            className={`assistant-mode-tab${activeTab === 'visual' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('visual')}
          >
            <Wand2 size={15} /> Visual Garden Preview
          </button>
        </div>

        {activeTab === 'chat' && (
          <>
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
                <div className="assistant-answer-text assistant-answer-formatted">
                  {renderFormattedPlan(answer)}
                </div>
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
          </>
        )}

        {activeTab === 'visual' && (
          <>
            {usage && !usage.imageGenerationEnabled ? (
              <div className="dashboard-panel" role="status">
                <p className="eyebrow">Visual Garden Preview</p>
                <h2>AI photo previews are currently turned off.</h2>
                <p className="field-note">
                  To enable free Cloudflare Workers AI photo editing on your local setup, set <code>AI_IMAGE_GEN_ENABLED=true</code> along with <code>CF_ACCOUNT_ID</code> and <code>CF_API_TOKEN</code> in <code>backend/.env</code> and restart the backend server.
                </p>
              </div>
            ) : (
              <>
                {usage?.imageQuota && (
                  <p className="form-note" style={{ marginBottom: '12px' }}>
                    You have <strong>{usage.imageQuota.remaining}</strong> of <strong>{usage.imageQuota.limit}</strong> AI photo previews remaining in the last 24 hours.
                  </p>
                )}
                <div className="assistant-layout">
                  <form className="dashboard-panel profile-form assistant-form" onSubmit={submitVisualPreview}>
                    <label htmlFor="visual-photo-input" className="visual-upload-label">
                      1. Upload a photo of your yard or garden (JPEG, PNG, or WebP, max 5 MB)
                      <input
                        id="visual-photo-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={visualLoading}
                        onChange={(e) => {
                          const picked = e.target.files?.[0] || null
                          setVisualFile(picked)
                          setVisualUploadedOriginalId(null)
                          setVisualResult(null)
                          setVisualError('')
                        }}
                      />
                    </label>
                    {visualLocalPreview && (
                      <div className="visual-selected-preview">
                        <img src={visualLocalPreview} alt="Selected yard preview" />
                        <span className="field-note">
                          <ImagePlus size={14} /> Ready to edit: <strong>{visualFile?.name}</strong>
                        </span>
                      </div>
                    )}
                    <label htmlFor="visual-edit-instructions">
                      2. Describe what to remove, clean, change, or add
                      <textarea
                        id="visual-edit-instructions"
                        required
                        maxLength="1000"
                        rows="5"
                        value={visualInstructions}
                        onChange={(event) => setVisualInstructions(event.target.value)}
                        placeholder="Example: Remove the yellowish dry grass and loose pebbles, trim the lawn cleanly, and add flowering bougainvillea plants along the fence."
                      />
                    </label>
                    <small className="field-note">{visualInstructions.length}/1000 characters · Gardening &amp; yard changes only</small>
                    {visualError && <div className="form-error" role="alert">{visualError}</div>}
                    <button
                      className="button"
                      type="submit"
                      disabled={visualLoading || (usage?.imageQuota && usage.imageQuota.remaining <= 0)}
                    >
                      <Wand2 size={15} /> {visualLoading ? 'Generating preview (~6–10s)...' : 'Generate visual preview'}
                    </button>
                    <p className="assistant-disclaimer">
                      AI edits are visual concept previews only. Your original untouched photo is always preserved for accurate gardener quotes.
                    </p>
                  </form>
                  <aside className="assistant-examples dashboard-panel">
                    <h2>Sample edit instructions</h2>
                    {visualEditExamples.map((example) => (
                      <button type="button" key={example} onClick={() => setVisualInstructions(example)}>{example}</button>
                    ))}
                  </aside>
                </div>

                {visualResult?.generatedImage && (
                  <article className="dashboard-panel assistant-answer">
                    <p className="eyebrow">Before &amp; After visual concept</p>
                    <div className="visual-compare-grid">
                      <figure className="visual-compare-card">
                        <span className="photo-kind-badge">Before · Original Photo</span>
                        <a
                          href={getRequestImageUrl(visualResult.originalImage.id)}
                          target="_blank"
                          rel="noreferrer"
                          title="Open full-size original photo"
                        >
                          <img src={getRequestImageUrl(visualResult.originalImage.id)} alt="Original uploaded yard" />
                        </a>
                        <figcaption className="visual-compare-actions">
                          <a
                            className="table-action"
                            href={getRequestImageUrl(visualResult.originalImage.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={13} /> Open full size
                          </a>
                        </figcaption>
                      </figure>
                      <figure className="visual-compare-card is-ai">
                        <span className="photo-kind-badge is-ai">After · AI Concept Preview</span>
                        <a
                          href={getRequestImageUrl(visualResult.generatedImage.id)}
                          target="_blank"
                          rel="noreferrer"
                          title="Open full-size AI concept preview"
                        >
                          <img src={getRequestImageUrl(visualResult.generatedImage.id)} alt="AI edited garden concept preview" />
                        </a>
                        <figcaption className="visual-compare-actions">
                          <a
                            className="table-action"
                            href={getRequestImageUrl(visualResult.generatedImage.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={13} /> Open full size
                          </a>
                          <a
                            className="table-action"
                            href={getRequestImageUrl(visualResult.generatedImage.id)}
                            download={`hugatiera-garden-preview-${visualResult.generatedImage.id}.png`}
                          >
                            <Download size={13} /> Save preview
                          </a>
                        </figcaption>
                      </figure>
                    </div>
                    <p className="assistant-disclaimer" style={{ marginTop: '12px' }}>
                      {visualResult.disclaimer}
                    </p>
                    {user?.role === 'client' && (
                      <div className="inline-actions" style={{ marginTop: '14px' }}>
                        <button type="button" className="button button-sm" onClick={handleUseVisualInRequest}>
                          Use these photos in a service request <ArrowRight size={15} />
                        </button>
                        <Link className="button button-outline button-sm" to="/services">
                          Browse local gardeners
                        </Link>
                      </div>
                    )}
                  </article>
                )}
              </>
            )}
          </>
        )}
      </section>
    </main>
  )
}
