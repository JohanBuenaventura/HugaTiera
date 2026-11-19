const apiBaseUrl = import.meta.env.VITE_API_URL || '/api'

export const WORK_COMPLEXITY_OPTIONS = [
  { value: 'light', label: 'Light — Routine trim or basic cleanup (×0.85)', factor: 0.85 },
  { value: 'moderate', label: 'Moderate — Overgrown or partial redesign (×1.00)', factor: 1.0 },
  { value: 'heavy', label: 'Heavy — Dense clearing or full landscaping (×1.35)', factor: 1.35 },
]

export const MATERIALS_OPTIONS = [
  { value: 'client_provides', label: 'Labor only — Client provides plants/materials (×1.00)', factor: 1.0 },
  { value: 'gardener_provides', label: 'Labor + Materials/Plants — Gardener supplies (×1.35)', factor: 1.35 },
]

export const COMPLEXITY_LABELS = {
  light: 'Light (routine trim / basic cleanup)',
  moderate: 'Moderate (overgrown / partial work)',
  heavy: 'Heavy (dense clearing / full landscaping)',
}

export const MATERIALS_LABELS = {
  client_provides: 'Labor only (client provides materials)',
  gardener_provides: 'Labor + materials/plants supplied by gardener',
}

export const ESTIMATE_DISCLAIMER =
  'Indicative estimate only. Gardeners may adjust the quote or request an on-site ocular inspection before finalizing terms in a Mutual Agreement.'

function isPerSqmUnit(priceUnit) {
  if (typeof priceUnit !== 'string') return false
  return /(sq\.?\s*m|sqm|m2|m²|square\s*meter)/i.test(priceUnit.trim())
}

function roundToNearestTen(amount) {
  return Math.round(amount / 10) * 10
}

