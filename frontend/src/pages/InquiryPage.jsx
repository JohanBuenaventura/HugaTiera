import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Calculator, Check, CheckCircle2, ClipboardCheck, Leaf, MapPin, ShieldCheck, Sparkles, Star, Wand2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { agreementsApi } from '../services/agreements'
import { formatStatusLabel, getStatusBadgeClass } from '../services/bookings'
import { fetchAiUsage, fetchSmartRecommendations, requestGardenImagePreview, requestPhotoAnalysis, requestRequirementAssistance } from '../services/ai'
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
  getRequestImageUrl,
  updateRequestImageDescription,
  uploadRequestImage,
} from '../services/requestImages'
import { servicesApi } from '../services/services'
import { communicationApi } from '../services/communication'
import AppSidebar from '../components/AppSidebar'
import TransientSuccess from '../components/TransientSuccess'
import { formatPHP } from '../utils/currency'
import { OTHER_BARANGAY_VALUE, ZAMBOANGA_BARANGAYS } from '../utils/zamboangaAddress'

function formatDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const INQUIRY_STEPS = [
  { id: 1, label: 'What you need & photos' },
  { id: 2, label: 'Size, smart estimate & send' },
]

const YARD_SIZE_PRESETS = [
  { key: 'small', label: 'Small', hint: '~10 m² · Balcony / patch', sqm: '10' },
  { key: 'medium', label: 'Medium', hint: '~25 m² · Typical front yard', sqm: '25' },
  { key: 'large', label: 'Large', hint: '~50 m² · Full yard / lawn', sqm: '50' },
  { key: 'xlarge', label: 'Extra Large', hint: '~100 m² · Spacious lot', sqm: '100' },
  { key: 'unsure', label: 'Not sure yet', hint: 'Assess during site visit', sqm: '' },
]

function buildSmartMaterialBundles(pricingAddons, areaSqm, description = '', categoryName = '') {
  if (!Array.isArray(pricingAddons) || pricingAddons.length === 0) return []
  const area = Math.max(5, Number(areaSqm) || 25)
  const findAddon = (regex, fallbackType = null) => (
    pricingAddons.find((a) => regex.test(`${a.name} ${a.description || ''}`))
    || (fallbackType ? pricingAddons.find((a) => a.item_type === fallbackType) : null)
  )

  const ornamental = findAddon(/ornamental|potted/i, 'plant')
  const shrubs = findAddon(/shrub|hedge|flowering|bougainvillea/i)
  const turf = findAddon(/turf|carabao|carpet|grass/i)
  const soil = findAddon(/loam|soil|compost/i, 'material')
  const fertilizer = findAddon(/fertilizer|vermicast/i)
  const stones = findAddon(/stone|pebble|mulch|edging/i)
  const hauling = findAddon(/hauling|disposal|debris|waste/i, 'disposal')
  const equipment = findAddon(/brush|chainsaw|equipment/i, 'equipment')

  const makeEntry = (addon, qty) => (addon ? { addon, qty: Math.max(1, Math.round(qty)) } : null)

  // Dynamic smart bundle inferred from description & category text
  const textBlob = `${description} ${categoryName}`.toLowerCase()
  const smartItems = []
  if (/weed|yellow|dry|clean|remove|overgrown|clear|branch|prune|trim|debris|pebble|cut/.test(textBlob)) {
    if (hauling) smartItems.push(makeEntry(hauling, area >= 60 ? 2 : 1))
    if (equipment) smartItems.push(makeEntry(equipment, 1))
  }
  if (/grass|lawn|turf|patch/.test(textBlob) && turf) {
    smartItems.push(makeEntry(turf, Math.max(5, Math.round(area * 0.6))))
  }
  if (/plant|shrub|flower|bougainvillea|santan|hedge|visual|garden|landscap|makeover/.test(textBlob)) {
    if (shrubs) smartItems.push(makeEntry(shrubs, Math.max(4, Math.round(area / 5))))
    if (ornamental) smartItems.push(makeEntry(ornamental, Math.max(4, Math.round(area / 6))))
    if (soil) smartItems.push(makeEntry(soil, Math.max(2, Math.ceil(area / 8))))
  }
  if (/stone|path|walkway|border|edging|mulch/.test(textBlob) && stones) {
    smartItems.push(makeEntry(stones, Math.max(4, Math.round(area / 4))))
  }

  const bundles = []
  if (smartItems.length > 0) {
    bundles.push({
      key: 'smart_pick',
      badge: 'Recommended for your request',
      title: 'Smart Pick (from your description)',
      subtitle: 'Auto-matched items & quantities based on your yard details.',
      items: smartItems,
    })
  }

  const cleanupItems = [makeEntry(hauling, area >= 60 ? 2 : 1), makeEntry(equipment, 1)].filter(Boolean)
  if (cleanupItems.length > 0) {
    bundles.push({
      key: 'cleanup',
      title: 'Cleanup & Hauling',
      subtitle: 'Clearing weeds/grass, brush cutter & debris hauling.',
      items: cleanupItems,
    })
  }

  const lawnItems = [
    makeEntry(turf, area),
    makeEntry(soil, Math.ceil(area / 5)),
    makeEntry(fertilizer, Math.ceil(area / 15)),
  ].filter(Boolean)
  if (lawnItems.length > 0) {
    bundles.push({
      key: 'lawn_refresh',
      title: 'Lawn Refresh (Turf + Soil)',
      subtitle: `Auto-scaled for ~${area} m² of fresh turf & soil.`,
      items: lawnItems,
    })
  }

  const plantItems = [
    makeEntry(shrubs, Math.max(4, Math.round(area / 4))),
    makeEntry(ornamental, Math.max(4, Math.round(area / 5))),
    makeEntry(soil, Math.ceil(area / 6)),
    makeEntry(stones, Math.max(4, Math.round(area / 3))),
  ].filter(Boolean)
  if (plantItems.length > 0) {
    bundles.push({
      key: 'plant_makeover',
      title: 'Plants & Border Makeover',
      subtitle: `Flowering shrubs, ornamentals, soil & edging for ~${area} m².`,
      items: plantItems,
    })
  }

  return bundles.map((bundle) => {
    const minTotal = bundle.items.reduce((sum, i) => sum + Number(i.addon.unit_price_min || 0) * i.qty, 0)
    const maxTotal = bundle.items.reduce((sum, i) => sum + Number(i.addon.unit_price_max || 0) * i.qty, 0)
    return { ...bundle, minTotal, maxTotal }
  })
}

