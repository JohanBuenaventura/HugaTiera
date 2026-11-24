const { estimateWorkDuration } = require('./scheduling')

const COMPLEXITY_FACTORS = {
  light: { factor: 0.85, label: 'Light (routine trim / basic cleaning)' },
  moderate: { factor: 1.0, label: 'Moderate (overgrown / partial work)' },
  heavy: { factor: 1.35, label: 'Heavy (dense clearing / full landscaping)' },
}

const MATERIALS_FACTORS = {
  client_provides: { factor: 1.0, label: 'Labor only (client provides materials)' },
  gardener_provides: { factor: 1.35, label: 'Labor + materials/plants supplied by gardener' },
}

const DEFAULT_RATES = {
  ratePerSqmMin: 60,
  ratePerSqmMax: 120,
  minBaseFee: 450,
}

const ESTIMATE_DISCLAIMER =
  'Indicative estimate only. Gardeners may adjust the quote or request an on-site ocular inspection before finalizing terms in a Mutual Agreement.'

function isPerSqmUnit(priceUnit) {
  if (typeof priceUnit !== 'string') return false
  return /(sq\.?\s*m|sqm|m2|m²|square\s*meter)/i.test(priceUnit.trim())
}

function roundToNearestTen(amount) {
  return Math.round(amount / 10) * 10
}

function parseEstimatorInputs(body = {}) {
  const rawArea = body.areaSqm ?? body.area_sqm
  const hasArea = rawArea !== undefined && rawArea !== null && String(rawArea).trim() !== ''
  let areaSqm = null
  if (hasArea) {
    const num = Number(rawArea)
    if (!Number.isFinite(num) || num <= 0 || num > 50000) {
      return { error: 'Estimated garden area must be a positive number between 0.5 and 50,000 sq. meters.' }
    }
    areaSqm = Math.round(num * 100) / 100
  }

  const rawComplexity = body.workComplexity ?? body.work_complexity
  const complexityStr = typeof rawComplexity === 'string' ? rawComplexity.trim().toLowerCase() : ''
  let workComplexity = null
  if (complexityStr) {
    if (!COMPLEXITY_FACTORS[complexityStr]) {
      return { error: 'Site condition must be light, moderate, or heavy.' }
    }
    workComplexity = complexityStr
  } else if (hasArea) {
    workComplexity = 'moderate'
  }

  const rawMaterials = body.materialsOption ?? body.materials_option
  const materialsStr = typeof rawMaterials === 'string' ? rawMaterials.trim().toLowerCase() : ''
  let materialsOption = null
  if (materialsStr) {
    if (!MATERIALS_FACTORS[materialsStr]) {
      return { error: 'Materials option must be client_provides or gardener_provides.' }
    }
    materialsOption = materialsStr
  } else if (hasArea) {
    materialsOption = 'client_provides'
  }

  const rawSiteVisit = body.siteVisitRequested ?? body.site_visit_requested
  const siteVisitRequested = rawSiteVisit === true || rawSiteVisit === 'true' || rawSiteVisit === 1 || rawSiteVisit === '1'

  const rawComment = body.priceComment ?? body.price_comment
  const priceComment = typeof rawComment === 'string' ? rawComment.trim() || null : null
  if (priceComment && priceComment.length > 2000) {
    return { error: 'Price or budget comment must be 2,000 characters or fewer.' }
  }

  return {
    areaSqm,
    workComplexity,
    materialsOption,
    siteVisitRequested,
    priceComment,
  }
}

function parseSelectedAddonItems(rawItems) {
  if (rawItems === undefined || rawItems === null) return { items: [] }
  if (!Array.isArray(rawItems)) {
    return { error: 'Selected plant/material items must be an array.' }
  }
  if (rawItems.length > 20) {
    return { error: 'You may include up to 20 pricing add-on items per inquiry.' }
  }

  const byId = new Map()
  for (const entry of rawItems) {
    const addonId = Number(entry?.addonId ?? entry?.addon_id ?? entry?.id)
    const qty = Number(entry?.quantity)
    if (!Number.isInteger(addonId) || addonId < 1) {
      return { error: 'Each selected plant or material item must reference a valid pricing add-on ID.' }
    }
    if (!Number.isFinite(qty) || qty <= 0 || qty > 10000) {
      return { error: 'Each selected item quantity must be a positive number up to 10,000.' }
    }
    const cleanQty = Math.round(qty * 100) / 100
    byId.set(addonId, cleanQty)
  }

  return {
    items: Array.from(byId.entries()).map(([addonId, quantity]) => ({ addonId, quantity })),
  }
}

