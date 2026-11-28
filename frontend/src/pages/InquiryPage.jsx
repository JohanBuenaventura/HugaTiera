import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Calculator, Check, CheckCircle2, ClipboardCheck, Clock3, Layers, Leaf, MapPin, MessageSquareText, Plus, Search, ShieldCheck, Sparkles, Star, X } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { agreementsApi } from '../services/agreements'
import { formatStatusLabel, getStatusBadgeClass } from '../services/bookings'
import { fetchSmartRecommendations, requestPhotoAnalysis, requestRequirementAssistance } from '../services/ai'
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
  formatCategorySpecsForDisplay,
  resolveCategoryTemplate,
} from '../services/categorySpecs'
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
import { GardenPlanningIllustration } from '../components/BotanicalIllustrations'
import TransientSuccess from '../components/TransientSuccess'
import { OTHER_BARANGAY_VALUE, ZAMBOANGA_BARANGAYS } from '../utils/zamboangaAddress'

function formatDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const INQUIRY_STEPS = [
  { id: 1, label: 'Basics' },
  { id: 2, label: 'Size & estimate' },
  { id: 3, label: 'Details & photos' },
  { id: 4, label: 'Review & send' },
]

function InquiryForm() {
  const { user, switchRole } = useAuth()
  const [barangayChoice, setBarangayChoice] = useState('')
  const [customBarangay, setCustomBarangay] = useState('')
  const [switchingToClient, setSwitchingToClient] = useState(false)
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
  const [categorySpecs, setCategorySpecs] = useState({})
  const validServiceId = Boolean(serviceId && /^\d+$/.test(serviceId))
  const validGardenerId = Boolean(gardenerId && /^\d+$/.test(gardenerId))
  const isGeneralRequest = typeParam === 'general' || (!validServiceId && !validGardenerId)

  const [form, setForm] = useState({
    subject: params.get('subject') || '',
    description: params.get('description') || '',
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
  const [inquiryStep, setInquiryStep] = useState(1)

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

  function updateBarangayChoice(value) {
    setBarangayChoice(value)
    if (value !== OTHER_BARANGAY_VALUE) {
      setCustomBarangay('')
      setForm((current) => ({ ...current, location: value ? `Brgy. ${value}, Zamboanga City` : '' }))
      return
    }
    setForm((current) => ({ ...current, location: customBarangay ? `Brgy. ${customBarangay}, Zamboanga City` : '' }))
  }

  function updateCustomBarangay(value) {
    setCustomBarangay(value)
    setForm((current) => ({
      ...current,
      location: value ? `Brgy. ${value}, Zamboanga City` : '',
    }))
  }

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
  const activeCategoryTemplate = resolveCategoryTemplate(selectedCategory?.name || service?.category_name || '')
  const orderedPricingAddons = [...pricingAddons].sort((a, b) => {
    const aRec = activeCategoryTemplate.recommendedAddonTypes?.includes(a.item_type) ? 0 : 1
    const bRec = activeCategoryTemplate.recommendedAddonTypes?.includes(b.item_type) ? 0 : 1
    return aRec - bRec
  })

  function handleSpecChange(fieldKey, value) {
    setCategorySpecs((prev) => ({ ...prev, [fieldKey]: value }))
  }

  function toggleSpecOption(fieldKey, optionLabel) {
    setCategorySpecs((prev) => {
      const current = Array.isArray(prev[fieldKey]) ? prev[fieldKey] : []
      const exists = current.includes(optionLabel)
      return {
        ...prev,
        [fieldKey]: exists ? current.filter((v) => v !== optionLabel) : [...current, optionLabel],
      }
    })
  }

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

  function validateInquiryStep(formEl) {
    const panel = formEl?.querySelector('.inquiry-step-panel')
    if (!panel) return true
    const fields = Array.from(panel.querySelectorAll('[required]'))
    const invalid = fields.find((field) => !field.checkValidity())
    if (invalid) {
      invalid.reportValidity()
      return false
    }
    return true
  }

  function handleBackStep() {
    setError('')
    setInquiryStep((current) => Math.max(1, current - 1))
  }

  async function submit(event) {
    event.preventDefault()
    if (inquiryStep < INQUIRY_STEPS.length) {
      if (!validateInquiryStep(event.currentTarget)) return
      setError('')
      setInquiryStep((current) => Math.min(INQUIRY_STEPS.length, current + 1))
      return
    }
    setSaving(true)
    setError('')
    try {
      const cleanedSpecs = {}
      for (const field of activeCategoryTemplate.fields) {
        const raw = categorySpecs[field.key]
        if (raw === undefined || raw === null || raw === '') continue
        if (field.type === 'number') {
          const num = Number(raw)
          if (Number.isFinite(num) && num > 0) cleanedSpecs[field.key] = num
        } else if (field.type === 'multiselect') {
          if (Array.isArray(raw) && raw.length > 0) cleanedSpecs[field.key] = raw
        } else if (typeof raw === 'string' && raw.trim()) {
          cleanedSpecs[field.key] = raw.trim()
        }
      }
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
        categorySpecs: Object.keys(cleanedSpecs).length > 0 ? cleanedSpecs : null,
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

  if (user?.role === 'gardener') {
    return (
      <section className="container inquiry-content">
        <Link className="back-link" to="/inquiries">
          <ArrowLeft size={15} /> Back to inquiries
        </Link>
        <div className="dashboard-panel">
          <p className="eyebrow">Client action required</p>
          <h1>Switch to Client Mode to submit a request.</h1>
          <p className="field-note">
            You are currently signed in under Gardener Mode. Submitting a general service request or direct inquiry is available in Client Mode.
          </p>
          {error && <div className="form-error" role="alert" style={{ marginTop: '12px' }}>{error}</div>}
          <div className="inline-actions" style={{ marginTop: '16px' }}>
            {user.isDualRole && (
              <button
                type="button"
                className="button"
                disabled={switchingToClient}
                onClick={async () => {
                  setSwitchingToClient(true)
                  setError('')
                  try {
                    await switchRole('client')
                  } catch (switchErr) {
                    setError(switchErr.message || 'Unable to switch to Client Mode right now.')
                  } finally {
                    setSwitchingToClient(false)
                  }
                }}
              >
                {switchingToClient ? 'Switching...' : 'Switch to Client Mode'}
              </button>
            )}
            <Link className="button button-outline" to="/dashboard">Back to dashboard</Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="container inquiry-content">
      <Link className="back-link" to={isGeneralRequest ? '/inquiries' : (validGardenerId ? `/gardeners/${gardenerId}` : '/services')}>
        <ArrowLeft size={15} /> Back
      </Link>
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
        <nav className="register-stepper inquiry-stepper" aria-label="Request steps">
          {INQUIRY_STEPS.map((item) => {
            const isActive = inquiryStep === item.id
            const isDone = inquiryStep > item.id
            return (
              <button
                key={item.id}
                type="button"
                className={`register-step-pill${isActive ? ' is-active' : ''}${isDone ? ' is-done is-clickable' : ''}`}
                disabled={!isDone}
                aria-current={isActive ? 'step' : undefined}
                onClick={() => {
                  if (isDone) {
                    setError('')
                    setInquiryStep(item.id)
                  }
                }}
              >
                <span className="register-step-num" aria-hidden="true">
                  {isDone ? <Check size={12} strokeWidth={3} /> : item.id}
                </span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
        <p className="field-note inquiry-step-note">
          Fields marked <span className="required-mark" aria-hidden="true">*</span> are required. Each step is checked before you continue.
        </p>
        {inquiryStep === 1 && (
          <div className="inquiry-step-panel">
            <p className="auth-section-title">Step 1 of 4 · The basics</p>
            <label>Subject <span className="required-mark" aria-hidden="true">*</span>
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
            <div className="register-step-actions">
              <button className="button" type="submit">
                <span>Continue to size &amp; estimate</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
        {inquiryStep === 2 && (
          <div className="inquiry-step-panel">
            <p className="auth-section-title">Step 2 of 4 · Size &amp; indicative estimate</p>
            <div className="category-specs-panel" role="region" aria-label={activeCategoryTemplate.title}>
          <div className="category-specs-header">
            <div>
              <p className="eyebrow" style={{ margin: '0 0 2px' }}>
                {selectedCategory ? `Tailored for ${selectedCategory.name}` : 'Project options'}
              </p>
              <strong>{activeCategoryTemplate.title}</strong>
              <p className="field-note" style={{ margin: '2px 0 0' }}>{activeCategoryTemplate.subtitle}</p>
            </div>
          </div>
          <div className="category-specs-grid">
            {activeCategoryTemplate.fields.map((field) => {
              const val = categorySpecs[field.key]
              if (field.type === 'select') {
                return (
                  <label key={field.key}>
                    {field.label}
                    <select
                      value={typeof val === 'string' ? val : ''}
                      onChange={(e) => handleSpecChange(field.key, e.target.value)}
                    >
                      <option value="">Select an option (optional)</option>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </label>
                )
              }
              if (field.type === 'multiselect') {
                const selectedList = Array.isArray(val) ? val : []
                return (
                  <div className="category-spec-multiselect" key={field.key}>
                    <span className="category-spec-label">{field.label}</span>
                    <div className="category-spec-chips">
                      {field.options.map((opt) => {
                        const active = selectedList.includes(opt)
                        return (
                          <label className={`ai-toggle-chip${active ? ' is-checked' : ''}`} key={opt}>
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleSpecOption(field.key, opt)}
                            />
                            <span>{opt}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              }
              if (field.type === 'textarea') {
                return (
                  <label className="category-spec-wide" key={field.key}>
                    {field.label}
                    <textarea
                      rows="2"
                      maxLength="500"
                      placeholder={field.placeholder || ''}
                      value={typeof val === 'string' ? val : ''}
                      onChange={(e) => handleSpecChange(field.key, e.target.value)}
                    />
                  </label>
                )
              }
              if (field.type === 'number') {
                return (
                  <label key={field.key}>
                    {field.label}
                    <input
                      type="number"
                      min="1"
                      step={field.isCurrency ? '50' : '1'}
                      placeholder={field.placeholder || ''}
                      value={val ?? ''}
                      onChange={(e) => handleSpecChange(field.key, e.target.value)}
                    />
                  </label>
                )
              }
              return (
                <label className="category-spec-wide" key={field.key}>
                  {field.label}
                  <input
                    maxLength="500"
                    placeholder={field.placeholder || ''}
                    value={typeof val === 'string' ? val : ''}
                    onChange={(e) => handleSpecChange(field.key, e.target.value)}
                  />
                </label>
              )
            })}
          </div>
        </div>

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
              {activeCategoryTemplate.areaLabel} <span className="required-mark" aria-hidden="true">*</span>
              <input
                type="number"
                required
                min="0.5"
                max="50000"
                step="0.5"
                placeholder={activeCategoryTemplate.areaPlaceholder}
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
                {orderedPricingAddons.map((addon) => {
                  const isChecked = selectedAddonsMap[addon.id] !== undefined
                  const isRecommendedForCat = Boolean(selectedCategory && activeCategoryTemplate.recommendedAddonTypes?.includes(addon.item_type))
                  return (
                    <div className={`addon-picker-item${isChecked ? ' is-selected' : ''}`} key={addon.id}>
                      <label className="addon-picker-check">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => toggleAddonItem(addon.id, e.target.checked)}
                        />
                        <span>
                          <strong>
                            {addon.name}
                            {isRecommendedForCat && <span className="addon-rec-tag">Common for {selectedCategory.name}</span>}
                          </strong>
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
            <div className="register-step-actions">
              <button type="button" className="register-back-btn" onClick={handleBackStep}>
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <button className="button" type="submit">
                <span>Continue to details &amp; photos</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
        {inquiryStep === 3 && (
          <div className="inquiry-step-panel">
            <p className="auth-section-title">Step 3 of 4 · Details &amp; garden photos</p>
            <label>What are you looking for? <span className="required-mark" aria-hidden="true">*</span>
              <textarea required rows="5" maxLength="5000" value={form.description} onChange={change('description')} placeholder={activeCategoryTemplate.descriptionPlaceholder} />
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
            <select value={barangayChoice} onChange={(event) => updateBarangayChoice(event.target.value)}>
              <option value="">Select barangay...</option>
              {ZAMBOANGA_BARANGAYS.map((brgy) => <option key={brgy} value={brgy}>{brgy}</option>)}
              <option value={OTHER_BARANGAY_VALUE}>Other (type manually)</option>
            </select>
          </label>
        </div>
        {barangayChoice === OTHER_BARANGAY_VALUE && (
          <label>Specify barangay
            <input maxLength="80" value={customBarangay} onChange={(event) => updateCustomBarangay(event.target.value)} placeholder="Enter barangay name" />
          </label>
        )}
        {form.location && (
          <p className="field-note">Shared with providers as: <strong>{form.location}</strong> — exact address shared later.</p>
        )}
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
            <div className="register-step-actions">
              <button type="button" className="register-back-btn" onClick={handleBackStep}>
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <button className="button" type="submit">
                <span>Review your request</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
        {inquiryStep === 4 && (
          <div className="inquiry-step-panel">
            <p className="auth-section-title">Step 4 of 4 · Review &amp; send</p>
            <dl className="inquiry-review-summary">
              <div><dt>Subject</dt><dd>{form.subject || 'Not provided'}</dd></div>
              <div><dt>Area</dt><dd>{form.areaSqm ? `${form.areaSqm} sq.m` : 'Not provided'}</dd></div>
              <div><dt>Preferred date</dt><dd>{form.requestedDate ? formatDate(form.requestedDate) : 'Not specified'}</dd></div>
              <div><dt>Service area</dt><dd>{form.location || 'Not specified'}</dd></div>
              <div><dt>Garden photos</dt><dd>{uploadedImages.length > 0 ? `${uploadedImages.length} attached` : 'None attached'}</dd></div>
            </dl>
            <p className="form-note">
              {isGeneralRequest
                ? 'Your open request will be visible to approved gardeners on the Open Requests Board with area-level location only. Multiple gardeners can submit offers for you to compare before reaching a mutual agreement.'
                : 'This is an inquiry, not a confirmed booking. The gardener will evaluate feasibility and respond with an offer or suggested modifications, followed by mutual agreement.'}
            </p>
            <div className="register-step-actions">
              <button type="button" className="register-back-btn" onClick={handleBackStep}>
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <button className="button" type="submit" disabled={saving || uploadingPhoto}>
                {saving ? 'Sending...' : (isGeneralRequest ? 'Post general service request' : 'Send direct inquiry')}
              </button>
            </div>
          </div>
        )}
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

const RESPONSE_STEPS = [
  { id: 1, label: 'Response & price' },
  { id: 2, label: 'Details & schedule' },
  { id: 3, label: 'Review & send' },
]

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
  const [agreementEditStep, setAgreementEditStep] = useState(1)
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
  const [offerSortBy, setOfferSortBy] = useState('smart_ai')
  const [offerNearbyOnly, setOfferNearbyOnly] = useState(false)
  const [offerGoodConductOnly, setOfferGoodConductOnly] = useState(false)
  const [offerAiRanking, setOfferAiRanking] = useState(null)
  const [responseStep, setResponseStep] = useState(1)
  const [detailTab, setDetailTab] = useState('offers')
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
  useEffect(() => {
    if (user.role !== 'client' || !data?.inquiry?.id || !Array.isArray(data?.quotations) || data.quotations.length === 0) {
      return undefined
    }
    let active = true
    fetchSmartRecommendations({
      mode: 'offers',
      inquiryId: data.inquiry.id,
      sortBy: offerSortBy,
      nearbyOnly: offerNearbyOnly,
      goodConductOnly: offerGoodConductOnly,
    })
      .then((res) => {
        if (active) setOfferAiRanking(res?.recommendations || [])
      })
      .catch(() => {
        if (active) setOfferAiRanking(null)
      })
    return () => { active = false }
  }, [user.role, data?.inquiry?.id, data?.quotations, offerSortBy, offerNearbyOnly, offerGoodConductOnly])
  function startReviseQuote(quote) {
    setEditingQuoteId(quote.id)
    setResponseStep(1)
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
    setResponseStep(1)
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
  function validateResponseStep(formEl) {
    const panel = formEl?.querySelector('.response-step-panel')
    if (!panel) return true
    const fields = Array.from(panel.querySelectorAll('[required]'))
    const invalid = fields.find((field) => !field.checkValidity())
    if (invalid) {
      invalid.reportValidity()
      return false
    }
    return true
  }

  function handleResponseBackStep() {
    setError('')
    setResponseStep((current) => Math.max(1, current - 1))
  }

  async function sendQuote(event) {
    event.preventDefault()
    if (responseStep < RESPONSE_STEPS.length) {
      if (!validateResponseStep(event.currentTarget)) return
      setError('')
      setResponseStep((current) => Math.min(RESPONSE_STEPS.length, current + 1))
      return
    }
    setError(''); setMessage(''); setSubmittingQuote(true)
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
      setResponseStep(1)
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
      setAgreementEditStep(1)
      setMessage(`Agreement updated to v${res.agreement.version}. Both parties must approve v${res.agreement.version}.`)
      await load()
    } catch (editErr) {
      setError(editErr.message)
    } finally {
      setUpdatingStatus(false)
    }
  }
  function submitAgreementRevision(event) {
    event.preventDefault()
    if (agreementEditStep === 1) {
      const panel = event.currentTarget.querySelector('.agreement-edit-panel')
      const invalid = Array.from(panel.querySelectorAll('[required]')).find((field) => !field.checkValidity())
      if (invalid) {
        invalid.reportValidity()
        return
      }
      setAgreementEditStep(2)
      return
    }
    saveAgreementRevision(event, activeAgreement)
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

  const inquiryStageIndex = inquiry.status === 'confirmed'
    ? 4
    : ['provider_selected', 'in_agreement'].includes(inquiry.status)
      ? 3
      : inquiry.status === 'responded'
        ? 2
        : 1
  const inquiryFlowClosed = ['closed', 'cancelled', 'expired'].includes(inquiry.status)
  const inquirySteps = [
    {
      num: 1,
      label: 'Request sent',
      sub: inquiry.request_type === 'general' ? 'Visible to gardeners' : 'Sent to provider',
    },
    {
      num: 2,
      label: 'Offers in',
      sub: quotations.length > 0
        ? `${quotations.length} offer${quotations.length === 1 ? '' : 's'} received`
        : 'Waiting for offers',
    },
    {
      num: 3,
      label: 'Agree terms',
      sub: activeAgreement ? `Agreement v${activeAgreement.version}` : 'Both must approve',
    },
    {
      num: 4,
      label: 'Booking confirmed',
      sub: inquiry.status === 'confirmed' ? 'Schedule locked in' : 'Only after both approve',
    },
  ]

  const myApprovalKey = user.role === 'gardener' ? 'gardener_approved_at' : 'client_approved_at'
  const otherParty = user.role === 'gardener' ? 'client' : 'provider'
  let nextStepGuidance
  if (inquiry.status === 'expired') {
    nextStepGuidance = {
      tone: 'danger',
      title: 'This request has expired',
      text: user.role === 'client'
        ? 'It is no longer accepting offers. Use "Renew expired request" above to keep it open longer.'
        : 'The client can renew it if they still need help. New offers cannot be sent right now.',
    }
  } else if (inquiry.status === 'cancelled') {
    nextStepGuidance = {
      tone: 'danger',
      title: 'This inquiry was cancelled',
      text: 'No further offers or agreements can be made. You can still review the history below.',
    }
  } else if (inquiry.status === 'closed') {
    nextStepGuidance = {
      tone: 'info',
      title: 'This inquiry is closed',
      text: 'It is no longer accepting offers, but you can still review the details and history below.',
    }
  } else if (inquiry.status === 'confirmed') {
    nextStepGuidance = {
      tone: 'success',
      title: 'Booking confirmed',
      text: user.role === 'client'
        ? 'Both parties approved the same agreement. Open the booking to pay the deposit and lock in the schedule.'
        : 'Both parties approved the same agreement. Open the booking to confirm the deposit and schedule.',
    }
  } else if (activeAgreement && activeAgreement.status === 'proposed') {
    nextStepGuidance = activeAgreement[myApprovalKey]
      ? {
        tone: 'info',
        title: 'Waiting for the other party',
        text: `You approved v${activeAgreement.version}. The ${otherParty} must approve the same version before a booking is created.`,
      }
      : {
        tone: 'warning',
        title: 'Action needed: approve the agreement',
        text: `Review the scope, price, and schedule for v${activeAgreement.version} below. Approve it to move forward, or edit it to propose a new version.`,
      }
  } else if (['provider_selected', 'in_agreement'].includes(inquiry.status)) {
    nextStepGuidance = {
      tone: 'info',
      title: 'Agreement in progress',
      text: user.role === 'client'
        ? 'A provider was selected. Set the final scope, price, and schedule, then both of you must approve the same version before a booking is created.'
        : 'The client selected a provider. Agree on the final scope, price, and schedule, then both of you must approve the same version before a booking is created.',
    }
  } else if (inquiry.status === 'responded') {
    nextStepGuidance = user.role === 'client'
      ? {
        tone: 'info',
        title: `You have ${quotations.length} offer${quotations.length === 1 ? '' : 's'} to compare`,
        text: 'Review the offers below and accept the one you prefer. Accepting an offer is not a booking yet — it starts the mutual agreement.',
      }
      : {
        tone: 'info',
        title: 'Your offer was sent',
        text: 'Wait for the client to accept it or ask for changes. You can revise or withdraw your offer until it is accepted.',
      }
  } else {
    nextStepGuidance = user.role === 'client'
      ? {
        tone: 'info',
        title: 'Waiting for offers',
        text: inquiry.request_type === 'general'
          ? 'Your request is live for approved gardeners. Offers will appear here — an inquiry is not a booking yet.'
          : 'Your inquiry was sent. The provider will respond with an offer or suggested changes.',
      }
      : {
        tone: 'info',
        title: 'This request is open for offers',
        text: "Review the client's request and photos, then send an offer with your price and proposed scope.",
      }
  }

  const activeDetailTab = detailTab

  return (
    <section className="container inquiry-content inq-hub-shell">
      <Link className="back-link" to="/inquiries"><ArrowLeft size={15} /> Back to inquiries</Link>
      <header className="inq-hub-hero">
        <div>
          <p className="inq-hub-eyebrow">
            <Sparkles size={14} />
            Inquiry #{inquiry.id} · {inquiry.request_type === 'general' ? 'General request' : 'Direct inquiry'}
          </p>
          <h1>{inquiry.subject}</h1>
          <div className="inquiry-status-row" style={{ marginTop: '10px', marginBottom: 0 }}>
            <span className={getStatusBadgeClass(inquiry.status)}>{formatStatusLabel(inquiry.status)}</span>
            <span className="inq-hub-tag">{inquiry.service_title || inquiry.category_name || (inquiry.request_type === 'general' ? 'Open gardening request' : 'Direct gardener inquiry')}</span>
            {inquiry.gardener_name && <span className="inq-hub-tag">Provider: {inquiry.gardener_name}</span>}
          </div>
        </div>

        <div className="inq-hub-actions">
          {(inquiry.request_type !== 'general' || inquiry.gardener_id) && (user.role === 'client' || canGardenerMessage) && (
            <button className="inq-hub-btn-primary" type="button" onClick={() => openConversation(inquiry.gardener_id || null)}>
              <MessageSquareText size={15} />
              Open conversation
            </button>
          )}
          {inquiry.request_type === 'general' && !inquiry.gardener_id && canGardenerMessage && (
            <button className="inq-hub-btn-primary" type="button" onClick={() => openConversation()}>
              <MessageSquareText size={15} />
              Message client
            </button>
          )}
          {canRenew && (
            <>
              <select className="inq-hub-sort" aria-label="Renewal duration" value={renewDays} onChange={(e) => setRenewDays(e.target.value)}>
                <option value="7">Renew 7 days</option>
                <option value="14">Renew 14 days</option>
                <option value="30">Renew 30 days</option>
              </select>
              <button className="inq-hub-btn-soft" type="button" disabled={updatingStatus} onClick={handleRenewInquiry}>
                {updatingStatus ? 'Saving...' : (inquiry.status === 'expired' ? 'Renew expired request' : 'Extend validity')}
              </button>
            </>
          )}
          {canCloseOrCancel && user.role === 'client' && (
            <button className="inq-hub-btn-soft" type="button" disabled={updatingStatus} onClick={() => changeInquiryStatus('cancelled')}>
              {updatingStatus ? 'Saving...' : 'Cancel inquiry'}
            </button>
          )}
          {canCloseOrCancel && (user.role === 'client' || inquiry.gardener_id === user.id) && (
            <button className="inq-hub-btn-soft" type="button" disabled={updatingStatus} onClick={() => changeInquiryStatus('closed')}>
              {updatingStatus ? 'Saving...' : 'Close inquiry'}
            </button>
          )}
        </div>
      </header>

      {!inquiryFlowClosed && (
        <ol className="booking-stepper inquiry-stepper" aria-label="Inquiry progress">
          {inquirySteps.map((step) => {
            const done = step.num < inquiryStageIndex
            const active = step.num === inquiryStageIndex
            const targetTab = step.num === 1 ? 'overview' : 'offers'
            return (
              <li
                key={step.num}
                className={`booking-step${done ? ' is-done' : ''}${active ? ' is-current' : ''}`}
              >
                <button
                  type="button"
                  className="detail-hub-step-btn"
                  onClick={() => setDetailTab(targetTab)}
                >
                  <span className="booking-step-num" aria-hidden="true">
                    {done ? <CheckCircle2 size={16} /> : step.num}
                  </span>
                  <span className="booking-step-copy">
                    <strong>{step.label}</strong>
                    <small>{step.sub}</small>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {nextStepGuidance && (
        <div className={`booking-next-banner tone-${nextStepGuidance.tone}`} role="status">
          <div className="detail-hub-next-row">
            <div>
              <strong>{nextStepGuidance.title}</strong>
              <p>{nextStepGuidance.text}</p>
            </div>
            {activeDetailTab !== 'offers' && (
              <button
                type="button"
                className="inq-hub-btn-primary detail-hub-next-action"
                onClick={() => setDetailTab('offers')}
              >
                Go to Offers &amp; Agreement <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="detail-hub-tabs" role="tablist" aria-label="Inquiry sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeDetailTab === 'offers'}
          className={`detail-hub-tab${activeDetailTab === 'offers' ? ' is-active' : ''}`}
          onClick={() => setDetailTab('offers')}
        >
          <span>Offers &amp; Agreement</span>
          <span className="detail-hub-tab-badge">{quotations.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeDetailTab === 'overview'}
          className={`detail-hub-tab${activeDetailTab === 'overview' ? ' is-active' : ''}`}
          onClick={() => setDetailTab('overview')}
        >
          <span>Project &amp; Photos</span>
          <span className="detail-hub-tab-badge">{images.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeDetailTab === 'all'}
          className={`detail-hub-tab${activeDetailTab === 'all' ? ' is-active' : ''}`}
          onClick={() => setDetailTab('all')}
        >
          <span>All Sections</span>
        </button>
      </div>

      {message && <TransientSuccess key={message} message={message} onDismiss={() => setMessage('')} style={{ marginBottom: '16px' }} />}
      {error && <div className="form-error" role="alert" style={{ marginBottom: '16px' }}>{error}</div>}
      <div className={activeDetailTab === 'all' ? 'inquiry-detail-grid' : ''}>
        {(activeDetailTab === 'overview' || activeDetailTab === 'all') && (
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
          {(() => {
            const specRows = formatCategorySpecsForDisplay(inquiry.category_specs, inquiry.category_name)
            if (specRows.length === 0) return null
            return (
              <div className="category-specs-summary">
                <p className="eyebrow" style={{ margin: '0 0 8px' }}>
                  {inquiry.category_name ? `${inquiry.category_name} specifications` : 'Project specifications'}
                </p>
                <div className="detail-facts" style={{ margin: 0, padding: 0, border: 0 }}>
                  {specRows.map((row) => (
                    <span key={row.key}>
                      <strong>{row.label}</strong>
                      {row.value}
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}
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
        </article>
        )}
        {(activeDetailTab === 'offers' || activeDetailTab === 'all') && (
        <article className="dashboard-panel">
          <h2>Quotations and provider responses</h2>
          {user.role === 'client' && quotations.length > 0 && (
            <div className="ai-filter-bar ai-offer-filter-bar" role="region" aria-label="AI offer comparison filter">
              <div className="ai-filter-controls">
                <div className="ai-filter-pills" role="group" aria-label="Rank received offers">
                  {[
                    { key: 'smart_ai', label: 'AI Best Match' },
                    { key: 'nearby', label: 'Nearest Location' },
                    { key: 'top_rated', label: 'Highest Rated' },
                    { key: 'best_conduct', label: 'Best Conduct' },
                    { key: 'lowest_price', label: 'Lowest Price' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      className={`booking-filter-pill${offerSortBy === opt.key ? ' is-active' : ''}`}
                      onClick={() => setOfferSortBy(opt.key)}
                    >
                      {opt.key === 'smart_ai' && <Sparkles size={13} />}
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="ai-filter-toggles">
                  <label className="ai-toggle-chip">
                    <input type="checkbox" checked={offerNearbyOnly} onChange={(e) => setOfferNearbyOnly(e.target.checked)} />
                    <span>Nearby only</span>
                  </label>
                  <label className="ai-toggle-chip">
                    <input type="checkbox" checked={offerGoodConductOnly} onChange={(e) => setOfferGoodConductOnly(e.target.checked)} />
                    <span>Clean conduct only</span>
                  </label>
                </div>
              </div>
              <span className="field-note">
                Advisory AI ranking based on proximity to {inquiry.location || 'your area'}, verified review scores, service conduct, and budget alignment.
              </span>
            </div>
          )}
          {quotations.length === 0 && <p className="form-note">No quotation has been sent yet.</p>}
          {(() => {
            if (user.role !== 'client' || !Array.isArray(offerAiRanking)) return quotations
            const aiById = new Map(offerAiRanking.map((item, idx) => [item.id, { ai_match: item.ai_match, rank: idx }]))
            const filtered = (offerNearbyOnly || offerGoodConductOnly)
              ? quotations.filter((q) => aiById.has(q.id))
              : quotations
            return [...filtered]
              .map((q) => ({ ...q, ai_match: aiById.get(q.id)?.ai_match || null, _aiRank: aiById.get(q.id)?.rank ?? 999 }))
              .sort((a, b) => a._aiRank - b._aiRank)
          })().map((quote) => (
            <div className="quotation-card" key={quote.id}>
              <div>
                <strong>
                  {quote.amount !== null && quote.amount !== undefined && quote.amount !== '' ? `₱${quote.amount}` : 'Indicative response'}
                  {quote.revision_number > 1 ? ` (v${quote.revision_number})` : ''}
                </strong>
                <div className="inline-actions" style={{ gap: '6px' }}>
                  {quote.ai_match && (
                    <span className="ai-match-inline-pill">
                      <Sparkles size={12} /> {quote.ai_match.matchScore}% AI Match
                    </span>
                  )}
                  <span className={getStatusBadgeClass(quote.status)}>{formatStatusLabel(quote.status)}</span>
                </div>
              </div>
              {quote.ai_match && (
                <div className="ai-card-badges" style={{ marginTop: '6px' }}>
                  {quote.ai_match.conduct?.cleanConduct && (
                    <span className="conduct-pill">
                      <ShieldCheck size={12} /> {quote.ai_match.conduct.tierLabel}
                    </span>
                  )}
                  {quote.ai_match.proximity?.label && (
                    <span className="rating-inline-pill">
                      <MapPin size={12} /> {quote.ai_match.proximity.label}
                    </span>
                  )}
                  {Number(quote.gardener_review_count || 0) > 0 && (
                    <span className="rating-inline-pill">
                      <Star size={12} fill="currentColor" /> {Number(quote.gardener_rating || 0).toFixed(1)} ({quote.gardener_review_count})
                    </span>
                  )}
                </div>
              )}
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
              <div className="agreement-approval-row" aria-label="Approval status">
                <span className={`approval-chip${activeAgreement[myApprovalKey] ? ' is-approved' : ''}`}>
                  You: {activeAgreement[myApprovalKey] ? 'Approved' : 'Waiting'}
                </span>
                <span className={`approval-chip${activeAgreement[user.role === 'gardener' ? 'client_approved_at' : 'gardener_approved_at'] ? ' is-approved' : ''}`}>
                  {otherParty}: {activeAgreement[user.role === 'gardener' ? 'client_approved_at' : 'gardener_approved_at'] ? 'Approved' : 'Waiting'}
                </span>
              </div>
              {activeAgreement.status === 'proposed' && (
                <div className="inline-actions" style={{ marginTop: '10px' }}>
                  {((user.role === 'client' && !activeAgreement.client_approved_at) || (user.role === 'gardener' && !activeAgreement.gardener_approved_at)) && (
                    <button className="button" type="button" disabled={updatingStatus} onClick={() => approveCurrentAgreement(activeAgreement)}>
                      {updatingStatus ? 'Saving...' : `Approve v${activeAgreement.version}`}
                    </button>
                  )}
                  <button className="table-action" type="button" onClick={() => {
                    setAgreementEditStep(1)
                    setEditingAgreement((open) => !open)
                  }}>
                    {editingAgreement ? 'Cancel edit' : 'Edit terms (new version resets both approvals)'}
                  </button>
                </div>
              )}
              {activeAgreement.booking_id && (
                <div className="inline-actions" style={{ marginTop: '10px' }}>
                  <Link className="button" to={`/bookings/${activeAgreement.booking_id}`}>View confirmed booking #{activeAgreement.booking_id}</Link>
                </div>
              )}
              {editingAgreement && activeAgreement.status === 'proposed' && (
                <form className="profile-form agreement-edit-form" onSubmit={submitAgreementRevision} style={{ marginTop: '14px' }}>
                  <nav className="register-stepper" aria-label="Agreement edit steps">
                    {[{ id: 1, label: 'Terms' }, { id: 2, label: 'Review & save' }].map((step) => {
                      const isActive = agreementEditStep === step.id
                      const isDone = agreementEditStep > step.id
                      return (
                        <button
                          key={step.id}
                          type="button"
                          className={`register-step-pill${isActive ? ' is-active' : ''}${isDone ? ' is-done is-clickable' : ''}`}
                          disabled={!isDone}
                          aria-current={isActive ? 'step' : undefined}
                          onClick={() => { if (isDone) setAgreementEditStep(step.id) }}
                        >
                          <span className="register-step-num" aria-hidden="true">
                            {isDone ? <Check size={12} strokeWidth={3} /> : step.id}
                          </span>
                          <span>{step.label}</span>
                        </button>
                      )
                    })}
                  </nav>
                  {agreementEditStep === 1 && (
                    <div className="agreement-edit-panel">
                      <p className="auth-section-title">Step 1 of 2 · Terms</p>
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
                      <div className="register-step-actions">
                        <button className="button" type="submit">
                          <span>Review changes</span>
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                  {agreementEditStep === 2 && (
                    <div className="agreement-edit-panel">
                      <p className="auth-section-title">Step 2 of 2 · Review &amp; save</p>
                      <dl className="inquiry-review-summary">
                        <div><dt>Scope of work</dt><dd>{agreementForm.scopeOfWork || 'Not provided'}</dd></div>
                        <div><dt>Agreed price</dt><dd>{agreementForm.amount ? `₱${Number(agreementForm.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'Not provided'}</dd></div>
                        <div><dt>Schedule</dt><dd>{agreementForm.scheduledStart && agreementForm.scheduledEnd ? `${agreementForm.scheduledStart} to ${agreementForm.scheduledEnd}` : 'Not provided'}</dd></div>
                        <div><dt>Location</dt><dd>{agreementForm.location || 'Not provided'}</dd></div>
                      </dl>
                      <p className="form-note">Saving creates v{activeAgreement.version + 1} and resets both approvals. Both parties must approve the new version.</p>
                      <div className="register-step-actions">
                        <button type="button" className="register-back-btn" onClick={() => setAgreementEditStep(1)}>
                          <ArrowLeft size={16} />
                          <span>Back</span>
                        </button>
                        <button className="button" type="submit" disabled={updatingStatus}>
                          {updatingStatus ? 'Saving...' : `Save as v${activeAgreement.version + 1} (resets approvals)`}
                        </button>
                      </div>
                    </div>
                  )}
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
        )}
        {(activeDetailTab === 'offers' || activeDetailTab === 'all') && canGardenerRespond && (
          <form className="dashboard-panel profile-form" onSubmit={sendQuote}>
            <div className="activity-heading">
              <div>
                <p className="eyebrow">{editingQuoteId ? 'Revise active offer' : 'Respond to client'}</p>
                <h2>{editingQuoteId ? 'Update your offer before acceptance.' : 'Evaluate feasibility and send an offer.'}</h2>
              </div>
              {editingQuoteId && (
                <button className="table-action" type="button" onClick={cancelReviseQuote}>
                  Cancel edit
                </button>
              )}
            </div>
            {inquiry.estimated_min_amount && inquiry.estimated_max_amount && (
              <div className="gardener-estimate-ref">
                <strong>System predicted range: {formatEstimateRange(inquiry.estimated_min_amount, inquiry.estimated_max_amount)}</strong>
                {inquiry.area_sqm ? ` (${Number(inquiry.area_sqm)} m²)` : ''}
                {inquiry.price_comment && <p className="field-note" style={{ margin: '4px 0 0' }}>Client note: &ldquo;{inquiry.price_comment}&rdquo;</p>}
              </div>
            )}
            <nav className="register-stepper response-stepper" aria-label="Response steps">
              {RESPONSE_STEPS.map((item) => {
                const isActive = responseStep === item.id
                const isDone = responseStep > item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`register-step-pill${isActive ? ' is-active' : ''}${isDone ? ' is-done is-clickable' : ''}`}
                    disabled={!isDone}
                    aria-current={isActive ? 'step' : undefined}
                    onClick={() => {
                      if (isDone) {
                        setError('')
                        setResponseStep(item.id)
                      }
                    }}
                  >
                    <span className="register-step-num" aria-hidden="true">
                      {isDone ? <Check size={12} strokeWidth={3} /> : item.id}
                    </span>
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </nav>
            {responseStep === 1 && (
              <div className="response-step-panel">
                <p className="auth-section-title">Step 1 of 3 · Response &amp; price</p>
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
                <div className="register-step-actions">
                  <button className="button" type="submit">
                    <span>Continue to details &amp; schedule</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
            {responseStep === 2 && (
              <div className="response-step-panel">
                <p className="auth-section-title">Step 2 of 3 · Details &amp; schedule</p>
                <label>Details <span className="required-mark" aria-hidden="true">*</span>
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
                <div className="register-step-actions">
                  <button type="button" className="register-back-btn" onClick={handleResponseBackStep}>
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>
                  <button className="button" type="submit">
                    <span>Review response</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
            {responseStep === 3 && (
              <div className="response-step-panel">
                <p className="auth-section-title">Step 3 of 3 · Review &amp; send</p>
                <dl className="inquiry-review-summary">
                  <div><dt>Response</dt><dd>{RESPONSE_TYPE_LABELS[form.responseType] || form.responseType}</dd></div>
                  <div><dt>Total indicative amount</dt><dd>{form.amount ? `₱${Number(form.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'Not specified'}</dd></div>
                  <div><dt>Availability</dt><dd>{form.availabilityStart || form.availabilityEnd ? `${form.availabilityStart || 'Not set'} to ${form.availabilityEnd || 'Not set'}` : 'Not specified'}</dd></div>
                </dl>
                <div className="register-step-actions">
                  <button type="button" className="register-back-btn" onClick={handleResponseBackStep}>
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>
                  <button className="button" type="submit" disabled={submittingQuote}>
                    {submittingQuote ? 'Saving...' : editingQuoteId ? 'Save revised offer' : 'Send response'}
                  </button>
                </div>
              </div>
            )}
          </form>
        )}
      </div>
    </section>
  )
}

export default function InquiryPage({ detail = false, create = false }) {
  const { inquiryId } = useParams()
  const { user } = useAuth()
  const memberWorkspace = ['client', 'gardener'].includes(user?.role)
  return <main className={`marketplace-page protected-page${memberWorkspace ? ' member-workspace' : ''}`} data-workspace={user?.role}><AppSidebar />{detail ? <InquiryDetails id={inquiryId} /> : create ? <InquiryForm /> : <InquiryList />}</main>
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
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
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

  const sourceList = activeTab === 'open' ? openRequests : inquiries

  const stats = {
    all: sourceList.length,
    open: sourceList.filter((item) => item.status === 'open').length,
    offers: sourceList.filter(
      (item) =>
        item.status === 'responded' ||
        Number(item.offer_count || 0) > 0 ||
        Boolean(item.my_quotation_id),
    ).length,
    agreement: sourceList.filter((item) =>
      ['provider_selected', 'in_agreement', 'booked', 'confirmed'].includes(item.status),
    ).length,
  }

  const normalizedQuery = searchTerm.trim().toLowerCase()
  const filteredList = sourceList
    .filter((item) => {
      if (statusFilter === 'open' && item.status !== 'open') return false
      if (
        statusFilter === 'offers' &&
        !(
          item.status === 'responded' ||
          Number(item.offer_count || 0) > 0 ||
          Boolean(item.my_quotation_id)
        )
      ) {
        return false
      }
      if (
        statusFilter === 'agreement' &&
        !['provider_selected', 'in_agreement', 'booked', 'confirmed'].includes(item.status)
      ) {
        return false
      }
      if (activeTab === 'mine' && typeFilter !== 'all') {
        const isGen = item.request_type === 'general'
        if (typeFilter === 'general' && !isGen) return false
        if (typeFilter === 'direct' && isGen) return false
      }
      if (!normalizedQuery) return true
      const haystack = [
        item.subject,
        item.description,
        item.ai_summary,
        item.location,
        item.gardener_name,
        item.client_first_name,
        item.client_last_name,
        item.category_name,
        item.service_title,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedQuery)
    })
    .sort((a, b) => {
      if (sortBy === 'offers') {
        return Number(b.offer_count || 0) - Number(a.offer_count || 0)
      }
      if (sortBy === 'estimate') {
        const aMax = Number(a.my_quotation_amount ?? a.estimated_max_amount ?? a.estimated_min_amount ?? 0)
        const bMax = Number(b.my_quotation_amount ?? b.estimated_max_amount ?? b.estimated_min_amount ?? 0)
        return bMax - aMax
      }
      const ta = a.created_at ? new Date(a.created_at).getTime() : Number(a.id || 0)
      const tb = b.created_at ? new Date(b.created_at).getTime() : Number(b.id || 0)
      return tb - ta
    })

  const hasActiveFilters =
    Boolean(normalizedQuery) ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    Boolean(filters.categoryId) ||
    Boolean(filters.area)

  function resetAllFilters() {
    setSearchTerm('')
    setStatusFilter('all')
    setTypeFilter('all')
    setSortBy('newest')
    if (activeTab === 'open') {
      setFilters({ categoryId: '', area: '' })
    }
  }

  return (
    <section className="container inquiry-content inq-hub-shell">
      <header className="inq-hub-hero">
        <div>
          <p className="inq-hub-eyebrow">
            <Sparkles size={14} />
            {activeTab === 'open' ? 'Zamboanga Open Requests' : 'Service Requests & Quotations'}
          </p>
          <h1>{activeTab === 'open' ? 'Browse open client requests' : 'Inquiries & offers'}</h1>
          <p className="inq-hub-subtitle">
            {activeTab === 'open'
              ? 'Review local garden photos, scope estimates, and submit your quotation before a client locks an agreement.'
              : user?.role === 'gardener'
                ? 'Track direct client inquiries, compare your active quotations, and move approved offers into mutual agreements.'
                : 'Manage your garden requests, compare incoming gardener offers side-by-side, and confirm mutual agreements.'}
          </p>
        </div>

        {user?.role === 'client' && (
          <div className="inq-hub-actions">
            <Link className="inq-hub-btn-primary" to="/inquiries/new?type=general">
              <Plus size={16} />
              Post general request
            </Link>
            <Link className="inq-hub-btn-soft" to="/assistant">
              <Sparkles size={15} />
              Plan with AI
            </Link>
            <Link className="inq-hub-btn-soft" to="/services">
              Browse services
            </Link>
          </div>
        )}

        {user?.role === 'gardener' && (
          <div className="inq-hub-actions">
            <button
              className={activeTab === 'mine' ? 'inq-hub-btn-primary' : 'inq-hub-btn-soft'}
              type="button"
              onClick={() => {
                setStatusFilter('all')
                setParams({})
              }}
            >
              My inquiries & offers
            </button>
            <button
              className={activeTab === 'open' ? 'inq-hub-btn-primary' : 'inq-hub-btn-soft'}
              type="button"
              onClick={() => {
                setStatusFilter('all')
                setParams({ tab: 'open' })
              }}
            >
              Open requests board
            </button>
          </div>
        )}
      </header>

      <div className="inq-hub-stats" role="group" aria-label="Filter inquiries by stage">
        <button
          type="button"
          className={`inq-hub-stat ${statusFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <div>
            <span className="inq-hub-stat-label">All {activeTab === 'open' ? 'open board' : 'requests'}</span>
            <strong className="inq-hub-stat-value">{stats.all}</strong>
          </div>
          <span className="inq-hub-stat-icon"><Layers size={18} /></span>
        </button>

        <button
          type="button"
          className={`inq-hub-stat ${statusFilter === 'open' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter((prev) => (prev === 'open' ? 'all' : 'open'))}
        >
          <div>
            <span className="inq-hub-stat-label">Open / Waiting</span>
            <strong className="inq-hub-stat-value">{stats.open}</strong>
          </div>
          <span className="inq-hub-stat-icon"><Clock3 size={18} /></span>
        </button>

        <button
          type="button"
          className={`inq-hub-stat ${statusFilter === 'offers' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter((prev) => (prev === 'offers' ? 'all' : 'offers'))}
        >
          <div>
            <span className="inq-hub-stat-label">With offers</span>
            <strong className="inq-hub-stat-value">{stats.offers}</strong>
          </div>
          <span className="inq-hub-stat-icon"><MessageSquareText size={18} /></span>
        </button>

        <button
          type="button"
          className={`inq-hub-stat ${statusFilter === 'agreement' ? 'is-active' : ''}`}
          onClick={() => setStatusFilter((prev) => (prev === 'agreement' ? 'all' : 'agreement'))}
        >
          <div>
            <span className="inq-hub-stat-label">Agreement / Booked</span>
            <strong className="inq-hub-stat-value">{stats.agreement}</strong>
          </div>
          <span className="inq-hub-stat-icon"><CheckCircle2 size={18} /></span>
        </button>
      </div>

      <div className="inq-hub-toolbar">
        <label className="inq-hub-search" aria-label="Search inquiries">
          <Search size={16} />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeTab === 'open'
                ? 'Search open requests by title, barangay, or category...'
                : 'Search by title, gardener, barangay, or notes...'
            }
          />
          {searchTerm && (
            <button
              type="button"
              className="inq-hub-search-clear"
              aria-label="Clear search"
              onClick={() => setSearchTerm('')}
            >
              <X size={13} />
            </button>
          )}
        </label>

        <div className="inq-hub-filters">
          {activeTab === 'mine' && (
            <>
              <button
                type="button"
                className={`inq-hub-chip ${typeFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                All types
              </button>
              <button
                type="button"
                className={`inq-hub-chip ${typeFilter === 'general' ? 'is-active' : ''}`}
                onClick={() => setTypeFilter('general')}
              >
                General
              </button>
              <button
                type="button"
                className={`inq-hub-chip ${typeFilter === 'direct' ? 'is-active' : ''}`}
                onClick={() => setTypeFilter('direct')}
              >
                Direct
              </button>
            </>
          )}

          {activeTab === 'open' && user?.role === 'gardener' && (
            <>
              <select
                className="inq-hub-sort"
                aria-label="Filter by category"
                value={filters.categoryId}
                onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
              >
                <option value="">All categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <select
                className="inq-hub-sort"
                aria-label="Filter by barangay"
                value={filters.area}
                onChange={(e) => setFilters({ ...filters, area: e.target.value })}
              >
                <option value="">All barangays</option>
                {ZAMBOANGA_BARANGAYS.map((brgy) => <option key={brgy} value={brgy}>{brgy}</option>)}
              </select>
            </>
          )}

          <select
            className="inq-hub-sort"
            aria-label="Sort requests"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="offers">Most offers</option>
            <option value="estimate">Highest estimate</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="inq-hub-empty">
          <p className="muted">Loading your requests and offers...</p>
        </div>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}

      {!loading && !error && sourceList.length === 0 && (
        <div className="inq-hub-empty">
          <div className="inq-hub-empty-art">
            <GardenPlanningIllustration />
          </div>
          <h2>
            {activeTab === 'open'
              ? 'No open client requests right now'
              : user?.role === 'gardener'
                ? 'No direct inquiries or offers yet'
                : 'Start your first garden request'}
          </h2>
          <p>
            {activeTab === 'open'
              ? 'Check back soon or adjust your barangay/category filters to discover new client garden projects.'
              : user?.role === 'gardener'
                ? 'Browse open requests from Zamboanga City homeowners to send your first quotation, or update your service listings.'
                : 'Pick a quick starter template below, ask the AI Garden Assistant to scope your yard, or message a local gardener directly.'}
          </p>

          <div className="inq-hub-starter-grid">
            {user?.role === 'gardener' ? (
              <>
                <button
                  type="button"
                  className="inq-hub-starter-card"
                  onClick={() => setParams({ tab: 'open' })}
                >
                  <span className="inq-hub-starter-icon"><Search size={16} /></span>
                  <strong>Browse Open Requests</strong>
                  <span>View local client garden photos and submit an indicative quotation.</span>
                </button>
                <Link className="inq-hub-starter-card" to="/dashboard?tab=services">
                  <span className="inq-hub-starter-icon"><Leaf size={16} /></span>
                  <strong>Publish a Service</strong>
                  <span>List your lawn care, landscaping, or tree pruning packages.</span>
                </Link>
                <Link className="inq-hub-starter-card" to="/profile">
                  <span className="inq-hub-starter-icon"><ClipboardCheck size={16} /></span>
                  <strong>Update Profile & Schedule</strong>
                  <span>Keep your working days and portfolio visible to clients.</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  className="inq-hub-starter-card"
                  to="/inquiries/new?type=general&subject=Lawn%20Cleanup%20%26%20Weeding&description=Need%20overgrown%20grass%20trimmed%2C%20weeds%20cleared%2C%20and%20yard%20debris%20bagged."
                >
                  <span className="inq-hub-starter-icon"><Leaf size={16} /></span>
                  <strong>Lawn Cleanup & Weeding</strong>
                  <span>Pre-fill a general request for grass trimming and yard clearing.</span>
                </Link>
                <Link
                  className="inq-hub-starter-card"
                  to="/inquiries/new?type=general&subject=Tree%20%26%20Hedge%20Pruning&description=Looking%20for%20safe%20pruning%20and%20shaping%20for%20ornamental%20hedges%20and%20trees."
                >
                  <span className="inq-hub-starter-icon"><ScissorsIconFallback /></span>
                  <strong>Tree & Hedge Pruning</strong>
                  <span>Pre-fill a request for shaping hedges, palms, or backyard trees.</span>
                </Link>
                <Link className="inq-hub-starter-card" to="/assistant">
                  <span className="inq-hub-starter-icon"><Sparkles size={16} /></span>
                  <strong>Scope with AI Assistant</strong>
                  <span>Describe your garden idea or upload a photo before posting a request.</span>
                </Link>
              </>
            )}
          </div>

          <div className="inq-hub-guide">
            <div className="inq-hub-guide-step">
              <span className="inq-hub-guide-num">1</span>
              <div>
                <strong>Submit or Respond</strong>
                <span>Share garden details, photos, and an indicative estimate.</span>
              </div>
            </div>
            <div className="inq-hub-guide-step">
              <span className="inq-hub-guide-num">2</span>
              <div>
                <strong>Compare Offers</strong>
                <span>Review gardener quotations and discuss scope in chat.</span>
              </div>
            </div>
            <div className="inq-hub-guide-step">
              <span className="inq-hub-guide-num">3</span>
              <div>
                <strong>Mutual Agreement</strong>
                <span>A booking is created only after both sides approve the same terms.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && sourceList.length > 0 && filteredList.length === 0 && (
        <div className="inq-hub-empty">
          <h2>No matching requests</h2>
          <p>No inquiries match your current search or stage filter.</p>
          {hasActiveFilters && (
            <button type="button" className="inq-hub-btn-primary" onClick={resetAllFilters}>
              Reset filters
            </button>
          )}
        </div>
      )}

      {!loading && !error && activeTab === 'mine' && filteredList.length > 0 && (
        <div className="marketplace-grid marketplace-card-grid">
          {filteredList.map((inquiry) => {
            const coverUrl = inquiryCovers[inquiry.id] || null
            const partnerLabel = user?.role === 'gardener'
              ? `${inquiry.client_first_name || ''} ${inquiry.client_last_name || ''}`.trim() || 'Client'
              : inquiry.gardener_name || (inquiry.offer_count > 0 ? `${inquiry.offer_count} provider ${Number(inquiry.offer_count) === 1 ? 'offer' : 'offers'}` : 'Open to providers')
            return (
              <article className="marketplace-card visual-market-card inq-hub-card" key={inquiry.id}>
                <Link className="marketplace-card-media card-media-link" to={`/inquiries/${inquiry.id}`} aria-label={`View ${inquiry.subject}`}>
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
                </Link>
                <div className="marketplace-card-body">
                  <div className="inq-hub-card-tags">
                    <span className="inq-hub-tag">
                      {inquiry.request_type === 'general' ? 'General request' : 'Direct inquiry'}
                    </span>
                    {Number(inquiry.offer_count || 0) > 0 && (
                      <span className="inq-hub-tag is-accent">
                        {inquiry.offer_count} {Number(inquiry.offer_count) === 1 ? 'offer' : 'offers'}
                      </span>
                    )}
                  </div>
                  <h2><Link className="card-title-link" to={`/inquiries/${inquiry.id}`}>{inquiry.subject}</Link></h2>
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

      {!loading && !error && activeTab === 'open' && filteredList.length > 0 && (
        <div className="marketplace-grid marketplace-card-grid">
          {filteredList.map((reqItem) => {
            const firstImageId = Array.isArray(reqItem.images) && reqItem.images[0]?.id
            const coverUrl = firstImageId ? getRequestImageUrl(firstImageId) : null
            return (
              <article className="marketplace-card visual-market-card inq-hub-card" key={reqItem.id}>
                <Link className="marketplace-card-media card-media-link" to={`/inquiries/${reqItem.id}`} aria-label={`View ${reqItem.subject}`}>
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
                </Link>
                <div className="marketplace-card-body">
                  <div className="inq-hub-card-tags">
                    <span className="inq-hub-tag">{reqItem.category_name || 'General request'}</span>
                    {Number(reqItem.offer_count || 0) > 0 && (
                      <span className="inq-hub-tag is-accent">
                        {reqItem.offer_count} {Number(reqItem.offer_count) === 1 ? 'offer' : 'offers'}
                      </span>
                    )}
                  </div>
                  <h2><Link className="card-title-link" to={`/inquiries/${reqItem.id}`}>{reqItem.subject}</Link></h2>
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

function ScissorsIconFallback() {
  return <ClipboardCheck size={16} />
}