function InquiryForm() {
  const { user } = useAuth()
  const [barangayChoice, setBarangayChoice] = useState('')
  const [customBarangay, setCustomBarangay] = useState('')
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

  const location = useLocation()
  const prefillState = location.state || {}
  const [form, setForm] = useState({
    subject: '',
    description: typeof prefillState.prefillDescription === 'string' ? prefillState.prefillDescription : '',
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
  const [uploadedImages, setUploadedImages] = useState(
    Array.isArray(prefillState.prefillImages) ? prefillState.prefillImages : [],
  )
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [analyzingPhotoId, setAnalyzingPhotoId] = useState(null)
  const [savingPhotoDescId, setSavingPhotoDescId] = useState(null)
  const [aiUsage, setAiUsage] = useState(null)
  const [editingVisualPhotoId, setEditingVisualPhotoId] = useState(null)
  const [visualPromptDraft, setVisualPromptDraft] = useState('')
  const [generatingVisualPhotoId, setGeneratingVisualPhotoId] = useState(null)
  const [generatingAiReq, setGeneratingAiReq] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState(null)
  const [aiNotice, setAiNotice] = useState('')
  const [activeBundleKey, setActiveBundleKey] = useState('')
  const [nearbyRecommendations, setNearbyRecommendations] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [inquiryStep, setInquiryStep] = useState(1)

  useEffect(() => {
    fetchAiUsage().then(setAiUsage).catch(() => {})
    servicesApi.categories().then((result) => setCategories(result.categories || [])).catch(() => {})
    servicesApi.pricingAddons().then((result) => setPricingAddons(result.addons || [])).catch(() => {})
    if (!isGeneralRequest && validServiceId) {
      servicesApi.detail(serviceId).then((result) => setService(result.service)).catch((loadError) => setError(loadError.message))
    } else if (!isGeneralRequest && validGardenerId) {
      servicesApi.gardener(gardenerId).then((result) => setGardener(result.gardener)).catch((loadError) => setError(loadError.message))
    }
  }, [gardenerId, isGeneralRequest, serviceId, validGardenerId, validServiceId])

  useEffect(() => {
    if (!isGeneralRequest || inquiryStep !== 2) return undefined
    let active = true
    fetchSmartRecommendations({
      mode: 'services',
      categoryId: form.categoryId || undefined,
      location: form.location || undefined,
      keyword: form.subject || undefined,
      limit: 3,
    })
      .then((res) => {
        if (active) setNearbyRecommendations(Array.isArray(res?.recommendations) ? res.recommendations : [])
      })
      .catch(() => {
        if (active) setNearbyRecommendations([])
      })
    return () => { active = false }
  }, [isGeneralRequest, inquiryStep, form.categoryId, form.location, form.subject])

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

  const smartBundles = buildSmartMaterialBundles(
    pricingAddons,
    form.areaSqm,
    `${form.subject} ${form.description}`,
    selectedCategory?.name || service?.category_name || '',
  )

  function selectYardSizePreset(preset) {
    if (preset.key === 'unsure') {
      setForm((current) => ({
        ...current,
        areaSqm: '',
        lengthM: '',
        widthM: '',
        siteVisitRequested: true,
      }))
      return
    }
    setForm((current) => ({
      ...current,
      areaSqm: preset.sqm,
      lengthM: '',
      widthM: '',
    }))
  }

  function applyMaterialBundle(bundle) {
    if (activeBundleKey === bundle.key) {
      setActiveBundleKey('')
      setSelectedAddonsMap({})
      return
    }
    const nextMap = {}
    for (const entry of bundle.items) {
      nextMap[entry.addon.id] = String(entry.qty)
    }
    setActiveBundleKey(bundle.key)
    setSelectedAddonsMap(nextMap)
    setForm((current) => ({
      ...current,
      areaSqm: current.areaSqm || '25',
      materialsOption: 'gardener_provides',
    }))
  }

  function applyAiSuggestedAddons(suggestedAddons = []) {
    if (!Array.isArray(suggestedAddons) || suggestedAddons.length === 0) return
    const nextMap = {}
    for (const item of suggestedAddons) {
      nextMap[item.addonId] = String(item.quantity || 1)
    }
    setActiveBundleKey('ai_suggested')
    setSelectedAddonsMap(nextMap)
    setForm((current) => ({
      ...current,
      areaSqm: current.areaSqm || '25',
      materialsOption: 'gardener_provides',
    }))
    setAiNotice('AI-recommended plants and materials applied — prices are calculated automatically from the local catalog.')
  }

  const liveEstimate = computeLocalPriceEstimate({
    areaSqm: form.areaSqm,
    workComplexity: form.workComplexity,
    materialsOption: form.materialsOption,
    category: selectedCategory,
    service,
    selectedAddons: selectedAddonsForEstimate,
  })

  const originalPhotoCount = uploadedImages.filter((img) => img.kind !== 'ai_generated').length

  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (originalPhotoCount >= 5) {
      setError('You can attach up to 5 original garden photos per inquiry.')
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

  async function handleGenerateVisualEdit(parentImageId) {
    const instructions = visualPromptDraft.trim()
    if (!instructions) {
      setAiNotice('Please describe what changes you want to remove, clean, or add before generating a visual preview.')
      return
    }
    setGeneratingVisualPhotoId(parentImageId)
    setAiNotice('')
    try {
      const res = await requestGardenImagePreview({
        parentImageId,
        instructions,
      })
      if (res?.generatedImage) {
        setUploadedImages((prev) => [...prev, res.generatedImage])
        setEditingVisualPhotoId(null)
        setVisualPromptDraft('')
        setAiNotice(
          `AI concept preview generated (${res.usage ? `${res.usage.remaining} of ${res.usage.limit} daily previews remaining` : 'informational only'}). Both your original photo and AI preview will be shared clearly with gardeners.`,
        )
      }
      fetchAiUsage().then(setAiUsage).catch(() => {})
    } catch (editErr) {
      setAiNotice(editErr.message)
      fetchAiUsage().then(setAiUsage).catch(() => {})
    } finally {
      setGeneratingVisualPhotoId(null)
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
        areaSqm: form.areaSqm ? Number(form.areaSqm) : null,
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
            `Suggestions generated with ${res.model}${res.fallbackUsed ? ' (automatic fallback)' : ''}. Review and apply what fits your yard.`,
          )
        }
        setForm((prev) => ({
          ...prev,
          aiSummary: res.suggestion.structuredSummary || prev.aiSummary,
          categoryId: isGeneralRequest && !prev.categoryId && res.suggestion.suggestedCategoryId
            ? String(res.suggestion.suggestedCategoryId)
            : prev.categoryId,
        }))
        if (
          Object.keys(selectedAddonsMap).length === 0
          && Array.isArray(res.suggestion.suggestedAddons)
          && res.suggestion.suggestedAddons.length > 0
        ) {
          const autoMap = {}
          for (const item of res.suggestion.suggestedAddons) {
            autoMap[item.addonId] = String(item.quantity || 1)
          }
          setSelectedAddonsMap(autoMap)
          setActiveBundleKey('ai_suggested')
        }
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
          <h1>Client Mode is required to submit a request.</h1>
          <p className="field-note">
            {user.isDualRole
              ? 'You are currently in Gardener Mode. Go to Profile to switch to Client Mode before submitting a general request or direct inquiry.'
              : 'You are signed in with a Gardener account. If you also want to hire gardeners for your own yard, you can enable Client Mode in Profile.'}
          </p>
          <div className="inline-actions" style={{ marginTop: '16px' }}>
            <Link className="button" to="/profile">Open Profile</Link>
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
            <p className="auth-section-title">Step 1 of 2 · Tell us what you need &amp; attach photos</p>
            <div className="form-row">
              <label>Project title <span className="required-mark" aria-hidden="true">*</span>
                <input required maxLength="200" value={form.subject} onChange={change('subject')} placeholder="e.g. Clean yard grass & add flowering plants" />
              </label>
              {(isGeneralRequest || !validServiceId) && (
                <label>Service category <span className="label-note">(Optional)</span>
                  <select value={form.categoryId} onChange={change('categoryId')}>
                    <option value="">Any gardening category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <label>Describe what you want done <span className="required-mark" aria-hidden="true">*</span>
              <textarea required rows="4" maxLength="5000" value={form.description} onChange={change('description')} placeholder={activeCategoryTemplate.descriptionPlaceholder} />
            </label>

            <div className="inline-actions" style={{ marginBottom: '6px' }}>
              <button
                className="button button-outline button-sm"
                type="button"
                disabled={generatingAiReq}
                onClick={handleGenerateAiRequirements}
              >
                <Sparkles size={15} /> {generatingAiReq ? 'Organizing with AI...' : 'Organize & recommend materials with AI'}
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
              <div className="ai-callout-box">
                <p className="form-note" style={{ margin: '0 0 6px' }}>
                  <strong>AI smart suggestions (review before submitting):</strong>
                  {aiSuggestion.suggestedCategoryName ? ` Suggested category: ${aiSuggestion.suggestedCategoryName}.` : ''}
                </p>
                {Array.isArray(aiSuggestion.suggestedAddons) && aiSuggestion.suggestedAddons.length > 0 && (
                  <div className="ai-suggested-addons-bar">
                    <p className="form-note" style={{ margin: '0 0 6px' }}>
                      <strong>Recommended catalog materials (priced automatically):</strong>
                    </p>
                    <ul className="ai-callout-list">
                      {aiSuggestion.suggestedAddons.map((item) => (
                        <li key={item.addonId}>
                          <strong>{item.name}</strong> ({item.quantity} × {item.unit})
                          {item.reason ? ` — ${item.reason}` : ''}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="table-action"
                      onClick={() => applyAiSuggestedAddons(aiSuggestion.suggestedAddons)}
                    >
                      <Sparkles size={13} /> Apply AI-recommended materials to estimate
                    </button>
                  </div>
                )}
                {Array.isArray(aiSuggestion.gardeningIdeas) && aiSuggestion.gardeningIdeas.length > 0 && (
                  <ul className="ai-callout-list">
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

            <div className="form-row">
              <label>Service area / barangay <span className="label-note">(Area-level only)</span>
                <select value={barangayChoice} onChange={(event) => updateBarangayChoice(event.target.value)}>
                  <option value="">Select barangay...</option>
                  {ZAMBOANGA_BARANGAYS.map((brgy) => <option key={brgy} value={brgy}>{brgy}</option>)}
                  <option value={OTHER_BARANGAY_VALUE}>Other (type manually)</option>
                </select>
              </label>
              <label>Preferred date <span className="label-note">(Optional)</span>
                <input type="date" value={form.requestedDate} onChange={change('requestedDate')} />
              </label>
            </div>
            {barangayChoice === OTHER_BARANGAY_VALUE && (
              <label>Specify barangay
                <input maxLength="80" value={customBarangay} onChange={(event) => updateCustomBarangay(event.target.value)} placeholder="Enter barangay name" />
              </label>
            )}
            {form.location && (
              <p className="field-note">Shared with providers as: <strong>{form.location}</strong> — exact address is shared only after mutual agreement.</p>
            )}

            <label>Garden photos <span className="label-note">(Optional, up to 5 photos; GPS/EXIF stripped automatically)</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingPhoto || originalPhotoCount >= 5} onChange={handlePhotoUpload} />
            </label>
            {uploadingPhoto && <p className="form-note">Processing and stripping metadata from photo...</p>}
            {uploadedImages.length > 0 && (
              <div className="request-photo-grid">
                {uploadedImages.map((img) => {
                  const isAiGenerated = img.kind === 'ai_generated'
                  const isEditingThis = editingVisualPhotoId === img.id
                  return (
                    <figure className={`request-photo-card${isAiGenerated ? ' is-ai-concept' : ''}`} key={img.id}>
                      <span className={`photo-kind-badge${isAiGenerated ? ' is-ai' : ''}`}>
                        {isAiGenerated ? 'AI Concept Preview' : 'Original site photo'}
                      </span>
                      <img src={getRequestImageUrl(img.id)} alt={isAiGenerated ? 'AI garden concept preview' : 'Uploaded garden space'} />
                      <figcaption className="request-photo-caption">
                        <textarea
                          rows="2"
                          maxLength="2000"
                          value={img.ai_description || ''}
                          onChange={(e) => handleLocalPhotoDescriptionChange(img.id, e.target.value)}
                          onBlur={(e) => handleSavePhotoDescription(img.id, e.target.value)}
                          placeholder={isAiGenerated ? 'Notes on this AI concept preview' : "Optional note (click 'Describe with AI' or type manually)"}
                        />
                        <div className="request-photo-actions">
                          {!isAiGenerated && (
                            <button
                              className="table-action"
                              type="button"
                              disabled={analyzingPhotoId === img.id || savingPhotoDescId === img.id}
                              onClick={() => handleAnalyzePhoto(img.id)}
                            >
                              <Sparkles size={13} /> {analyzingPhotoId === img.id ? 'Analyzing...' : 'Describe with AI'}
                            </button>
                          )}
                          {!isAiGenerated && aiUsage?.imageGenerationEnabled && (
                            <button
                              className="table-action"
                              type="button"
                              disabled={generatingVisualPhotoId === img.id || (aiUsage?.imageQuota && aiUsage.imageQuota.remaining <= 0)}
                              onClick={() => {
                                if (isEditingThis) {
                                  setEditingVisualPhotoId(null)
                                } else {
                                  setEditingVisualPhotoId(img.id)
                                  setVisualPromptDraft((prev) => prev || form.description || '')
                                }
                              }}
                            >
                              <Wand2 size={13} /> {isEditingThis ? 'Close AI preview' : 'Preview changes with AI'}
                            </button>
                          )}
                          <button className="table-action" type="button" onClick={() => handleRemovePhoto(img.id)}>
                            {isAiGenerated ? 'Remove preview' : 'Remove photo'}
                          </button>
                        </div>
                        {isEditingThis && (
                          <div className="inline-ai-edit-panel">
                            <label>
                              What should AI remove, clean, or add?
                              <textarea
                                rows="3"
                                maxLength="1000"
                                value={visualPromptDraft}
                                onChange={(e) => setVisualPromptDraft(e.target.value)}
                                placeholder="e.g., Remove yellowish grass and pebbles, trim lawn neatly, and add flowering tropical shrubs along the fence."
                              />
                            </label>
                            <div className="inline-ai-edit-footer">
                              <span className="field-note">
                                {aiUsage?.imageQuota
                                  ? `${aiUsage.imageQuota.remaining} of ${aiUsage.imageQuota.limit} daily AI previews left`
                                  : 'Visual concept only'}
                              </span>
                              <button
                                type="button"
                                className="button button-sm"
                                disabled={generatingVisualPhotoId === img.id}
                                onClick={() => handleGenerateVisualEdit(img.id)}
                              >
                                <Wand2 size={13} /> {generatingVisualPhotoId === img.id ? 'Generating (~6–10s)...' : 'Generate preview'}
                              </button>
                            </div>
                          </div>
                        )}
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
            )}

            <div className="register-step-actions">
              <button className="button" type="submit">
                <span>Continue to size &amp; smart estimate</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {inquiryStep === 2 && (
          <div className="inquiry-step-panel">
            <p className="auth-section-title">Step 2 of 2 · Quick yard size, auto-priced materials &amp; send</p>

            <div className="size-preset-section">
              <span className="category-spec-label">How big is the garden area? <span className="label-note">(Tap a size — no measuring needed)</span></span>
              <div className="size-preset-grid" role="group" aria-label="Quick yard size presets">
                {YARD_SIZE_PRESETS.map((preset) => {
                  const isSelected = preset.key === 'unsure'
                    ? !form.areaSqm
                    : String(form.areaSqm) === preset.sqm
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      className={`size-preset-btn${isSelected ? ' is-selected' : ''}`}
                      onClick={() => selectYardSizePreset(preset)}
                    >
                      <strong>{preset.label}</strong>
                      <small>{preset.hint}</small>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="form-row form-row-3">
              <label>
                Exact area in m² <span className="label-note">(Optional)</span>
                <input
                  type="number"
                  min="0.5"
                  max="50000"
                  step="0.5"
                  placeholder="Optional (e.g., 25)"
                  value={form.areaSqm}
                  onChange={change('areaSqm')}
                />
              </label>
              <label>
                Yard condition
                <select value={form.workComplexity} onChange={change('workComplexity')}>
                  {WORK_COMPLEXITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Plants &amp; materials
                <select value={form.materialsOption} onChange={change('materialsOption')}>
                  {MATERIALS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {smartBundles.length > 0 && (
              <div className="smart-bundles-section">
                <div className="smart-bundles-head">
                  <strong><Sparkles size={15} /> Smart plant &amp; material packages <span className="label-note">(Auto-priced from local Zamboanga catalog)</span></strong>
                  {Object.keys(selectedAddonsMap).length > 0 && (
                    <button
                      type="button"
                      className="table-action"
                      onClick={() => {
                        setActiveBundleKey('')
                        setSelectedAddonsMap({})
                      }}
                    >
                      Clear materials
                    </button>
                  )}
                </div>
                <div className="smart-bundles-grid">
                  {smartBundles.map((bundle) => {
                    const isPicked = activeBundleKey === bundle.key
                    return (
                      <button
                        key={bundle.key}
                        type="button"
                        className={`smart-bundle-card${isPicked ? ' is-selected' : ''}`}
                        onClick={() => applyMaterialBundle(bundle)}
                      >
                        {bundle.badge && <span className="smart-bundle-tag">{bundle.badge}</span>}
                        <strong>{bundle.title}</strong>
                        <small>{bundle.subtitle}</small>
                        <span className="smart-bundle-price">
                          +{formatEstimateRange(bundle.minTotal, bundle.maxTotal)} est. materials
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className={`price-predictor-result${liveEstimate ? ' has-estimate' : ''}`} aria-live="polite">
              {liveEstimate ? (
                <>
                  <div className="price-predictor-range-row">
                    <div>
                      <span className="eyebrow" style={{ margin: 0 }}>Automatic indicative estimate</span>
                      <strong className="price-predictor-range">
                        {formatEstimateRange(liveEstimate.estimatedMinAmount, liveEstimate.estimatedMaxAmount)}
                      </strong>
                    </div>
                    {liveEstimate.estimatedWorkingDays && (
                      <span className="site-visit-pill">
                        <Calculator size={14} /> ~{liveEstimate.estimatedWorkingDays} working {liveEstimate.estimatedWorkingDays === 1 ? 'day' : 'days'}
                      </span>
                    )}
                  </div>
                  <div className="estimate-breakdown-totals">
                    <span>
                      <strong>Labor:</strong> {formatEstimateRange(liveEstimate.estimatedLaborMin, liveEstimate.estimatedLaborMax)}
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
                  <p className="field-note" style={{ margin: 0 }}>{liveEstimate.disclaimer}</p>
                </>
              ) : (
                <p className="field-note" style={{ margin: 0 }}>
                  Not sure about your yard size? No problem — gardeners can review your photos and assess the space during a quick on-site ocular visit before giving a final quote.
                </p>
              )}
            </div>

            <label className="site-visit-checkbox">
              <input
                type="checkbox"
                checked={form.siteVisitRequested}
                onChange={(e) => setForm((current) => ({ ...current, siteVisitRequested: e.target.checked }))}
              />
              <span>I am open to a quick on-site ocular inspection so the gardener can confirm the exact quote.</span>
            </label>

            <details className="inquiry-optional-drawer">
              <summary>Customize plants, materials, dimensions &amp; extra details (optional)</summary>
              <div className="inquiry-optional-body">
                <div className="form-row form-row-3">
                  <label>
                    Length in m <span className="label-note">(Auto-calculates m²)</span>
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
                    Width in m
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      placeholder="e.g., 5"
                      value={form.widthM}
                      onChange={(e) => handleDimensionChange('widthM', e.target.value)}
                    />
                  </label>
                  {isGeneralRequest && (
                    <label>
                      Request open for
                      <select value={form.expiresInDays} onChange={change('expiresInDays')}>
                        <option value="7">7 days</option>
                        <option value="14">14 days (Recommended)</option>
                        <option value="30">30 days</option>
                      </select>
                    </label>
                  )}
                </div>

                {pricingAddons.length > 0 && (
                  <div className="addon-picker-section">
                    <div className="addon-picker-heading">
                      <strong>Individual plants, soil &amp; extra items</strong>
                      <span className="field-note">Unit prices come automatically from HugaTiera&apos;s local catalog — just toggle items and quantities.</span>
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
                                onChange={(e) => {
                                  setActiveBundleKey('')
                                  toggleAddonItem(addon.id, e.target.checked)
                                }}
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
                                    onChange={(e) => {
                                      setActiveBundleKey('')
                                      setAddonQuantity(addon.id, e.target.value)
                                    }}
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

                <div className="category-specs-panel" role="region" aria-label={activeCategoryTemplate.title}>
                  <div className="category-specs-header">
                    <div>
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
                              step="1"
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

                <label>
                  Reviewed AI requirement summary <span className="label-note">(Optional)</span>
                  <textarea rows="2" maxLength="5000" value={form.aiSummary} onChange={change('aiSummary')} placeholder="Structured summary shared with local gardeners." />
                </label>

                <label>
                  Budget or pricing note <span className="label-note">(Optional)</span>
                  <textarea
                    rows="2"
                    maxLength="2000"
                    value={form.priceComment}
                    onChange={change('priceComment')}
                    placeholder="e.g., Flexible on materials if we can stay near the lower end of the range."
                  />
                </label>
              </div>
            </details>

            {isGeneralRequest && nearbyRecommendations.length > 0 && (
              <div className="smart-gardeners-strip" role="region" aria-label="Smart recommended gardeners nearby">
                <div className="smart-gardeners-head">
                  <strong><Sparkles size={14} /> Smart Match: Top nearby gardeners for this request</strong>
                  <span className="field-note">Post open to all providers below, or pick one directly.</span>
                </div>
                <div className="smart-gardeners-grid">
                  {nearbyRecommendations.map((rec) => (
                    <div className="smart-gardener-mini-card" key={rec.id}>
                      <div className="smart-gardener-mini-top">
                        <strong>{rec.business_name || `${rec.first_name || ''} ${rec.last_name || ''}`.trim() || rec.title}</strong>
                        <span className="ai-match-inline-pill">{rec.ai_match?.matchScore || 0}% match</span>
                      </div>
                      <small>{rec.title} · {rec.service_area || rec.gardener_service_area || 'Zamboanga City'}</small>
                      <div className="smart-gardener-mini-meta">
                        {rec.average_rating != null && (
                          <span><Star size={12} fill="currentColor" /> {Number(rec.average_rating).toFixed(1)}</span>
                        )}
                        <Link className="text-link" to={`/inquiries/new?serviceId=${rec.id}`}>
                          Send directly <ArrowRight size={12} />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <dl className="inquiry-review-summary">
              <div><dt>Project</dt><dd>{form.subject || 'Not provided'}</dd></div>
              <div><dt>Area</dt><dd>{form.areaSqm ? `${form.areaSqm} m²` : 'Assess on site'}</dd></div>
              <div><dt>Location</dt><dd>{form.location || 'Zamboanga City'}</dd></div>
              <div><dt>Photos</dt><dd>{uploadedImages.length > 0 ? `${uploadedImages.length} attached` : 'None'}</dd></div>
            </dl>
            <p className="form-note">
              {isGeneralRequest
                ? 'Your open request will be posted to approved gardeners so you can compare offers before reaching a mutual agreement.'
                : 'This is an inquiry, not a confirmed booking. The gardener will respond with an offer before mutual agreement.'}
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
    requiredDepositAmount: '',
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
  const load = useCallback(() => inquiriesApi.get(id).then((res) => {
    setData(res)
    if (res?.activeAgreement) {
      setAgreementForm({
        scopeOfWork: res.activeAgreement.scope_of_work || '',
        amount: res.activeAgreement.amount ?? '',
        requiredDepositAmount: res.activeAgreement.required_deposit_amount ?? '',
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

  function autoFillQuoteFromEstimate(tier) {
    const inq = data?.inquiry
    if (!inq) return
    const pick = (minVal, maxVal) => {
      const lo = Number(minVal)
      const hi = Number(maxVal)
      if (!Number.isFinite(lo) && !Number.isFinite(hi)) return null
      const safeLo = Number.isFinite(lo) ? lo : hi
      const safeHi = Number.isFinite(hi) ? hi : lo
      if (tier === 'low') return Math.round(safeLo / 10) * 10
      if (tier === 'high') return Math.round(safeHi / 10) * 10
      return Math.round(((safeLo + safeHi) / 2) / 10) * 10
    }
    const laborVal = pick(inq.estimated_labor_min, inq.estimated_labor_max)
    const matVal = Number(inq.estimated_materials_max) > 0
      ? pick(inq.estimated_materials_min, inq.estimated_materials_max)
      : 0
    const totalVal = (laborVal !== null)
      ? laborVal + (matVal || 0)
      : pick(inq.estimated_min_amount, inq.estimated_max_amount)

    const items = Array.isArray(data?.estimateItems) ? data.estimateItems : []
    const breakdownText = items.length > 0
      ? items.map((item) => `${Number(item.quantity)} × ${item.item_name} (${formatEstimateRange(item.subtotal_min, item.subtotal_max)})`).join('; ')
      : ''

    setForm((current) => ({
      ...current,
      responseType: current.responseType === 'cannot_do' ? 'offer' : current.responseType,
      laborAmount: laborVal !== null ? String(laborVal) : current.laborAmount,
      materialsAmount: matVal > 0 ? String(matVal) : '',
      amount: totalVal !== null ? String(totalVal) : current.amount,
      materialsBreakdown: breakdownText || current.materialsBreakdown,
      availabilityStart: current.availabilityStart || formatDateInput(inq.requested_date) || '',
    }))
  }

  async function sendQuote(event) {
    event.preventDefault()
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
        setMessage(`Both parties approved agreement v${agreement.version}. Your booking reservation is now created!`)
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
        requiredDepositAmount: agreementForm.requiredDepositAmount === ''
          ? undefined
          : Number(agreementForm.requiredDepositAmount),
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

  return (
    <section className="container inquiry-content">
      <Link className="back-link" to="/inquiries"><ArrowLeft size={15} /> Back to inquiries</Link>
      <h1>{inquiry.subject}</h1>
      <div className="inquiry-status-row">
        <span className="category-pill">{inquiry.request_type === 'general' ? 'Open request' : 'Direct inquiry'}</span>
        <span className={getStatusBadgeClass(inquiry.status)}>{formatStatusLabel(inquiry.status)}</span>
        <span>{inquiry.service_title || inquiry.category_name || (inquiry.request_type === 'general' ? 'General gardening' : 'Direct gardener inquiry')}</span>
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
      {!inquiryFlowClosed && (
        <ol className="booking-stepper inquiry-stepper" aria-label="Inquiry progress">
          {inquirySteps.map((step) => {
            const done = step.num < inquiryStageIndex
            const active = step.num === inquiryStageIndex
            return (
              <li
                key={step.num}
                className={`booking-step${done ? ' is-done' : ''}${active ? ' is-current' : ''}`}
              >
                <span className="booking-step-num" aria-hidden="true">
                  {done ? <CheckCircle2 size={16} /> : step.num}
                </span>
                <span className="booking-step-copy">
                  <strong>{step.label}</strong>
                  <small>{step.sub}</small>
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {nextStepGuidance && (
        <div className={`booking-next-banner tone-${nextStepGuidance.tone}`} role="status">
          <strong>{nextStepGuidance.title}</strong>
          <p>{nextStepGuidance.text}</p>
        </div>
      )}
      {message && <TransientSuccess key={message} message={message} onDismiss={() => setMessage('')} style={{ marginBottom: '16px' }} />}
      {error && <div className="form-error" role="alert" style={{ marginBottom: '16px' }}>{error}</div>}
      <div className="inquiry-detail-grid">
        <article className="dashboard-panel">
          <p className="eyebrow">{user.role === 'gardener' ? 'Provider decision-support view' : 'Request & AI-assisted scope'}</p>
          <h2>Project details</h2>
          <div className="inquiry-glance-strip" aria-label="Request quick summary">
            <span><strong>Area</strong>{inquiry.area_sqm ? `${Number(inquiry.area_sqm)} m²` : 'Assess on site'}</span>
            <span><strong>Barangay</strong>{inquiry.location || 'Zamboanga City'}</span>
            <span><strong>Target date</strong>{formatDate(inquiry.requested_date) || 'Flexible'}</span>
            <span><strong>Estimate</strong>{inquiry.estimated_min_amount && inquiry.estimated_max_amount ? formatEstimateRange(inquiry.estimated_min_amount, inquiry.estimated_max_amount) : 'To be quoted'}</span>
            {inquiry.expires_at && <span><strong>Expires</strong>{formatDate(inquiry.expires_at)}</span>}
            <span><strong>Photos</strong>{images.length}</span>
          </div>
          <p className="inquiry-description">{inquiry.description}</p>
          {inquiry.ai_summary && (
            <div className="ai-callout-box" style={{ marginTop: '10px' }}>
              <p className="form-note" style={{ margin: 0 }}>
                <strong>Client-reviewed AI requirement summary:</strong> {inquiry.ai_summary}
              </p>
            </div>
          )}
          {images.length > 0 && (
            <div className="inquiry-photos-section">
              <h3>Garden photos &amp; concept previews ({images.length})</h3>
              <div className="inquiry-photo-showcase">
                {images.map((img) => {
                  const isAiConcept = img.kind === 'ai_generated'
                  return (
                    <figure className={`inquiry-photo-showcase-card${isAiConcept ? ' is-ai-concept' : ''}`} key={img.id}>
                      <a className="inquiry-photo-thumb" href={getRequestImageUrl(img.id)} target="_blank" rel="noreferrer" title="Click to open full-size photo">
                        <span className={`photo-kind-badge${isAiConcept ? ' is-ai' : ''}`}>
                          {isAiConcept ? 'AI Concept Preview' : 'Original site photo'}
                        </span>
                        <img
                          src={getRequestImageUrl(img.id)}
                          alt={isAiConcept ? 'AI garden concept preview' : 'Uploaded garden site photo'}
                          onError={(event) => {
                            event.currentTarget.style.display = 'none'
                            const fallback = event.currentTarget.nextElementSibling
                            if (fallback) fallback.style.display = 'grid'
                          }}
                        />
                        <span className="inquiry-photo-fallback" style={{ display: 'none' }}>Photo unavailable</span>
                      </a>
                      {(img.ai_description || isAiConcept) && (
                        <figcaption className="inquiry-photo-notes">
                          <strong>{isAiConcept ? 'AI Concept Preview (Visual Inspiration Only)' : 'Space notes'}</strong>
                          {img.ai_description && <p>{img.ai_description}</p>}
                          {isAiConcept && (
                            <p className="field-note" style={{ marginTop: '4px' }}>
                              Reference visual only — base final quotes on the original site photo and agreed scope.
                            </p>
                          )}
                        </figcaption>
                      )}
                    </figure>
                  )
                })}
              </div>
            </div>
          )}
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
                  {quote.amount !== null && quote.amount !== undefined && quote.amount !== '' ? formatPHP(quote.amount, { decimals: 2 }) : 'Indicative response'}
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
                <div className="offer-provider-strip">
                  <div className="offer-provider-meta">
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
                    <div className="offer-portfolio-thumbs">
                      {quote.gardener_portfolios.map((portfolio) => (
                        <figure key={portfolio.id}>
                          <img
                            src={servicesApi.imageUrl(portfolio.id)}
                            alt={portfolio.title || 'Portfolio work'}
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
                    <div className="revision-history-item" key={rev.id}>
                      <small>
                        <strong>v{rev.revision_number}</strong> ({RESPONSE_TYPE_LABELS[rev.response_type] || rev.response_type})
                        {rev.amount !== null && rev.amount !== undefined ? ` — ${formatPHP(rev.amount, { decimals: 2 })}` : ''}
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
                <strong>Mutual Agreement v{activeAgreement.version} — {formatPHP(activeAgreement.amount, { decimals: 2 })}</strong>
                <span className={getStatusBadgeClass(activeAgreement.status)}>{formatStatusLabel(activeAgreement.status)}</span>
              </div>
              <p>{activeAgreement.scope_of_work}</p>
              <small>
                Required deposit: {Number(activeAgreement.required_deposit_amount || 0) > 0
                  ? formatPHP(activeAgreement.required_deposit_amount, { decimals: 2 })
                  : '₱0.00 (No upfront deposit required)'}
                {' · '}
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
                  <Link className="button" to={`/bookings/${activeAgreement.booking_id}`}>View booking</Link>
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
                      <div className="form-row form-row-3">
                        <label>Agreed price (PHP)
                          <input required type="number" min="0" step="0.01" value={agreementForm.amount} onChange={(e) => setAgreementForm({ ...agreementForm, amount: e.target.value })} />
                        </label>
                        <label>Required deposit (PHP) <span className="label-note">(0 = no deposit)</span>
                          <input
                            type="number"
                            min="0"
                            max={agreementForm.amount || undefined}
                            step="0.01"
                            value={agreementForm.requiredDepositAmount}
                            onChange={(e) => setAgreementForm({ ...agreementForm, requiredDepositAmount: e.target.value })}
                            placeholder={agreementForm.amount ? `Default 30%: ${(Number(agreementForm.amount) * 0.3).toFixed(2)}` : '30% default'}
                          />
                        </label>
                        <label>Price basis
                          <input value={agreementForm.priceBasis} onChange={(e) => setAgreementForm({ ...agreementForm, priceBasis: e.target.value })} />
                        </label>
                      </div>
                      {Number(agreementForm.amount) > 0 && (
                        <div className="quick-duration-row" role="group" aria-label="Quick deposit percentage presets">
                          <span className="field-note" style={{ margin: 0 }}>Quick deposit:</span>
                          {[
                            { pct: 0, label: 'No deposit (0%)' },
                            { pct: 0.3, label: '30% standard' },
                            { pct: 0.5, label: '50% materials upfront' },
                            { pct: 1, label: '100% full' },
                          ].map((preset) => {
                            const targetVal = (Number(agreementForm.amount) * preset.pct).toFixed(2)
                            const active = agreementForm.requiredDepositAmount !== ''
                              && Number(agreementForm.requiredDepositAmount) === Number(targetVal)
                            return (
                              <button
                                key={preset.label}
                                type="button"
                                className={`booking-filter-pill${active ? ' is-active' : ''}`}
                                onClick={() => setAgreementForm((current) => ({ ...current, requiredDepositAmount: targetVal }))}
                              >
                                {preset.label} ({formatPHP(targetVal, { decimals: 0 })})
                              </button>
                            )
                          })}
                        </div>
                      )}
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
                      <label>Conditions &amp; payment notes
                        <textarea rows="2" value={agreementForm.conditions} onChange={(e) => setAgreementForm({ ...agreementForm, conditions: e.target.value })} placeholder="Materials, access instructions, or preferred GCash/Maya/cash payment arrangement." />
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
                        <div><dt>Agreed price</dt><dd>{agreementForm.amount ? formatPHP(agreementForm.amount, { decimals: 2 }) : 'Not provided'}</dd></div>
                        <div><dt>Required deposit</dt><dd>{agreementForm.requiredDepositAmount !== '' ? (Number(agreementForm.requiredDepositAmount) > 0 ? formatPHP(agreementForm.requiredDepositAmount, { decimals: 2 }) : '₱0.00 (No upfront deposit)') : 'Default (30%)'}</dd></div>
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
        {canGardenerRespond && (
          <form className="dashboard-panel profile-form gardener-fast-quote-form" onSubmit={sendQuote}>
            <div className="activity-heading">
              <div>
                <p className="eyebrow">{editingQuoteId ? 'Revise active offer' : 'Quick response'}</p>
                <h2>{editingQuoteId ? 'Update your offer before acceptance.' : 'Send your quote or response.'}</h2>
              </div>
              {editingQuoteId && (
                <button className="table-action" type="button" onClick={cancelReviseQuote}>
                  Cancel edit
                </button>
              )}
            </div>

            {inquiry.estimated_min_amount && inquiry.estimated_max_amount && (
              <div className="gardener-estimate-ref">
                <div className="gardener-autofill-row">
                  <div>
                    <strong>System range: {formatEstimateRange(inquiry.estimated_min_amount, inquiry.estimated_max_amount)}</strong>
                    {inquiry.area_sqm ? ` (${Number(inquiry.area_sqm)} m²)` : ''}
                  </div>
                  <div className="gardener-autofill-chips" role="group" aria-label="Auto-fill quote from system estimate">
                    <span className="field-note" style={{ margin: 0 }}>Auto-fill:</span>
                    <button type="button" className="table-action" onClick={() => autoFillQuoteFromEstimate('low')}>Low</button>
                    <button type="button" className="table-action" onClick={() => autoFillQuoteFromEstimate('mid')}>Mid</button>
                    <button type="button" className="table-action" onClick={() => autoFillQuoteFromEstimate('high')}>High</button>
                  </div>
                </div>
                {inquiry.price_comment && <p className="field-note" style={{ margin: '4px 0 0' }}>Client note: &ldquo;{inquiry.price_comment}&rdquo;</p>}
              </div>
            )}

            <div className="quote-response-pills" role="group" aria-label="Response type">
              {[
                { value: 'offer', label: 'Send offer' },
                { value: 'modifications', label: 'Suggest changes' },
                { value: 'feasible', label: 'Feasible' },
                ...(inquiry.request_type === 'general' ? [{ value: 'interest', label: 'Interested' }] : []),
                { value: 'cannot_do', label: 'Cannot fulfill' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`booking-filter-pill${form.responseType === opt.value ? ' is-active' : ''}`}
                  onClick={() => setForm((current) => ({ ...current, responseType: opt.value }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {form.responseType !== 'cannot_do' && (
              <div className="form-row">
                <label>Total indicative amount (PHP)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g., 2500"
                    value={form.amount}
                    onChange={change('amount')}
                  />
                </label>
                <label>
                  Available start date <span className="label-note">(Optional)</span>
                  <div className="inline-date-shortcut">
                    <input type="date" value={form.availabilityStart} onChange={change('availabilityStart')} />
                    {inquiry.requested_date && (
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => setForm((current) => ({ ...current, availabilityStart: formatDateInput(inquiry.requested_date) }))}
                      >
                        Use client&apos;s date
                      </button>
                    )}
                  </div>
                </label>
              </div>
            )}

            <label>
              {form.responseType === 'cannot_do' ? 'Reason you cannot fulfill this request' : 'What is included / message to client'}{' '}
              <span className="required-mark" aria-hidden="true">*</span>
              <textarea
                required
                rows="3"
                value={form.details}
                onChange={change('details')}
                placeholder={form.responseType === 'cannot_do'
                  ? 'Briefly explain why (e.g., fully booked on that date or outside service area).'
                  : 'Explain what is included, materials/plants covered, and any site notes.'}
              />
            </label>

            {form.responseType === 'modifications' && (
              <label>Proposed modifications <span className="required-mark" aria-hidden="true">*</span>
                <textarea required rows="2" value={form.proposedChanges} onChange={change('proposedChanges')} placeholder="Describe suggested adjustments to scope, schedule, or materials." />
              </label>
            )}

            {form.responseType !== 'cannot_do' && (
              <>
                <div className="quick-duration-row">
                  <span className="field-note" style={{ margin: 0 }}>Est. duration:</span>
                  {[
                    { days: '0.5', label: 'Half day' },
                    { days: '1', label: '1 day' },
                    { days: '2', label: '2 days' },
                    { days: '3', label: '3 days' },
                  ].map((chip) => (
                    <button
                      key={chip.days}
                      type="button"
                      className={`booking-filter-pill${String(form.estimatedWorkingDays) === chip.days ? ' is-active' : ''}`}
                      onClick={() => setForm((current) => ({
                        ...current,
                        estimatedWorkingDays: String(current.estimatedWorkingDays) === chip.days ? '' : chip.days,
                      }))}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                <label className="site-visit-checkbox">
                  <input
                    type="checkbox"
                    checked={form.requiresSiteVisit}
                    onChange={(e) => setForm((current) => ({ ...current, requiresSiteVisit: e.target.checked }))}
                  />
                  <span>Requires an on-site ocular inspection before finalizing the exact price</span>
                </label>

                <details className="inquiry-optional-drawer">
                  <summary>Add labor/materials split, breakdown &amp; quote validity (optional)</summary>
                  <div className="inquiry-optional-body">
                    <div className="form-row">
                      <label>Labor cost (PHP)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="e.g. 1500"
                          value={form.laborAmount}
                          onChange={(e) => handleQuoteSplitChange('laborAmount', e.target.value)}
                        />
                      </label>
                      <label>Plants &amp; materials (PHP)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="e.g. 1200"
                          value={form.materialsAmount}
                          onChange={(e) => handleQuoteSplitChange('materialsAmount', e.target.value)}
                        />
                      </label>
                    </div>
                    <label>Plants &amp; materials breakdown note
                      <textarea
                        rows="2"
                        maxLength="2000"
                        value={form.materialsBreakdown}
                        onChange={change('materialsBreakdown')}
                        placeholder="e.g., 6 bougainvillea shrubs, 3 bags loam soil, 1 debris hauling load"
                      />
                    </label>
                    <div className="form-row form-row-3">
                      <label>Est. working days
                        <input type="number" min="0.5" max="90" step="0.5" placeholder="e.g., 1.5" value={form.estimatedWorkingDays} onChange={change('estimatedWorkingDays')} />
                      </label>
                      <label>Est. hours
                        <input type="number" min="0.5" max="500" step="0.5" placeholder="e.g., 4" value={form.estimatedHours} onChange={change('estimatedHours')} />
                      </label>
                      <label>Quotation valid until
                        <input type="date" value={form.validUntil} onChange={change('validUntil')} />
                      </label>
                    </div>
                    <label>Available until
                      <input type="date" value={form.availabilityEnd} onChange={change('availabilityEnd')} />
                    </label>
                  </div>
                </details>
              </>
            )}

            <div className="register-step-actions">
              <button className="button" type="submit" disabled={submittingQuote}>
                {submittingQuote ? 'Sending...' : editingQuoteId ? 'Save revised offer' : 'Send response'}
              </button>
            </div>
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
  const [statusFilter, setStatusFilter] = useState('all')
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
          if (active) setInquiries(list)
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
              <select value={filters.area} onChange={(e) => setFilters({ ...filters, area: e.target.value })}>
                <option value="">All barangays</option>
                {ZAMBOANGA_BARANGAYS.map((brgy) => <option key={brgy} value={brgy}>{brgy}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      {loading && <p>Loading requests...</p>}
      {error && <div className="form-error" role="alert">{error}</div>}

      {!loading && !error && activeTab === 'mine' && inquiries.length === 0 && (
        <div className="empty-state">You do not have any inquiries yet.</div>
      )}

      {!loading && !error && activeTab === 'mine' && inquiries.length > 0 && (() => {
        const filterGroups = [
          { key: 'all', label: 'All', match: () => true },
          { key: 'open', label: 'Open & Responded', match: (item) => ['open', 'responded'].includes(item.status) },
          { key: 'agreement', label: 'Selected & Agreement', match: (item) => ['provider_selected', 'in_agreement'].includes(item.status) },
          { key: 'confirmed', label: 'Confirmed', match: (item) => item.status === 'confirmed' },
          { key: 'closed', label: 'Closed / Cancelled', match: (item) => ['closed', 'cancelled', 'expired', 'declined', 'withdrawn'].includes(item.status) },
        ]
        const activeFilterDef = filterGroups.find((f) => f.key === statusFilter) || filterGroups[0]
        const filteredInquiries = inquiries.filter(activeFilterDef.match)

        return (
          <>
            <div className="booking-filter-bar" role="tablist" aria-label="Filter inquiries by status" style={{ marginTop: '14px' }}>
              {filterGroups.map((group) => {
                const count = inquiries.filter(group.match).length
                return (
                  <button
                    key={group.key}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === group.key}
                    className={`booking-filter-pill${statusFilter === group.key ? ' is-active' : ''}`}
                    onClick={() => setStatusFilter(group.key)}
                  >
                    <span>{group.label}</span>
                    <span className="booking-filter-count">{count}</span>
                  </button>
                )
              })}
            </div>
            {filteredInquiries.length === 0 ? (
              <div className="empty-state" style={{ marginTop: '14px' }}>
                No inquiries match &ldquo;{activeFilterDef.label}&rdquo;. Select another tab above to view your other records.
              </div>
            ) : (
              <div className="marketplace-grid marketplace-card-grid" style={{ marginTop: '20px' }}>
                {filteredInquiries.map((inquiry) => {
                  const coverUrl = inquiry.first_image_id ? getRequestImageUrl(inquiry.first_image_id) : null
                  const partnerLabel = user?.role === 'gardener'
                    ? `${inquiry.client_first_name || ''} ${inquiry.client_last_name || ''}`.trim() || 'Client'
                    : inquiry.gardener_name || (inquiry.offer_count > 0 ? `${inquiry.offer_count} provider ${Number(inquiry.offer_count) === 1 ? 'offer' : 'offers'}` : 'Open to providers')
                  return (
                    <article className="marketplace-card visual-market-card" key={inquiry.id}>
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
          </>
        )
      })()}

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
