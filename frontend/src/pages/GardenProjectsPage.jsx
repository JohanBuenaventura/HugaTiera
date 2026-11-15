import { useEffect, useState } from 'react'
import { ImagePlus, Sparkles, Upload } from 'lucide-react'
import AppSidebar from '../components/AppSidebar'
import { apiBaseUrl } from '../services/api'
import { gardenProjectsApi } from '../services/gardenProjects'

const initialForm = { title: '', description: '', preferredStyle: 'Tropical', budgetMin: '', budgetMax: '', gardenSize: '', location: 'Zamboanga City' }

export default function GardenProjectsPage() {
  const [projects, setProjects] = useState([])
  const [form, setForm] = useState(initialForm)
  const [selected, setSelected] = useState(null)
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    gardenProjectsApi.list()
      .then((result) => { if (active) setProjects(result.projects || []) })
      .catch((requestError) => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [])

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function createProject(event) {
    event.preventDefault()
    setLoading(true); setError(''); setNotice('')
    try {
      const result = await gardenProjectsApi.create(form)
      let project = result.project
      if (file) {
        await gardenProjectsApi.uploadImage(project.id, file)
        project = (await gardenProjectsApi.get(project.id)).project
      }
      setSelected(project)
      setProjects((current) => [project, ...current])
      setForm(initialForm); setFile(null); setNotice('Project saved. You can now generate a design.')
    } catch (requestError) {
      setError(requestError.message)
    } finally { setLoading(false) }
  }

  async function runAction(action, message) {
    if (!selected) return
    setLoading(true); setError(''); setNotice('')
    try {
      const result = await action(selected.id)
      if (result.project) setSelected(result.project)
      if (result.image) setSelected((current) => ({ ...current, images: [...(current.images || []), result.image], status: 'ready' }))
      if (result.analysis) setSelected((current) => ({ ...current, analysis: result.analysis }))
      if (result.matches) setSelected((current) => ({ ...current, matches: result.matches }))
      setNotice(message)
    } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }

  const image = selected?.images?.find((item) => item.kind === 'ai_generated') || selected?.images?.find((item) => item.kind === 'original')
  const imageUrl = image ? `${apiBaseUrl}${image.url.replace('/api', '')}` : ''

  return (
    <main className="marketplace-page protected-page">
      <AppSidebar />
      <section className="protected-content">
        <div className="assistant-page-heading">
          <div><span className="eyebrow">AI garden studio</span><h1>Turn your garden idea into a practical project.</h1><p>Upload a real garden photo, describe the transformation, and keep provider recommendations separate from final feasibility decisions.</p></div>
        </div>
        <div className="assistant-layout">
          <form className="assistant-card" onSubmit={createProject}>
            <h2><ImagePlus size={20} /> Start a garden project</h2>
            <label>Project title<input name="title" value={form.title} onChange={updateField} required /></label>
            <label>Desired transformation<textarea name="description" rows="6" value={form.description} onChange={updateField} required minLength="10" /></label>
            <div className="form-grid form-grid-two">
              <label>Style<select name="preferredStyle" value={form.preferredStyle} onChange={updateField}><option>Tropical</option><option>Modern</option><option>Minimalist</option><option>Japanese</option><option>Zen Garden</option><option>Vegetable Garden</option></select></label>
              <label>Garden size<input name="gardenSize" value={form.gardenSize} onChange={updateField} placeholder="Optional" /></label>
              <label>Budget minimum<input name="budgetMin" type="number" min="0" value={form.budgetMin} onChange={updateField} /></label>
              <label>Budget maximum<input name="budgetMax" type="number" min="0" value={form.budgetMax} onChange={updateField} /></label>
            </div>
            <label>Location<input name="location" value={form.location} onChange={updateField} /></label>
            <label className="upload-dropzone"><Upload size={20} /> Garden photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} />{file && <small>{file.name}</small>}</label>
            {error && <div className="form-error" role="alert">{error}</div>}
            {notice && <div className="form-success">{notice}</div>}
            <button className="button button-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save project'}</button>
          </form>
          <div className="assistant-card">
            <h2><Sparkles size={20} /> Your projects</h2>
            {projects.length === 0 && <p className="muted">Your saved garden projects will appear here.</p>}
            <div className="garden-project-list">{projects.map((project) => <button className={`garden-project-item ${selected?.id === project.id ? 'is-selected' : ''}`} key={project.id} type="button" onClick={async () => setSelected((await gardenProjectsApi.get(project.id)).project)}><strong>{project.title}</strong><span>{project.status}</span></button>)}</div>
            {selected && <div className="garden-project-workspace">
              <p>{selected.description}</p>
              {imageUrl && <img className="garden-project-preview" src={imageUrl} alt="Garden project visualization" />}
              <div className="button-row">
                <button className="button button-primary" type="button" disabled={loading} onClick={() => runAction(gardenProjectsApi.generate, 'Visualization generated.')}>Generate visualization</button>
                <button className="button button-secondary" type="button" disabled={loading} onClick={() => runAction(gardenProjectsApi.analyze, 'Analysis saved.')}>Analyze project</button>
                <button className="button button-secondary" type="button" disabled={loading} onClick={() => runAction(gardenProjectsApi.matches, 'Provider recommendations refreshed.')}>Find providers</button>
              </div>
              {selected.analysis && <pre className="assistant-answer-text">{JSON.stringify(selected.analysis, null, 2)}</pre>}
              {selected.matches?.length > 0 && <div className="garden-project-matches">{selected.matches.map((match) => <article key={match.gardener_id}><strong>{match.business_name}</strong><span>{match.suitability.replaceAll('_', ' ')}</span><p>{match.rationale}</p></article>)}</div>}
            </div>}
          </div>
        </div>
      </section>
    </main>
  )
}