export function formatPeso(amount) {
  const num = Number(amount)
  if (!Number.isFinite(num)) return ''
  return `₱${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function formatEstimateRange(minAmount, maxAmount) {
  const min = Number(minAmount)
  const max = Number(maxAmount)
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0) return null
  if (min === max) return formatPeso(min)
  return `${formatPeso(min)} – ${formatPeso(max)}`
}

export const ADDON_TYPE_LABELS = {
  plant: 'Plants & Grass',
  material: 'Soil & Materials',
  equipment: 'Equipment',
  disposal: 'Hauling & Disposal',
}

export function computeLocalPriceEstimate({
  areaSqm,
  workComplexity = 'moderate',
  materialsOption = 'client_provides',
  category = null,
  service = null,
  selectedAddons = [],
}) {
  const area = Number(areaSqm)
  if (!Number.isFinite(area) || area <= 0 || area > 50000) return null

  const compOpt = WORK_COMPLEXITY_OPTIONS.find((o) => o.value === workComplexity) || WORK_COMPLEXITY_OPTIONS[1]
  const matOpt = MATERIALS_OPTIONS.find((o) => o.value === materialsOption) || MATERIALS_OPTIONS[0]

  const catMin = Number(category?.rate_per_sqm_min ?? service?.rate_per_sqm_min)
  const catMax = Number(category?.rate_per_sqm_max ?? service?.rate_per_sqm_max)
  const catFloor = Number(category?.min_base_fee ?? service?.min_base_fee)

  let ratePerSqmMin = Number.isFinite(catMin) && catMin > 0 ? catMin : 60
  let ratePerSqmMax = Number.isFinite(catMax) && catMax >= ratePerSqmMin ? catMax : Math.max(ratePerSqmMin, 120)
  const minBaseFee = Number.isFinite(catFloor) && catFloor >= 0 ? catFloor : 450

  const catName = category?.name || service?.category_name || null
  let rateSourceLabel = catName
    ? `${catName} baseline (₱${ratePerSqmMin}–₱${ratePerSqmMax}/m²)`
    : `General gardening baseline (₱${ratePerSqmMin}–₱${ratePerSqmMax}/m²)`

  const servicePrice = Number(service?.indicative_price)
  if (service && Number.isFinite(servicePrice) && servicePrice > 0 && isPerSqmUnit(service.price_unit)) {
    ratePerSqmMin = Math.round(servicePrice * 0.9 * 100) / 100
    ratePerSqmMax = Math.round(servicePrice * 1.15 * 100) / 100
    rateSourceLabel = `Service rate (₱${servicePrice}/${service.price_unit})`
  } else if (service && Number.isFinite(servicePrice) && servicePrice > 0) {
    rateSourceLabel = `${catName || 'Category'} baseline (service listed at ₱${servicePrice}${service.price_unit ? ` ${service.price_unit}` : ''})`
  }

  const laborRawMin = area * ratePerSqmMin * compOpt.factor
  const laborRawMax = area * ratePerSqmMax * compOpt.factor
  const estimatedLaborMin = roundToNearestTen(Math.max(minBaseFee, laborRawMin))
  const estimatedLaborMax = roundToNearestTen(Math.max(estimatedLaborMin, Math.max(minBaseFee * 1.25, laborRawMax)))

  const items = []
  let itemizedMin = 0
  let itemizedMax = 0
  for (const entry of selectedAddons) {
    const qty = Number(entry.quantity)
    const uMin = Number(entry.unit_price_min ?? entry.unitPriceMin)
    const uMax = Number(entry.unit_price_max ?? entry.unitPriceMax)
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(uMin) || !Number.isFinite(uMax)) continue
    const subMin = Math.round(qty * uMin * 100) / 100
    const subMax = Math.round(qty * uMax * 100) / 100
    itemizedMin += subMin
    itemizedMax += subMax
    items.push({
      addonId: entry.id ?? entry.addonId,
      itemName: entry.name ?? entry.itemName,
      itemType: entry.item_type ?? entry.itemType ?? 'material',
      unit: entry.unit || 'per item',
      quantity: qty,
      unitPriceMin: uMin,
      unitPriceMax: uMax,
      subtotalMin: subMin,
      subtotalMax: subMax,
    })
  }

  let estimatedMaterialsMin = 0
  let estimatedMaterialsMax = 0
  let estimatedMinAmount = estimatedLaborMin
  let estimatedMaxAmount = estimatedLaborMax
  let materialsMode = 'client_provides'

  if (items.length > 0) {
    materialsMode = 'itemized'
    estimatedMaterialsMin = roundToNearestTen(itemizedMin)
    estimatedMaterialsMax = roundToNearestTen(Math.max(estimatedMaterialsMin, itemizedMax))
    estimatedMinAmount = roundToNearestTen(estimatedLaborMin + itemizedMin)
    estimatedMaxAmount = roundToNearestTen(Math.max(estimatedMinAmount, estimatedLaborMax + itemizedMax))
  } else if (matOpt.value === 'gardener_provides') {
    materialsMode = 'allowance_multiplier'
    const multiplier = compOpt.factor * matOpt.factor
    const rawMin = area * ratePerSqmMin * multiplier
    const rawMax = area * ratePerSqmMax * multiplier
    estimatedMinAmount = roundToNearestTen(Math.max(minBaseFee, rawMin))
    estimatedMaxAmount = roundToNearestTen(Math.max(estimatedMinAmount, Math.max(minBaseFee * 1.25, rawMax)))
    estimatedMaterialsMin = Math.max(0, estimatedMinAmount - estimatedLaborMin)
    estimatedMaterialsMax = Math.max(estimatedMaterialsMin, estimatedMaxAmount - estimatedLaborMax)
  }

  const sqmPerHour = compOpt.value === 'light' ? 15 : compOpt.value === 'heavy' ? 5 : 10
  const matDurationMult = (items.length > 0 || matOpt.value === 'gardener_provides') ? 1.15 : 1.0
  const estimatedHours = Math.max(2, Math.round((area / sqmPerHour) * matDurationMult * 2) / 2)
  const estimatedWorkingDays = Math.max(0.5, Math.round((estimatedHours / 8) * 2) / 2)

  return {
    areaSqm: Math.round(area * 100) / 100,
    workComplexity: compOpt.value,
    complexityFactor: compOpt.factor,
    materialsOption: matOpt.value,
    materialsFactor: items.length > 0 ? 1.0 : matOpt.factor,
    materialsMode,
    ratePerSqmMin,
    ratePerSqmMax,
    minBaseFee,
    floorApplied: laborRawMin < minBaseFee,
    rateSourceLabel,
    estimatedLaborMin,
    estimatedLaborMax,
    estimatedMaterialsMin,
    estimatedMaterialsMax,
    estimatedMinAmount,
    estimatedMaxAmount,
    items,
    estimatedHours,
    estimatedWorkingDays,
    disclaimer: ESTIMATE_DISCLAIMER,
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(data?.message || 'The inquiry request failed.')
  return data
}

export const inquiriesApi = {
  list: () => request('/inquiries'),
  listOpen: (params = {}) => {
    const query = new URLSearchParams()
    if (params.categoryId) query.set('categoryId', params.categoryId)
    if (params.area) query.set('area', params.area)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return request(`/inquiries/open${suffix}`)
  },
  estimate: (details) => request('/inquiries/estimate', { method: 'POST', body: JSON.stringify(details) }),
  get: (id) => request(`/inquiries/${id}`),
  create: (details) => request('/inquiries', { method: 'POST', body: JSON.stringify(details) }),
  renew: (id, expiresInDays = 14) => request(`/inquiries/${id}/renew`, { method: 'POST', body: JSON.stringify({ expiresInDays }) }),
  close: (id, status) => request(`/inquiries/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  quote: (id, details) => request(`/inquiries/${id}/quotations`, { method: 'POST', body: JSON.stringify(details) }),
  reviseQuote: (quotationId, details) => request(`/inquiries/quotations/${quotationId}`, { method: 'PUT', body: JSON.stringify(details) }),
  withdrawQuote: (quotationId) => request(`/inquiries/quotations/${quotationId}/withdraw`, { method: 'POST' }),
  quoteStatus: (id, status) => request(`/inquiries/quotations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
}