function calculatePriceEstimate({
  areaSqm,
  workComplexity = 'moderate',
  materialsOption = 'client_provides',
  category = null,
  service = null,
  selectedAddons = [],
}) {
  if (!Number.isFinite(areaSqm) || areaSqm <= 0) return null

  const complexityKey = COMPLEXITY_FACTORS[workComplexity] ? workComplexity : 'moderate'
  const materialsKey = MATERIALS_FACTORS[materialsOption] ? materialsOption : 'client_provides'
  const complexityFactor = COMPLEXITY_FACTORS[complexityKey].factor
  const materialsFactor = MATERIALS_FACTORS[materialsKey].factor

  const catMin = Number(category?.rate_per_sqm_min)
  const catMax = Number(category?.rate_per_sqm_max)
  const catFloor = Number(category?.min_base_fee)

  let ratePerSqmMin = Number.isFinite(catMin) && catMin > 0 ? catMin : DEFAULT_RATES.ratePerSqmMin
  let ratePerSqmMax = Number.isFinite(catMax) && catMax >= ratePerSqmMin ? catMax : Math.max(ratePerSqmMin, DEFAULT_RATES.ratePerSqmMax)
  const minBaseFee = Number.isFinite(catFloor) && catFloor >= 0 ? catFloor : DEFAULT_RATES.minBaseFee

  let rateSource = category ? 'category_baseline' : 'platform_default'
  let rateSourceLabel = category?.name
    ? `${category.name} baseline (₱${ratePerSqmMin}–₱${ratePerSqmMax}/m²)`
    : `General gardening baseline (₱${ratePerSqmMin}–₱${ratePerSqmMax}/m²)`

  const servicePrice = Number(service?.indicative_price)
  if (service && Number.isFinite(servicePrice) && servicePrice > 0 && isPerSqmUnit(service.price_unit)) {
    ratePerSqmMin = Math.round(servicePrice * 0.9 * 100) / 100
    ratePerSqmMax = Math.round(servicePrice * 1.15 * 100) / 100
    rateSource = 'service_per_sqm'
    rateSourceLabel = `Service rate (₱${servicePrice}/${service.price_unit})`
  } else if (service && Number.isFinite(servicePrice) && servicePrice > 0) {
    rateSource = 'category_baseline_with_service_ref'
    rateSourceLabel = `${category?.name || 'Category'} baseline (service listed at ₱${servicePrice}${service.price_unit ? ` ${service.price_unit}` : ''})`
  }

  const laborRawMin = areaSqm * ratePerSqmMin * complexityFactor
  const laborRawMax = areaSqm * ratePerSqmMax * complexityFactor
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
  } else if (materialsKey === 'gardener_provides') {
    materialsMode = 'allowance_multiplier'
    const multiplier = complexityFactor * materialsFactor
    const rawMin = areaSqm * ratePerSqmMin * multiplier
    const rawMax = areaSqm * ratePerSqmMax * multiplier
    estimatedMinAmount = roundToNearestTen(Math.max(minBaseFee, rawMin))
    estimatedMaxAmount = roundToNearestTen(Math.max(estimatedMinAmount, Math.max(minBaseFee * 1.25, rawMax)))
    estimatedMaterialsMin = Math.max(0, estimatedMinAmount - estimatedLaborMin)
    estimatedMaterialsMax = Math.max(estimatedMaterialsMin, estimatedMaxAmount - estimatedLaborMax)
  }

  const duration = estimateWorkDuration({
    areaSqm,
    workComplexity: complexityKey,
    materialsOption: items.length > 0 ? 'gardener_provides' : materialsKey,
  })

  return {
    areaSqm,
    workComplexity: complexityKey,
    complexityFactor,
    complexityLabel: COMPLEXITY_FACTORS[complexityKey].label,
    materialsOption: materialsKey,
    materialsFactor: items.length > 0 ? 1.0 : materialsFactor,
    materialsLabel: MATERIALS_FACTORS[materialsKey].label,
    materialsMode,
    ratePerSqmMin,
    ratePerSqmMax,
    minBaseFee,
    rateSource,
    rateSourceLabel,
    estimatedLaborMin,
    estimatedLaborMax,
    estimatedMaterialsMin,
    estimatedMaterialsMax,
    estimatedMinAmount,
    estimatedMaxAmount,
    items,
    estimatedHours: duration ? duration.estimatedHours : null,
    estimatedWorkingDays: duration ? duration.estimatedWorkingDays : null,
    disclaimer: ESTIMATE_DISCLAIMER,
  }
}

module.exports = {
  COMPLEXITY_FACTORS,
  DEFAULT_RATES,
  ESTIMATE_DISCLAIMER,
  MATERIALS_FACTORS,
  calculatePriceEstimate,
  isPerSqmUnit,
  parseEstimatorInputs,
  parseSelectedAddonItems,
}
