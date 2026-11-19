import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Calculator, ClipboardCheck, Leaf, MapPin, Sparkles } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { agreementsApi } from '../services/agreements'
import { formatStatusLabel, getStatusBadgeClass } from '../services/bookings'
import { requestPhotoAnalysis, requestRequirementAssistance } from '../services/ai'
import {
  ADDON_TYPE_LABELS,
  COMPLEXITY_LABELS,
  ESTIMATE_DISCLAIMER,
  MATERIALS_LABELS,
  MATERIALS_OPTIONS,
  WORK_COMPLEXITY_OPTIONS,
  computeLocalPriceEstimate,
  formatEstimateRange,
  formatPeso,
  inquiriesApi,
} from '../services/inquiries'
import {
  deleteRequestImage,
  fetchInquiryImages,
  getRequestImageUrl,
  updateRequestImageDescription,
  uploadRequestImage,
} from '../services/requestImages'
import { servicesApi } from '../services/services'
import { communicationApi } from '../services/communication'
import AppSidebar from '../components/AppSidebar'

function formatDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function InquiryForm() {
  const [params] = useSearchParams()
  const serviceId = params.get('serviceId')
  const gardenerId = params.get('gardenerId')
  const typeParam = params.get('type')
  const navigate = useNavigate()
  const [service, setService] = useState(null)
  const [gardener, setGardener] = useState(null)
  const [categories, setCategories] = useState([])
  const [pricingAddons, setPricingAddons] = useState([])
  const [selectedAddonsMap, setSelectedAddonsMap] = useState({})
  const validServiceId = Boolean(serviceId && /^\d+$/.test(serviceId))
  const validGardenerId = Boolean(gardenerId && /^\d+$/.test(gardenerId))
  const isGeneralRequest = typeParam === 'general' || (!validServiceId && !validGardenerId)

  const [form, setForm] = useState({
    subject: '',
    description: '',
    aiSummary: '',
    requestedDate: '',
    location: '',
    categoryId: '',
    expiresInDays: '14',
    areaSqm: '',
    lengthM: '',
    widthM: '',
    workComplexity: 'moderate',
    materialsOption: 'client_provides',
    siteVisitRequested: true,
    priceComment: '',
  })
  const [uploadedImages, setUploadedImages] = useState([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [analyzingPhotoId, setAnalyzingPhotoId] = useState(null)
  const [savingPhotoDescId, setSavingPhotoDescId] = useState(null)
  const [generatingAiReq, setGeneratingAiReq] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState(null)
  const [aiNotice, setAiNotice] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    servicesApi.categories().then((result) => setCategories(result.categories || [])).catch(() => {})
    servicesApi.pricingAddons().then((result) => setPricingAddons(result.addons || [])).catch(() => {})
    if (!isGeneralRequest && validServiceId) {
      servicesApi.detail(serviceId).then((result) => setService(result.service)).catch((loadError) => setError(loadError.message))
    } else if (!isGeneralRequest && validGardenerId) {
      servicesApi.gardener(gardenerId).then((result) => setGardener(result.gardener)).catch((loadError) => setError(loadError.message))
    }
  }, [gardenerId, isGeneralRequest, serviceId, validGardenerId, validServiceId])

  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  function toggleAddonItem(addonId, checked) {
    setSelectedAddonsMap((current) => {
      const next = { ...current }
      if (checked) {
        next[addonId] = next[addonId] || '1'
      } else {
        delete next[addonId]
      }
      return next
    })
  }

  function setAddonQuantity(addonId, value) {
    setSelectedAddonsMap((current) => ({ ...current, [addonId]: value }))
  }

  function handleDimensionChange(dim, value) {
    setForm((current) => {
      const next = { ...current, [dim]: value }
      const l = Number(next.lengthM)
      const w = Number(next.widthM)
      if (Number.isFinite(l) && l > 0 && Number.isFinite(w) && w > 0) {
        next.areaSqm = String(Math.round(l * w * 100) / 100)
      }
      return next
    })
  }

  const selectedAddonsForEstimate = pricingAddons
    .filter((addon) => selectedAddonsMap[addon.id] !== undefined && Number(selectedAddonsMap[addon.id]) > 0)
    .map((addon) => ({ ...addon, quantity: Number(selectedAddonsMap[addon.id]) }))

  const selectedCategory = categories.find((cat) => String(cat.id) === String(form.categoryId || service?.category_id || '')) || null
  const liveEstimate = computeLocalPriceEstimate({
    areaSqm: form.areaSqm,
    workComplexity: form.workComplexity,
    materialsOption: form.materialsOption,
    category: selectedCategory,
    service,
    selectedAddons: selectedAddonsForEstimate,
  })

  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (uploadedImages.length >= 5) {
      setError('You can attach up to 5 garden photos per inquiry.')
      return
    }
    setUploadingPhoto(true)
    setError('')
    try {
      const res = await uploadRequestImage(file)
      if (res?.image) {
        setUploadedImages((prev) => [...prev, res.image])
      }
    } catch (uploadErr) {
      setError(uploadErr.message)
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleRemovePhoto(imageId) {
    setError('')
    try {
      await deleteRequestImage(imageId)
      setUploadedImages((prev) => prev.filter((img) => img.id !== imageId))
    } catch (delErr) {
      setError(delErr.message)
    }
  }

  function handleLocalPhotoDescriptionChange(imageId, value) {
    setUploadedImages((prev) => prev.map((img) => (
      img.id === imageId ? { ...img, ai_description: value } : img
    )))
  }

  async function handleSavePhotoDescription(imageId, descriptionText) {
    setSavingPhotoDescId(imageId)
    setAiNotice('')
    try {
      const res = await updateRequestImageDescription(imageId, descriptionText || '')
      if (res?.image) {
        setUploadedImages((prev) => prev.map((img) => (img.id === imageId ? res.image : img)))
      }
    } catch (descErr) {
      setAiNotice(descErr.message)
    } finally {
      setSavingPhotoDescId(null)
    }
  }

  async function handleAnalyzePhoto(imageId) {
    setAnalyzingPhotoId(imageId)
    setAiNotice('')
    try {
      const res = await requestPhotoAnalysis({
        imageId,
        notes: form.description || form.subject,
      })
      if (res?.image) {
        setUploadedImages((prev) => prev.map((img) => (img.id === imageId ? res.image : img)))
      }
      if (res?.model) {
        setAiNotice(
          `Photo description generated with ${res.model}${res.fallbackUsed ? ' (automatic fallback)' : ''}. You can review and edit it before submitting.`,
        )
      }
    } catch (aiErr) {
      setAiNotice(`${aiErr.message} You can still type or edit the photo description manually and submit your request.`)
    } finally {
      setAnalyzingPhotoId(null)
    }
  }

  async function handleGenerateAiRequirements() {
    if (!form.description.trim()) {
      setAiNotice('Please enter what you are looking for first so the AI assistant can organize your requirements.')
      return
    }
    setGeneratingAiReq(true)
    setAiNotice('')
    try {
      const res = await requestRequirementAssistance({
        subject: form.subject,
        description: form.description,
        location: form.location,
        imageIds: uploadedImages.map((img) => img.id),
      })
      if (res?.suggestion) {
        setAiSuggestion({
          ...res.suggestion,
          model: res.model || null,
          fallbackUsed: Boolean(res.fallbackUsed),
        })
        if (res.model) {
          setAiNotice(
            `Suggestions generated with ${res.model}${res.fallbackUsed ? ' (automatic fallback)' : ''}. Review and edit before submitting.`,
          )
        }
        setForm((prev) => ({
          ...prev,
          aiSummary: res.suggestion.structuredSummary || prev.aiSummary,
          categoryId: isGeneralRequest && !prev.categoryId && res.suggestion.suggestedCategoryId
            ? String(res.suggestion.suggestedCategoryId)
            : prev.categoryId,
        }))
      }
    } catch (aiErr) {
      setAiNotice(`${aiErr.message} You can continue filling out and submitting your request without AI assistance.`)
    } finally {
      setGeneratingAiReq(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        subject: form.subject,
        description: form.description,
        aiSummary: form.aiSummary,
        requestedDate: form.requestedDate,
        location: form.location,
        areaSqm: form.areaSqm ? Number(form.areaSqm) : null,
        workComplexity: form.workComplexity,
        materialsOption: form.materialsOption,
        siteVisitRequested: Boolean(form.siteVisitRequested),
        priceComment: form.priceComment,
        addonItems: selectedAddonsForEstimate.map((item) => ({
          addonId: item.id,
          quantity: item.quantity,
        })),
        requestType: isGeneralRequest ? 'general' : 'direct',
        ...(isGeneralRequest
          ? {
              ...(form.categoryId ? { categoryId: Number(form.categoryId) } : {}),
              expiresInDays: Number(form.expiresInDays) || 14,
            }
          : {
              ...(validServiceId ? { serviceId: Number(serviceId) } : {}),
              ...(validGardenerId ? { gardenerId: Number(gardenerId) } : {}),
              ...(!validServiceId && form.categoryId ? { categoryId: Number(form.categoryId) } : {}),
            }),
        imageIds: uploadedImages.map((img) => img.id),
      }
      const result = await inquiriesApi.create(payload)
      navigate(`/inquiries/${result.id}`)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="container inquiry-content">
      <Link className="back-link" to={isGeneralRequest ? '/inquiries' : (validGardenerId ? `/gardeners/${gardenerId}` : '/services')}>
        <ArrowLeft size={15} /> Back
      </Link>
      <p className="eyebrow">{isGeneralRequest ? 'General service request (open to approved providers)' : 'Direct service provider inquiry'}</p>
      <h1>{isGeneralRequest ? 'Post an open gardening request.' : 'Tell the gardener what you need.'}</h1>
      {service && (
        <div className="inquiry-service">
          <strong>{service.title}</strong>
          <span>{service.business_name || `${service.first_name} ${service.last_name}`}</span>
        </div>
      )}
      {!service && gardener && (
        <div className="inquiry-service">
          <strong>{gardener.business_name || `${gardener.first_name} ${gardener.last_name}`}</strong>
          <span>{gardener.service_area || 'Zamboanga City'}</span>
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <form className="dashboard-panel profile-form inquiry-form" onSubmit={submit}>
        <label>Subject
          <input required maxLength="200" value={form.subject} onChange={change('subject')} placeholder="e.g. Small backyard garden improvement" />
        </label>
        {isGeneralRequest ? (
          <div className="form-row">
            <label>Service category (helps compute per-m² estimate)
              <select value={form.categoryId} onChange={change('categoryId')}>
                <option value="">Any gardening category (₱60–₱120/m²)</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} (₱{Number(cat.rate_per_sqm_min).toFixed(0)}–₱{Number(cat.rate_per_sqm_max).toFixed(0)}/m²)
                  </option>
                ))}
              </select>
            </label>
            <label>Request validity period
              <select value={form.expiresInDays} onChange={change('expiresInDays')}>
                <option value="7">7 days</option>
                <option value="14">14 days (Recommended)</option>
                <option value="30">30 days</option>
              </select>
            </label>
          </div>
        ) : (!validServiceId && (
          <label>Service category (optional — improves per-m² estimate)
            <select value={form.categoryId} onChange={change('categoryId')}>
              <option value="">General gardening baseline (₱60–₱120/m²)</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} (₱{Number(cat.rate_per_sqm_min).toFixed(0)}–₱{Number(cat.rate_per_sqm_max).toFixed(0)}/m²)
                </option>
              ))}
            </select>
          </label>
        ))}

        <div className="price-predictor-box">
          <div className="price-predictor-header">
            <Calculator size={18} />
            <div>
              <strong>Indicative Price Estimator (per sq. meter)</strong>
              <p className="field-note">Enter your garden size and site condition so the system can predict a realistic indicative range for you and local gardeners.</p>
            </div>
          </div>

          <div className="form-row form-row-3">
            <label>
              Estimated area (sq. meters)
              <input
                type="number"
                required
                min="0.5"
                max="50000"
                step="0.5"
                placeholder="e.g., 25"
                value={form.areaSqm}
                onChange={change('areaSqm')}
              />
            </label>
            <label>
              Length in m <span className="label-note">(Optional helper)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                placeholder="e.g., 5"
                value={form.lengthM}
                onChange={(e) => handleDimensionChange('lengthM', e.target.value)}
              />
            </label>
            <label>
              Width in m <span className="label-note">(Optional helper)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                placeholder="e.g., 5"
                value={form.widthM}
                onChange={(e) => handleDimensionChange('widthM', e.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Site condition / work complexity
              <select value={form.workComplexity} onChange={change('workComplexity')}>
                {WORK_COMPLEXITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label>
              Materials & plants
              <select value={form.materialsOption} onChange={change('materialsOption')}>
                {MATERIALS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>

          {pricingAddons.length > 0 && (
            <div className="addon-picker-section">
              <div className="addon-picker-heading">
                <strong>Plants, soil &amp; extra cost items <span className="label-note">(Optional — itemized separately from labor)</span></strong>
                <span className="field-note">Select any plants, turf, soil, equipment, or hauling needed so the estimator prices them separately from per-sq.m labor.</span>
              </div>
              <div className="addon-picker-grid">
                {pricingAddons.map((addon) => {
                  const isChecked = selectedAddonsMap[addon.id] !== undefined
                  return (
                    <div className={`addon-picker-item${isChecked ? ' is-selected' : ''}`} key={addon.id}>
                      <label className="addon-picker-check">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => toggleAddonItem(addon.id, e.target.checked)}
                        />
                        <span>
                          <strong>{addon.name}</strong>
                          <small>
                            {ADDON_TYPE_LABELS[addon.item_type] || addon.item_type} · {formatEstimateRange(addon.unit_price_min, addon.unit_price_max)} {addon.unit}
                          </small>
                        </span>
                      </label>
                      {isChecked && (
                        <div className="addon-qty-wrap">
                          <label>
                            Qty ({addon.unit.replace(/^per\s+/i, '')})
                            <input
                              type="number"
                              min="0.5"
                              max="10000"
                              step="0.5"
                              value={selectedAddonsMap[addon.id]}
                              onChange={(e) => setAddonQuantity(addon.id, e.target.value)}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className={`price-predictor-result${liveEstimate ? ' has-estimate' : ''}`} aria-live="polite">
            {liveEstimate ? (
              <>
                <div className="price-predictor-range-row">
                  <span className="eyebrow" style={{ margin: 0 }}>Total predicted indicative range</span>
                  <strong className="price-predictor-range">
                    {formatEstimateRange(liveEstimate.estimatedMinAmount, liveEstimate.estimatedMaxAmount)}
                  </strong>
                </div>
                <div className="estimate-breakdown-totals">
                  <span>
                    <strong>Labor subtotal:</strong> {formatEstimateRange(liveEstimate.estimatedLaborMin, liveEstimate.estimatedLaborMax)}
                  </span>
                  <span>
                    <strong>Plants &amp; materials:</strong>{' '}
                    {liveEstimate.estimatedMaterialsMax > 0
                      ? formatEstimateRange(liveEstimate.estimatedMaterialsMin, liveEstimate.estimatedMaterialsMax)
                      : '₱0 (Client provides)'}
                  </span>
                </div>
                {liveEstimate.items.length > 0 && (
                  <ul className="estimate-items-list">
                    {liveEstimate.items.map((item) => (
                      <li key={item.addonId}>
                        <span>{item.itemName} ({item.quantity} × {item.unit})</span>
                        <strong>{formatEstimateRange(item.subtotalMin, item.subtotalMax)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="price-predictor-breakdown">
                  Labor formula: {liveEstimate.areaSqm} m² × {liveEstimate.rateSourceLabel} × {liveEstimate.complexityFactor} (condition)
                  {liveEstimate.materialsMode === 'allowance_multiplier' ? ` × ${liveEstimate.materialsFactor} (general materials allowance)` : ''}
                  {liveEstimate.floorApplied ? ` · Minimum mobilization base fee of ₱${liveEstimate.minBaseFee.toLocaleString()} applied` : ''}.
                  {liveEstimate.estimatedWorkingDays ? ` Estimated duration: ~${liveEstimate.estimatedHours} hrs (~${liveEstimate.estimatedWorkingDays} working ${liveEstimate.estimatedWorkingDays === 1 ? 'day' : 'days'}).` : ''}
                </p>
                <p className="field-note" style={{ margin: 0 }}>{liveEstimate.disclaimer}</p>
              </>
            ) : (
              <p className="field-note" style={{ margin: 0 }}>
                Enter your estimated area in square meters (or Length × Width) above to see the predicted indicative price range.
              </p>
            )}
          </div>

          <label className="site-visit-checkbox">
            <input
              type="checkbox"
              checked={form.siteVisitRequested}
              onChange={(e) => setForm((current) => ({ ...current, siteVisitRequested: e.target.checked }))}
            />
            <span>I am open to a quick on-site ocular inspection so the gardener can verify site conditions and give an accurate final quote.</span>
          </label>

          <label>
            Your comment on the estimated price / budget <span className="label-note">(Optional)</span>
            <textarea
              rows="2"
              maxLength="2000"
              value={form.priceComment}
              onChange={change('priceComment')}
              placeholder="e.g., Target budget is around ₱2,500–₱3,500; area is roughly 25 sq.m with tall grass and sloped soil."
            />
          </label>
        </div>
        <label>What are you looking for?
          <textarea required rows="5" maxLength="5000" value={form.description} onChange={change('description')} placeholder="Describe your outdoor space, goals, and any details that may help gardeners prepare an offer." />
        </label>
        <div className="inline-actions" style={{ marginBottom: '6px' }}>
          <button
            className="button button-outline"
            type="button"
            disabled={generatingAiReq}
            onClick={handleGenerateAiRequirements}
          >
            <Sparkles size={15} /> {generatingAiReq ? 'Organizing with AI...' : 'Organize requirements & get AI suggestions'}
          </button>
          {aiSuggestion?.refinedDescription && (
            <button
              className="table-action"
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, description: aiSuggestion.refinedDescription }))}
            >
              Use AI-refined description
            </button>
          )}
        </div>
        {aiNotice && (
          <p className="form-note" role="status" style={{ marginBottom: '8px' }}>
            {aiNotice}
          </p>
        )}
        {aiSuggestion && (
          <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(46, 107, 64, 0.06)', marginBottom: '10px' }}>
            <p className="form-note" style={{ margin: '0 0 6px' }}>
              <strong>AI gardening suggestions (review & edit before submitting):</strong>
              {aiSuggestion.model ? ` Generated by ${aiSuggestion.model}${aiSuggestion.fallbackUsed ? ' (fallback)' : ''}.` : ''}
              {aiSuggestion.suggestedCategoryName ? ` Suggested category: ${aiSuggestion.suggestedCategoryName}.` : ''}
            </p>
            {Array.isArray(aiSuggestion.gardeningIdeas) && aiSuggestion.gardeningIdeas.length > 0 && (
              <ul style={{ margin: '4px 0 6px 18px', fontSize: '0.9rem' }}>
                {aiSuggestion.gardeningIdeas.map((idea) => (
                  <li key={idea}>{idea}</li>
                ))}
              </ul>
            )}
            {Array.isArray(aiSuggestion.followUpQuestions) && aiSuggestion.followUpQuestions.length > 0 && (
              <p className="form-note" style={{ margin: 0 }}>
                <strong>Helpful details to mention:</strong> {aiSuggestion.followUpQuestions.join(' · ')}
              </p>
            )}
          </div>
        )}
        <label>Reviewed requirement summary (editable AI-assisted summary shared with providers)
          <textarea rows="3" maxLength="5000" value={form.aiSummary} onChange={change('aiSummary')} placeholder="Optional structured summary of your gardening requirements. You can generate this with AI above and edit it freely." />
        </label>
        <div className="form-row">
          <label>Preferred date
            <input type="date" value={form.requestedDate} onChange={change('requestedDate')} />
          </label>
          <label>Service area / barangay (area-level only)
            <input maxLength="255" value={form.location} onChange={change('location')} placeholder="e.g. Tetuan, Zamboanga City (exact address shared later)" />
          </label>
        </div>
        <label>Garden photos (up to 5 JPEG, PNG, or WebP images; GPS/EXIF stripped automatically)
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingPhoto || uploadedImages.length >= 5} onChange={handlePhotoUpload} />
        </label>
        {uploadingPhoto && <p className="form-note">Processing and stripping metadata from photo...</p>}
        {uploadedImages.length > 0 && (
          <div className="request-photo-grid">
            {uploadedImages.map((img) => (
              <figure className="request-photo-card" key={img.id}>
                <img src={getRequestImageUrl(img.id)} alt="Uploaded garden space" />
                <figcaption className="request-photo-caption">
                  <textarea
                    rows="3"
                    maxLength="2000"
                    value={img.ai_description || ''}
                    onChange={(e) => handleLocalPhotoDescriptionChange(img.id, e.target.value)}
                    onBlur={(e) => handleSavePhotoDescription(img.id, e.target.value)}
                    placeholder="Optional space description (click 'Describe with AI' or type manually)"
                  />
                  <div className="request-photo-actions">
                    <button
                      className="table-action"
                      type="button"
                      disabled={analyzingPhotoId === img.id || savingPhotoDescId === img.id}
                      onClick={() => handleAnalyzePhoto(img.id)}
                    >
                      <Sparkles size={13} /> {analyzingPhotoId === img.id ? 'Analyzing...' : 'Describe with AI'}
                    </button>
                    <button className="table-action" type="button" onClick={() => handleRemovePhoto(img.id)}>
                      Remove photo
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <p className="form-note">
          {isGeneralRequest
            ? 'Your open request will be visible to approved gardeners on the Open Requests Board with area-level location only. Multiple gardeners can submit offers for you to compare before reaching a mutual agreement.'
            : 'This is an inquiry, not a confirmed booking. The gardener will evaluate feasibility and respond with an offer or suggested modifications, followed by mutual agreement.'}
        </p>
        <button className="button" type="submit" disabled={saving || uploadingPhoto}>
          {saving ? 'Sending...' : (isGeneralRequest ? 'Post general service request' : 'Send direct inquiry')}
        </button>
      </form>
    </section>
  )
}

function formatDateTimeInput(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

function formatDateInput(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
}

const RESPONSE_TYPE_LABELS = {
  offer: 'Standard offer',
  feasible: 'Feasible as requested',
  modifications: 'Feasible with modifications',
  cannot_do: 'Cannot fulfill',
  interest: 'Expression of interest',
}

function InquiryDetails({ id }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [form, setForm] = useState({
    responseType: 'offer',
    amount: '',
    laborAmount: '',
    materialsAmount: '',
    materialsBreakdown: '',
    details: '',
    proposedChanges: '',
    requiresSiteVisit: false,
    availabilityStart: '',
    availabilityEnd: '',
    estimatedWorkingDays: '',
    estimatedHours: '',
    validUntil: '',
  })
  const [editingQuoteId, setEditingQuoteId] = useState(null)
  const [editingAgreement, setEditingAgreement] = useState(false)
  const [agreementForm, setAgreementForm] = useState({
    scopeOfWork: '',
    amount: '',
    priceBasis: '',
    scheduledStart: '',
    scheduledEnd: '',
    location: '',
    conditions: '',
  })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [renewDays, setRenewDays] = useState('14')
  const [submittingQuote, setSubmittingQuote] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const load = useCallback(() => inquiriesApi.get(id).then((res) => {
    setData(res)
    if (res?.activeAgreement) {
      setAgreementForm({
        scopeOfWork: res.activeAgreement.scope_of_work || '',
        amount: res.activeAgreement.amount ?? '',
        priceBasis: res.activeAgreement.price_basis || '',
        scheduledStart: formatDateTimeInput(res.activeAgreement.scheduled_start),
        scheduledEnd: formatDateTimeInput(res.activeAgreement.scheduled_end),
        location: res.activeAgreement.location || '',
        conditions: res.activeAgreement.conditions || '',
      })
    }
  }).catch((loadError) => setError(loadError.message)), [id])
  useEffect(() => {
    load()
  }, [load])
  function startReviseQuote(quote) {
    setEditingQuoteId(quote.id)
    setForm({
      responseType: quote.response_type || 'offer',
      amount: quote.amount ?? '',
      laborAmount: quote.labor_amount ?? '',
      materialsAmount: quote.materials_amount ?? '',
      materialsBreakdown: quote.materials_breakdown || '',
      details: quote.details || '',
      proposedChanges: quote.proposed_changes || '',
      requiresSiteVisit: Boolean(quote.requires_site_visit),
      availabilityStart: formatDateInput(quote.availability_start),
      availabilityEnd: formatDateInput(quote.availability_end),
      estimatedWorkingDays: quote.estimated_working_days ?? '',
      estimatedHours: quote.estimated_hours ?? '',
      validUntil: formatDateInput(quote.valid_until),
    })
  }
  function cancelReviseQuote() {
    setEditingQuoteId(null)
    setForm({
      responseType: 'offer',
      amount: '',
      laborAmount: '',
      materialsAmount: '',
      materialsBreakdown: '',
      details: '',
      proposedChanges: '',
      requiresSiteVisit: false,
      availabilityStart: '',
      availabilityEnd: '',
      estimatedWorkingDays: '',
      estimatedHours: '',
      validUntil: '',
    })
  }
  function handleQuoteSplitChange(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value }
      const l = next.laborAmount === '' ? null : Number(next.laborAmount)
      const m = next.materialsAmount === '' ? null : Number(next.materialsAmount)
      if ((l !== null && Number.isFinite(l)) || (m !== null && Number.isFinite(m))) {
        next.amount = String(((l && Number.isFinite(l) ? l : 0) + (m && Number.isFinite(m) ? m : 0)).toFixed(2))
      }
      return next
    })
  }
  async function sendQuote(event) {
    event.preventDefault(); setError(''); setMessage(''); setSubmittingQuote(true)
    try {
      if (editingQuoteId) {
        await inquiriesApi.reviseQuote(editingQuoteId, form)
        setEditingQuoteId(null)
        setMessage('Offer revised and previous version saved in history.')
      } else {
        await inquiriesApi.quote(id, form)
        setMessage('Response sent to the client.')
      }
      setForm({
        responseType: 'offer',
        amount: '',
        laborAmount: '',
        materialsAmount: '',
        materialsBreakdown: '',
        details: '',
        proposedChanges: '',
        requiresSiteVisit: false,
        availabilityStart: '',
        availabilityEnd: '',
        estimatedWorkingDays: '',
        estimatedHours: '',
        validUntil: '',
      })
      await load()
    } catch (quoteError) {
      setError(quoteError.message)
    } finally {
      setSubmittingQuote(false)
    }
  }
  async function handleWithdrawQuote(quotationId) {
    setError(''); setMessage(''); setUpdatingStatus(true)
    try {
      if (editingQuoteId === quotationId) cancelReviseQuote()
      await inquiriesApi.withdrawQuote(quotationId)
      setMessage('Quotation withdrawn.')
      await load()
    } catch (withdrawErr) {
      setError(withdrawErr.message)
    } finally {
      setUpdatingStatus(false)
    }
  }
  async function quoteStatus(quotationId, status) {
    setError(''); setMessage(''); setUpdatingStatus(true)
    try { await inquiriesApi.quoteStatus(quotationId, status); setMessage(`Quotation ${status}.`); await load() } catch (statusError) { setError(statusError.message) } finally { setUpdatingStatus(false) }
  }
  async function changeInquiryStatus(status) {
    setError(''); setMessage(''); setUpdatingStatus(true)
    try { await inquiriesApi.close(id, status); setMessage(`Inquiry marked as ${status}.`); await load() } catch (statusError) { setError(statusError.message) } finally { setUpdatingStatus(false) }
  }
  async function handleRenewInquiry() {
    setError(''); setMessage(''); setUpdatingStatus(true)
    try {
      const days = Number(renewDays) || 14
      await inquiriesApi.renew(id, days)
      setMessage(`Inquiry renewed for ${days} days.`)
      await load()
    } catch (renewErr) {
      setError(renewErr.message)
    } finally {
      setUpdatingStatus(false)
    }
  }
  async function approveCurrentAgreement(agreement) {
    setError(''); setMessage(''); setUpdatingStatus(true)
    try {
      const res = await agreementsApi.approve(agreement.id, agreement.version)
      if (res.confirmed && res.booking?.id) {
        setMessage(`Both parties approved agreement v${agreement.version}. Booking #${res.booking.id} is now confirmed!`)
      } else {
        setMessage(`You approved agreement v${agreement.version}. Waiting for the other party to approve v${agreement.version}.`)
      }
      await load()
    } catch (approveErr) {
      setError(approveErr.message)
    } finally {
      setUpdatingStatus(false)
    }
  }
  async function saveAgreementRevision(event, agreement) {
    event.preventDefault(); setError(''); setMessage(''); setUpdatingStatus(true)
    try {
      const res = await agreementsApi.edit(agreement.id, {
        ...agreementForm,
        expectedVersion: agreement.version,
      })
      setEditingAgreement(false)
      setMessage(`Agreement updated to v${res.agreement.version}. Both parties must approve v${res.agreement.version}.`)
      await load()
    } catch (editErr) {
      setError(editErr.message)
    } finally {
      setUpdatingStatus(false)
    }
  }
  async function openConversation(targetGardenerId = null) {
    try {
      const result = await communicationApi.createConversation(inquiry.id, targetGardenerId)
      navigate(`/messages?conversationId=${result.id}`)
    } catch (conversationError) {
      setError(conversationError.message)
    }
  }
  if (!data) return <section className="container inquiry-content">{error ? <div className="form-error">{error}</div> : <p>Loading inquiry...</p>}</section>
  const { inquiry, quotations = [], images = [], activeAgreement = null, agreements = [] } = data
  if (!inquiry) return <section className="container inquiry-content"><div className="form-error" role="alert">The inquiry response was incomplete. Please return to the inquiry list and try again.</div></section>
  const change = (field) => (event) => setForm({ ...form, [field]: event.target.value })
  const canCloseOrCancel = !['closed', 'cancelled', 'expired', 'confirmed'].includes(inquiry.status)
  const canRenew = user.role === 'client' && ['expired', 'open', 'responded'].includes(inquiry.status)
  const myActiveSentQuote = user.role === 'gardener'
    ? quotations.find((q) => q.gardener_id === user.id && q.status === 'sent' && !q.locked_at)
    : null
  const myAcceptedQuote = user.role === 'gardener'
    ? quotations.find((q) => q.gardener_id === user.id && q.status === 'accepted')
    : null
  const canGardenerMessage = user.role === 'gardener' && (
    inquiry.request_type !== 'general'
    || Boolean(myActiveSentQuote || myAcceptedQuote || inquiry.gardener_id === user.id)
  )
  const canGardenerRespond = user.role === 'gardener'
    && ['open', 'responded'].includes(inquiry.status)
    && !myAcceptedQuote
    && (!myActiveSentQuote || editingQuoteId === myActiveSentQuote.id)
  return (
    <section className="container inquiry-content">
      <Link className="back-link" to="/inquiries"><ArrowLeft size={15} /> Back to inquiries</Link>
      <p className="eyebrow">Inquiry #{inquiry.id} · {inquiry.request_type === 'general' ? 'General service request' : 'Direct provider inquiry'}</p>
      <h1>{inquiry.subject}</h1>
      <div className="inquiry-status-row">
        <span className={getStatusBadgeClass(inquiry.status)}>{formatStatusLabel(inquiry.status)}</span>
        <span>{inquiry.service_title || inquiry.category_name || (inquiry.request_type === 'general' ? 'Open gardening request' : 'Direct gardener inquiry')}</span>
        {inquiry.gardener_name && <span>Provider: {inquiry.gardener_name}</span>}
        {(inquiry.request_type !== 'general' || inquiry.gardener_id) && (user.role === 'client' || canGardenerMessage) && (
          <button className="table-action" type="button" onClick={() => openConversation(inquiry.gardener_id || null)}>Open conversation</button>
        )}
        {inquiry.request_type === 'general' && !inquiry.gardener_id && canGardenerMessage && (
          <button className="table-action" type="button" onClick={() => openConversation()}>Message client</button>
        )}
        {canRenew && (
          <>
            <select aria-label="Renewal duration" value={renewDays} onChange={(e) => setRenewDays(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px' }}>
              <option value="7">Renew 7 days</option>
              <option value="14">Renew 14 days</option>
              <option value="30">Renew 30 days</option>
            </select>
            <button className="table-action" type="button" disabled={updatingStatus} onClick={handleRenewInquiry}>
              {updatingStatus ? 'Saving...' : (inquiry.status === 'expired' ? 'Renew expired request' : 'Extend validity')}
            </button>
          </>
        )}
        {canCloseOrCancel && user.role === 'client' && (
          <button className="table-action" type="button" disabled={updatingStatus} onClick={() => changeInquiryStatus('cancelled')}>
            {updatingStatus ? 'Saving...' : 'Cancel inquiry'}
          </button>
        )}
        {canCloseOrCancel && (user.role === 'client' || inquiry.gardener_id === user.id) && (
          <button className="table-action" type="button" disabled={updatingStatus} onClick={() => changeInquiryStatus('closed')}>
            {updatingStatus ? 'Saving...' : 'Close inquiry'}
          </button>
        )}
      </div>
      {message && <div className="form-success" role="status" style={{ marginBottom: '16px' }}>{message}</div>}
      {error && <div className="form-error" role="alert" style={{ marginBottom: '16px' }}>{error}</div>}
      <div className="inquiry-detail-grid">
        <article className="dashboard-panel">
          <p className="eyebrow">{user.role === 'gardener' ? 'Provider decision-support view' : 'Request & AI-assisted scope'}</p>
          <h2>Project details</h2>
          <p className="inquiry-description">{inquiry.description}</p>
          {inquiry.ai_summary && (
            <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(46, 107, 64, 0.06)' }}>
              <p className="form-note" style={{ margin: 0 }}>
                <strong>Client-reviewed AI requirement summary:</strong> {inquiry.ai_summary}
              </p>
            </div>
          )}
          <div className="detail-facts">
            <span><strong>Requested date</strong>{formatDate(inquiry.requested_date) || 'Not specified'}</span>
            <span><strong>Location</strong>{inquiry.location || 'Not specified'}</span>
            {inquiry.area_sqm !== null && inquiry.area_sqm !== undefined && (
              <span><strong>Garden area</strong>{Number(inquiry.area_sqm)} sq. meters</span>
            )}
            {inquiry.expires_at && <span><strong>Expires</strong>{formatDate(inquiry.expires_at)}</span>}
          </div>
          {(inquiry.estimated_min_amount || inquiry.area_sqm || inquiry.price_comment || inquiry.site_visit_requested) && (
            <div className="estimate-summary-card">
              <div className="price-predictor-range-row">
                <div>
                  <span className="eyebrow" style={{ margin: 0 }}>System indicative estimate</span>
                  {inquiry.estimated_min_amount && inquiry.estimated_max_amount ? (
                    <strong className="price-predictor-range">
                      {formatEstimateRange(inquiry.estimated_min_amount, inquiry.estimated_max_amount)}
                    </strong>
                  ) : (
                    <strong className="price-predictor-range">To be assessed</strong>
                  )}
                </div>
                {Boolean(inquiry.site_visit_requested) && (
                  <span className="site-visit-pill">
                    <ClipboardCheck size={14} /> Client open to on-site ocular visit
                  </span>
                )}
              </div>
              <div className="estimate-meta-grid">
                {inquiry.area_sqm && <span><strong>Area:</strong> {Number(inquiry.area_sqm)} m²</span>}
                {inquiry.work_complexity && (
                  <span><strong>Condition:</strong> {COMPLEXITY_LABELS[inquiry.work_complexity] || inquiry.work_complexity}</span>
                )}
                {inquiry.materials_option && (
                  <span><strong>Materials:</strong> {MATERIALS_LABELS[inquiry.materials_option] || inquiry.materials_option}</span>
                )}
              </div>
              {(inquiry.estimated_labor_min || inquiry.estimated_materials_max > 0) && (
                <div className="estimate-breakdown-totals">
                  {inquiry.estimated_labor_min && (
                    <span><strong>Labor estimate:</strong> {formatEstimateRange(inquiry.estimated_labor_min, inquiry.estimated_labor_max)}</span>
                  )}
                  <span>
                    <strong>Plants &amp; materials:</strong>{' '}
                    {Number(inquiry.estimated_materials_max) > 0
                      ? formatEstimateRange(inquiry.estimated_materials_min, inquiry.estimated_materials_max)
                      : '₱0 (Client provides)'}
                  </span>
                </div>
              )}
              {Array.isArray(data.estimateItems) && data.estimateItems.length > 0 && (
                <ul className="estimate-items-list">
                  {data.estimateItems.map((item) => (
                    <li key={item.id}>
                      <span>{item.item_name} ({Number(item.quantity)} × {item.unit})</span>
                      <strong>{formatEstimateRange(item.subtotal_min, item.subtotal_max)}</strong>
                    </li>
                  ))}
                </ul>
              )}
              {inquiry.price_comment && (
                <p className="estimate-client-comment">
                  <strong>Client price / budget comment:</strong> {inquiry.price_comment}
                </p>
              )}
              <p className="field-note" style={{ margin: 0 }}>{ESTIMATE_DISCLAIMER}</p>
            </div>
          )}
          {images.length > 0 && (
            <div className="inquiry-photos-section">
              <h3>Garden photos & space descriptions ({images.length})</h3>
              <div className="inquiry-photo-list">
                {images.map((img) => (
                  <figure className={`inquiry-photo-card${img.ai_description ? ' has-notes' : ''}`} key={img.id}>
                    <a className="inquiry-photo-thumb" href={getRequestImageUrl(img.id)} target="_blank" rel="noreferrer">
                      <img
                        src={getRequestImageUrl(img.id)}
                        alt={`Garden photo #${img.id}`}
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                          const fallback = event.currentTarget.nextElementSibling
                          if (fallback) fallback.style.display = 'grid'
                        }}
                      />
                      <span className="inquiry-photo-fallback" style={{ display: 'none' }}>Photo unavailable</span>
                    </a>
                    {img.ai_description && (
                      <figcaption className="inquiry-photo-notes">
                        <strong>Space notes</strong>
                        <p>{img.ai_description}</p>
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </div>
          )}
          <h2>Quotations and provider responses</h2>
          {quotations.length === 0 && <p className="form-note">No quotation has been sent yet.</p>}
          {quotations.map((quote) => (
            <div className="quotation-card" key={quote.id}>
              <div>
                <strong>
                  {quote.amount !== null && quote.amount !== undefined && quote.amount !== '' ? `₱${quote.amount}` : 'Indicative response'}
                  {quote.revision_number > 1 ? ` (v${quote.revision_number})` : ''}
                </strong>
                <span className={getStatusBadgeClass(quote.status)}>{formatStatusLabel(quote.status)}</span>
              </div>
              <p className="form-note" style={{ margin: '4px 0' }}>
                <strong>Assessment:</strong> {RESPONSE_TYPE_LABELS[quote.response_type] || quote.response_type}
                {quote.gardener_name ? ` · ${quote.gardener_name}` : ''}
                {quote.locked_at ? ' · Locked after client acceptance' : ''}
              </p>
              {Boolean(quote.requires_site_visit) && (
                <p className="site-visit-pill site-visit-pill-amber">
                  <ClipboardCheck size={14} /> On-site ocular inspection recommended before final price
                </p>
              )}
              {user.role === 'client' && quote.gardener_id && (
                <div style={{ margin: '6px 0 8px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.03)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', fontSize: '0.88rem' }}>
                    <Link className="text-link" to={`/gardeners/${quote.gardener_id}`}>
                      <strong>{quote.gardener_name}</strong>
                    </Link>
                    <span>
                      Rating: <strong>{Number(quote.gardener_rating || 0).toFixed(1)}</strong> ({quote.gardener_review_count || 0} reviews)
                    </span>
                    <span>Completed jobs: <strong>{quote.gardener_completed_bookings || 0}</strong></span>
                    {quote.gardener_experience_years !== null && quote.gardener_experience_years !== undefined && (
                      <span>Experience: <strong>{quote.gardener_experience_years} yrs</strong></span>
                    )}
                    {quote.gardener_service_area && <span>Area: {quote.gardener_service_area}</span>}
                  </div>
                  {quote.gardener_bio && (
                    <p className="form-note" style={{ margin: '4px 0 0' }}>{quote.gardener_bio}</p>
                  )}
                  {Array.isArray(quote.gardener_portfolios) && quote.gardener_portfolios.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                      {quote.gardener_portfolios.map((portfolio) => (
                        <figure key={portfolio.id} style={{ margin: 0, width: '76px' }}>
                          <img
                            src={servicesApi.imageUrl(portfolio.id)}
                            alt={portfolio.title || 'Portfolio work'}
                            style={{ width: '76px', height: '58px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.12)' }}
                          />
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p>{quote.details}</p>
              {(quote.labor_amount !== null && quote.labor_amount !== undefined) || (quote.materials_amount !== null && quote.materials_amount !== undefined) ? (
                <div className="estimate-breakdown-totals" style={{ margin: '6px 0' }}>
                  {quote.labor_amount !== null && quote.labor_amount !== undefined && (
                    <span><strong>Labor:</strong> {formatPeso(quote.labor_amount)}</span>
                  )}
                  {quote.materials_amount !== null && quote.materials_amount !== undefined && (
                    <span><strong>Plants &amp; materials:</strong> {formatPeso(quote.materials_amount)}</span>
                  )}
                </div>
              ) : null}
              {quote.materials_breakdown && (
                <p className="form-note" style={{ marginTop: '4px' }}>
                  <strong>Plants &amp; materials breakdown:</strong> {quote.materials_breakdown}
                </p>
              )}
              {quote.proposed_changes && (
                <p className="form-note" style={{ marginTop: '6px' }}>
                  <strong>Proposed modifications:</strong> {quote.proposed_changes}
                </p>
              )}
              <small>
                {quote.availability_start
                  ? `Availability: ${formatDate(quote.availability_start)} to ${formatDate(quote.availability_end) || 'open'}`
                  : 'Availability to be discussed'}
                {quote.estimated_working_days ? ` · Est. ${Number(quote.estimated_working_days)} working ${Number(quote.estimated_working_days) === 1 ? 'day' : 'days'}` : ''}
                {quote.estimated_hours ? ` (${Number(quote.estimated_hours)} hrs)` : ''}
                {quote.valid_until ? ` · Valid until ${formatDate(quote.valid_until)}` : ''}
              </small>
              {user.role === 'client' && quote.status === 'sent' && ['open', 'responded'].includes(inquiry.status) && (
                <div className="inline-actions">
                  {quote.response_type !== 'cannot_do' && (
                    <button className="button" type="button" disabled={updatingStatus} onClick={() => quoteStatus(quote.id, 'accepted')}>
                      {updatingStatus ? 'Saving...' : 'Accept offer'}
                    </button>
                  )}
                  <button className="table-action" type="button" disabled={updatingStatus} onClick={() => quoteStatus(quote.id, 'declined')}>
                    {updatingStatus ? 'Saving...' : 'Decline'}
                  </button>
                  <button className="table-action" type="button" onClick={() => openConversation(quote.gardener_id)}>
                    Message provider
                  </button>
                </div>
              )}
              {user.role === 'gardener' && quote.gardener_id === user.id && quote.status === 'sent' && !quote.locked_at && ['open', 'responded'].includes(inquiry.status) && (
                <div className="inline-actions">
                  <button className="table-action" type="button" disabled={updatingStatus} onClick={() => startReviseQuote(quote)}>
                    Revise offer
                  </button>
                  <button className="table-action" type="button" disabled={updatingStatus} onClick={() => handleWithdrawQuote(quote.id)}>
                    {updatingStatus ? 'Saving...' : 'Withdraw'}
                  </button>
                </div>
              )}
              {user.role === 'client' && quote.status === 'accepted' && !activeAgreement && (
                <div className="inline-actions">
                  <Link className="button" to={`/bookings/new?inquiryId=${inquiry.id}&quotationId=${quote.id}`}>Propose mutual agreement</Link>
                  <button className="table-action" type="button" disabled={updatingStatus} onClick={() => quoteStatus(quote.id, 'declined')}>
                    {updatingStatus ? 'Saving...' : 'Decline selected offer'}
                  </button>
                  <button className="table-action" type="button" onClick={() => openConversation(quote.gardener_id)}>
                    Message provider
                  </button>
                </div>
              )}
              {Array.isArray(quote.revisions) && quote.revisions.length > 0 && (
                <details style={{ marginTop: '8px' }}>
                  <summary>Offer revision history ({quote.revisions.length} previous {quote.revisions.length === 1 ? 'version' : 'versions'})</summary>
                  {quote.revisions.map((rev) => (
                    <div key={rev.id} style={{ marginTop: '6px', paddingLeft: '10px', borderLeft: '2px solid rgba(0,0,0,0.12)' }}>
                      <small>
                        <strong>v{rev.revision_number}</strong> ({RESPONSE_TYPE_LABELS[rev.response_type] || rev.response_type})
                        {rev.amount !== null && rev.amount !== undefined ? ` — ₱${rev.amount}` : ''}
                        {rev.requires_site_visit ? ' · On-site inspection requested' : ''}
                      </small>
                      <p style={{ margin: '2px 0' }}>{rev.details}</p>
                      {rev.proposed_changes && <small>Proposed modifications: {rev.proposed_changes}</small>}
                    </div>
                  ))}
                </details>
              )}
            </div>
          ))}
          {activeAgreement && (
            <div className="quotation-card" style={{ marginTop: '18px' }}>
              <div>
                <strong>Mutual Agreement v{activeAgreement.version} — ₱{activeAgreement.amount}</strong>
                <span className={getStatusBadgeClass(activeAgreement.status)}>{formatStatusLabel(activeAgreement.status)}</span>
              </div>
              <p>{activeAgreement.scope_of_work}</p>
              <small>
                Schedule: {new Date(activeAgreement.scheduled_start).toLocaleString()} to {new Date(activeAgreement.scheduled_end).toLocaleString()} · Location: {activeAgreement.location}
              </small>
              <p className="form-note" style={{ marginTop: '8px' }}>
                Client approval: {activeAgreement.client_approved_at ? 'Approved' : 'Pending'} · Gardener approval: {activeAgreement.gardener_approved_at ? 'Approved' : 'Pending'}
              </p>
              {activeAgreement.status === 'proposed' && (
                <div className="inline-actions" style={{ marginTop: '10px' }}>
                  {((user.role === 'client' && !activeAgreement.client_approved_at) || (user.role === 'gardener' && !activeAgreement.gardener_approved_at)) && (
                    <button className="button" type="button" disabled={updatingStatus} onClick={() => approveCurrentAgreement(activeAgreement)}>
                      {updatingStatus ? 'Saving...' : `Approve v${activeAgreement.version}`}
                    </button>
                  )}
                  <button className="table-action" type="button" onClick={() => setEditingAgreement((open) => !open)}>
                    {editingAgreement ? 'Cancel edit' : 'Edit terms (creates new version)'}
                  </button>
                </div>
              )}
              {activeAgreement.booking_id && (
                <div className="inline-actions" style={{ marginTop: '10px' }}>
                  <Link className="button" to={`/bookings/${activeAgreement.booking_id}`}>View confirmed booking #{activeAgreement.booking_id}</Link>
                </div>
              )}
              {editingAgreement && activeAgreement.status === 'proposed' && (
                <form className="profile-form" onSubmit={(e) => saveAgreementRevision(e, activeAgreement)} style={{ marginTop: '14px' }}>
                  <label>Scope of work
                    <textarea required rows="3" value={agreementForm.scopeOfWork} onChange={(e) => setAgreementForm({ ...agreementForm, scopeOfWork: e.target.value })} />
                  </label>
                  <div className="form-row">
                    <label>Agreed price (PHP)
                      <input required type="number" min="0" step="0.01" value={agreementForm.amount} onChange={(e) => setAgreementForm({ ...agreementForm, amount: e.target.value })} />
                    </label>
                    <label>Price basis
                      <input value={agreementForm.priceBasis} onChange={(e) => setAgreementForm({ ...agreementForm, priceBasis: e.target.value })} />
                    </label>
                  </div>
                  <div className="form-row">
                    <label>Start date and time
                      <input required type="datetime-local" value={agreementForm.scheduledStart} onChange={(e) => setAgreementForm({ ...agreementForm, scheduledStart: e.target.value })} />
                    </label>
                    <label>End date and time
                      <input required type="datetime-local" value={agreementForm.scheduledEnd} onChange={(e) => setAgreementForm({ ...agreementForm, scheduledEnd: e.target.value })} />
                    </label>
                  </div>
                  <label>Location
                    <input required maxLength="255" value={agreementForm.location} onChange={(e) => setAgreementForm({ ...agreementForm, location: e.target.value })} />
                  </label>
                  <label>Conditions
                    <textarea rows="2" value={agreementForm.conditions} onChange={(e) => setAgreementForm({ ...agreementForm, conditions: e.target.value })} />
                  </label>
                  <button className="button" type="submit" disabled={updatingStatus}>
                    {updatingStatus ? 'Saving...' : `Save as v${activeAgreement.version + 1} (resets approvals)`}
                  </button>
                </form>
              )}
            </div>
          )}
          {agreements.length > 1 && (
            <details style={{ marginTop: '12px' }}>
              <summary>Agreement version history ({agreements.length} versions)</summary>
              {agreements.map((ver) => (
                <div className="quotation-card" key={ver.id} style={{ marginTop: '8px' }}>
                  <strong>v{ver.version} ({formatStatusLabel(ver.status)}) — ₱{ver.amount}</strong>
                  <p>{ver.scope_of_work}</p>
                </div>
              ))}
            </details>
          )}
        </article>
        {canGardenerRespond && (
          <form className="dashboard-panel profile-form" onSubmit={sendQuote}>
            <p className="eyebrow">{editingQuoteId ? 'Revise active offer' : 'Respond to client'}</p>
            <h2>{editingQuoteId ? 'Update your offer before acceptance.' : 'Evaluate feasibility and send an offer.'}</h2>
            {inquiry.estimated_min_amount && inquiry.estimated_max_amount && (
              <div className="gardener-estimate-ref">
                <strong>System predicted range: {formatEstimateRange(inquiry.estimated_min_amount, inquiry.estimated_max_amount)}</strong>
                {inquiry.area_sqm ? ` (${Number(inquiry.area_sqm)} m²)` : ''}
                {inquiry.price_comment && <p className="field-note" style={{ margin: '4px 0 0' }}>Client note: &ldquo;{inquiry.price_comment}&rdquo;</p>}
              </div>
            )}
            <label>Response type
              <select value={form.responseType} onChange={change('responseType')}>
                <option value="offer">Standard offer</option>
                {inquiry.request_type === 'general' && <option value="interest">Expression of interest</option>}
                <option value="feasible">Feasible as requested</option>
                <option value="modifications">Feasible with modifications</option>
                <option value="cannot_do">Cannot fulfill request</option>
              </select>
            </label>
            {form.responseType !== 'cannot_do' && (
              <>
                <div className="form-row form-row-3">
                  <label>Labor cost (PHP) <span className="label-note">(Optional split)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 1500"
                      value={form.laborAmount}
                      onChange={(e) => handleQuoteSplitChange('laborAmount', e.target.value)}
                    />
                  </label>
                  <label>Plants &amp; materials (PHP) <span className="label-note">(Optional split)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 1200"
                      value={form.materialsAmount}
                      onChange={(e) => handleQuoteSplitChange('materialsAmount', e.target.value)}
                    />
                  </label>
                  <label>Total indicative amount (PHP)
                    <input type="number" min="0" step="0.01" value={form.amount} onChange={change('amount')} />
                  </label>
                </div>
                <label>Plants &amp; materials breakdown note <span className="label-note">(Optional — e.g., 10 bougainvilleas ₱1,500 + 4 bags soil ₱400)</span>
                  <textarea
                    rows="2"
                    maxLength="2000"
                    value={form.materialsBreakdown}
                    onChange={change('materialsBreakdown')}
                    placeholder="Itemize plant varieties, soil, fertilizer, turf, or hauling included in your materials estimate."
                  />
                </label>
                <label className="site-visit-checkbox">
                  <input
                    type="checkbox"
                    checked={form.requiresSiteVisit}
                    onChange={(e) => setForm((current) => ({ ...current, requiresSiteVisit: e.target.checked }))}
                  />
                  <span>Requires an on-site ocular inspection before giving or finalizing the exact price</span>
                </label>
              </>
            )}
            <label>Details
              <textarea required rows="4" value={form.details} onChange={change('details')} placeholder="Explain what is included, feasibility assessment, and any conditions." />
            </label>
            {form.responseType === 'modifications' && (
              <label>Proposed modifications
                <textarea required rows="3" value={form.proposedChanges} onChange={change('proposedChanges')} placeholder="Describe suggested adjustments to scope, schedule, or materials." />
              </label>
            )}
            {form.responseType !== 'cannot_do' && (
              <>
                <div className="form-row">
                  <label>Estimated working days <span className="label-note">(Optional)</span>
                    <input type="number" min="0.5" max="90" step="0.5" placeholder="e.g., 1.5" value={form.estimatedWorkingDays} onChange={change('estimatedWorkingDays')} />
                  </label>
                  <label>Estimated hours <span className="label-note">(Optional)</span>
                    <input type="number" min="0.5" max="500" step="0.5" placeholder="e.g., 4" value={form.estimatedHours} onChange={change('estimatedHours')} />
                  </label>
                </div>
                <div className="form-row">
                  <label>Available from<input type="date" value={form.availabilityStart} onChange={change('availabilityStart')} /></label>
                  <label>Available until<input type="date" value={form.availabilityEnd} onChange={change('availabilityEnd')} /></label>
                </div>
                <label>Quotation valid until<input type="date" value={form.validUntil} onChange={change('validUntil')} /></label>
              </>
            )}
            <div className="inline-actions">
              <button className="button" type="submit" disabled={submittingQuote}>
                {submittingQuote ? 'Saving...' : editingQuoteId ? 'Save revised offer' : 'Send response'}
              </button>
              {editingQuoteId && (
                <button className="table-action" type="button" onClick={cancelReviseQuote}>
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  )
}

export default function InquiryPage({ detail = false, create = false }) {
  const { inquiryId } = useParams()
  return <main className="marketplace-page protected-page"><AppSidebar />{detail ? <InquiryDetails id={inquiryId} /> : create ? <InquiryForm /> : <InquiryList />}</main>
}

function InquiryList() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const activeTab = user?.role === 'gardener' && params.get('tab') === 'open' ? 'open' : 'mine'
  const [inquiries, setInquiries] = useState([])
  const [inquiryCovers, setInquiryCovers] = useState({})
  const [openRequests, setOpenRequests] = useState([])
  const [categories, setCategories] = useState([])
  const [filters, setFilters] = useState({ categoryId: '', area: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.role === 'gardener') {
      servicesApi.categories().then((res) => setCategories(res.categories || [])).catch(() => {})
    }
  }, [user?.role])

  useEffect(() => {
    let active = true
    const run = async () => {
      setLoading(true)
      setError('')
      try {
        if (activeTab === 'open' && user?.role === 'gardener') {
          const result = await inquiriesApi.listOpen(filters)
          if (active) setOpenRequests(Array.isArray(result?.requests) ? result.requests : [])
        } else {
          const result = await inquiriesApi.list()
          const list = Array.isArray(result?.inquiries) ? result.inquiries : []
          if (!active) return
          setInquiries(list)

          const ids = list.map((item) => item.id).filter(Boolean)
          if (ids.length > 0) {
            const settled = await Promise.allSettled(
              ids.map((inqId) => fetchInquiryImages(inqId).then((res) => [inqId, res.images?.[0]?.id || null])),
            )
            if (!active) return
            const nextCovers = {}
            for (const entry of settled) {
              if (entry.status === 'fulfilled') {
                const [inqId, imageId] = entry.value
                if (imageId) nextCovers[inqId] = getRequestImageUrl(imageId)
              }
            }
            setInquiryCovers(nextCovers)
          }
        }
      } catch (loadError) {
        if (active) setError(loadError.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    run()
    return () => { active = false }
  }, [activeTab, filters, user?.role])

  return (
    <section className="container inquiry-content">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <p className="eyebrow">{activeTab === 'open' ? 'Open service requests board' : 'Requests, offers & agreements'}</p>
          <h1>{activeTab === 'open' ? 'Browse open client requests.' : 'Inquiries and offers.'}</h1>
        </div>
        {user?.role === 'client' && (
          <div className="inline-actions">
            <Link className="button" to="/inquiries/new?type=general">Post general service request</Link>
            <Link className="button button-outline" to="/services">Browse services</Link>
          </div>
        )}
        {user?.role === 'gardener' && (
          <div className="inline-actions">
            <button
              className={activeTab === 'mine' ? 'button' : 'button button-outline'}
              type="button"
              onClick={() => setParams({})}
            >
              My inquiries & offers
            </button>
            <button
              className={activeTab === 'open' ? 'button' : 'button button-outline'}
              type="button"
              onClick={() => setParams({ tab: 'open' })}
            >
              Open requests board
            </button>
          </div>
        )}
      </div>

      {activeTab === 'open' && user?.role === 'gardener' && (
        <div className="dashboard-panel profile-form" style={{ marginTop: '14px', marginBottom: '16px' }}>
          <div className="form-row">
            <label>Filter by category
              <select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}>
                <option value="">All categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </label>
            <label>Filter by barangay / area
              <input
                value={filters.area}
                onChange={(e) => setFilters({ ...filters, area: e.target.value })}
                placeholder="e.g. Tetuan, Pasonanca, Zamboanga City"
              />
            </label>
          </div>
        </div>
      )}

      {loading && <p>Loading requests...</p>}
      {error && <div className="form-error" role="alert">{error}</div>}

      {!loading && !error && activeTab === 'mine' && inquiries.length === 0 && (
        <div className="empty-state">You do not have any inquiries yet.</div>
      )}

      {!loading && !error && activeTab === 'mine' && inquiries.length > 0 && (
        <div className="marketplace-grid marketplace-card-grid" style={{ marginTop: '20px' }}>
          {inquiries.map((inquiry) => {
            const coverUrl = inquiryCovers[inquiry.id] || null
            const partnerLabel = user?.role === 'gardener'
              ? `${inquiry.client_first_name || ''} ${inquiry.client_last_name || ''}`.trim() || 'Client'
              : inquiry.gardener_name || (inquiry.offer_count > 0 ? `${inquiry.offer_count} provider ${Number(inquiry.offer_count) === 1 ? 'offer' : 'offers'}` : 'Open to providers')
            return (
              <article className="marketplace-card visual-market-card" key={inquiry.id}>
                <div className="marketplace-card-media">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={inquiry.subject}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <div className="marketplace-card-placeholder" aria-hidden="true">
                      <Leaf size={26} />
                      <span>{inquiry.request_type === 'general' ? 'General request' : 'Direct inquiry'}</span>
                    </div>
                  )}
                  <span className={`${getStatusBadgeClass(inquiry.status)} media-status-badge`}>
                    {formatStatusLabel(inquiry.status)}
                  </span>
                </div>
                <div className="marketplace-card-body">
                  <h2>{inquiry.subject}</h2>
                  <p>{inquiry.ai_summary || inquiry.description || 'Gardening service inquiry.'}</p>
                  <div className="service-meta">
                    <span>
                      {partnerLabel}
                      {inquiry.area_sqm ? ` · ${Number(inquiry.area_sqm)} m²` : ''}
                    </span>
                    <strong className="card-price">
                      {inquiry.my_quotation_amount != null
                        ? `₱${Number(inquiry.my_quotation_amount).toLocaleString()}`
                        : formatEstimateRange(inquiry.estimated_min_amount, inquiry.estimated_max_amount)
                          ? `Est. ${formatEstimateRange(inquiry.estimated_min_amount, inquiry.estimated_max_amount)}`
                          : inquiry.offer_count > 0
                            ? `${inquiry.offer_count} ${Number(inquiry.offer_count) === 1 ? 'offer' : 'offers'}`
                            : inquiry.service_title || inquiry.category_name || 'Request'}
                    </strong>
                  </div>
                  <div className="marketplace-card-footer">
                    <span className="card-area"><MapPin size={13} /> {inquiry.location || 'Zamboanga City'}</span>
                    <Link className="card-cta" to={`/inquiries/${inquiry.id}`}>
                      View details <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {!loading && !error && activeTab === 'open' && openRequests.length === 0 && (
        <div className="empty-state">No open general service requests match your filters right now.</div>
      )}

      {!loading && !error && activeTab === 'open' && openRequests.length > 0 && (
        <div className="marketplace-grid marketplace-card-grid" style={{ marginTop: '20px' }}>
          {openRequests.map((reqItem) => {
            const firstImageId = Array.isArray(reqItem.images) && reqItem.images[0]?.id
            const coverUrl = firstImageId ? getRequestImageUrl(firstImageId) : null
            return (
              <article className="marketplace-card visual-market-card" key={reqItem.id}>
                <div className="marketplace-card-media">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={reqItem.subject}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <div className="marketplace-card-placeholder" aria-hidden="true">
                      <Leaf size={26} />
                      <span>{reqItem.category_name || 'General gardening'}</span>
                    </div>
                  )}
                  <span className={`${getStatusBadgeClass(reqItem.status)} media-status-badge`}>
                    {formatStatusLabel(reqItem.status)}
                  </span>
                </div>
                <div className="marketplace-card-body">
                  <h2>{reqItem.subject}</h2>
                  <p>{reqItem.ai_summary || reqItem.description || 'Open client gardening request.'}</p>
                  <div className="service-meta">
                    <span>
                      {reqItem.client_first_name ? `Client: ${reqItem.client_first_name}` : 'Local client'}
                      {reqItem.area_sqm ? ` · ${Number(reqItem.area_sqm)} m²` : ''}
                    </span>
                    <strong className="card-price">
                      {formatEstimateRange(reqItem.estimated_min_amount, reqItem.estimated_max_amount)
                        ? `Est. ${formatEstimateRange(reqItem.estimated_min_amount, reqItem.estimated_max_amount)}`
                        : reqItem.my_quotation_status
                          ? `Offer ${formatStatusLabel(reqItem.my_quotation_status)}`
                          : reqItem.offer_count > 0
                            ? `${reqItem.offer_count} offer(s)`
                            : 'Open for offers'}
                    </strong>
                  </div>
                  <div className="marketplace-card-footer">
                    <span className="card-area"><MapPin size={13} /> {reqItem.location || 'Zamboanga City'}</span>
                    <Link className="card-cta" to={`/inquiries/${reqItem.id}`}>
                      View details <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
