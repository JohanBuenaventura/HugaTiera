// Zamboanga City barangay/district proximity & service-conduct recommendation helpers.
// Advisory decision-support only: uses declared barangay/area text (no live GPS tracking)
// and never auto-selects providers, confirms bookings, or sets final prices.

const ZAMBOANGA_DISTRICTS = {
  central: {
    label: 'Central Zamboanga',
    barangays: [
      'tetuan', 'sta. maria', 'santa maria', 'pasonanca', 'guiwan', 'putik',
      'tugbungan', 'camino nuevo', 'canelar', 'san jose gusu', 'gusu',
      'baliwasan', 'tumaga', 'lunzuran', 'divisoria', 'boalan', 'calarian',
      'san roque', 'sto. nino', 'santo nino', 'zone i', 'zone ii', 'zone iii',
      'zone iv', 'campo islam', 'rio hondo', 'mariki', 'sta. barbara', 'santa barbara',
      'sta. catalina', 'santa catalina', 'kasanyangan', 'talon-talon', 'talon talon',
    ],
  },
  west: {
    label: 'West Coast Zamboanga',
    barangays: [
      'upper calarian', 'sinunuc', 'maasin', 'ayala', 'recodo', 'san ramon',
      'talisayan', 'cawit', 'labuan', 'pampanga', 'limpapa', 'la paz', 'pamucutan',
      'malagutay', 'tulungatung', 'baluno',
    ],
  },
  east: {
    label: 'East Coast Zamboanga',
    barangays: [
      'mampang', 'arena blanco', 'mercedes', 'culianan', 'cabaluay', 'manicahan',
      'sangali', 'bolong', 'curuan', 'victoria', 'lanzones', 'guisao', 'lamisahan',
      'taluksangay', 'talabaan', 'zambowood', 'pasobolong', 'salaan', 'bunguiao',
      'lumayang', 'cabaluay', 'panubigan', 'quiniput', 'vitali',
    ],
  },
  highland: {
    label: 'North / Highland Zamboanga',
    barangays: [
      'cabatangan', 'dulian', 'pasonanca', 'tumaga', 'lunzuran', 'bunguiao',
      'pasobolong', 'salaan', 'capisan', 'la paz', 'tolosa',
    ],
  },
}

const ADJACENT_DISTRICTS = {
  central: ['west', 'east', 'highland'],
  west: ['central', 'highland'],
  east: ['central', 'highland'],
  highland: ['central', 'west', 'east'],
}

function normalizeLocationText(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractLocationInfo(rawLocation) {
  const norm = normalizeLocationText(rawLocation)
  if (!norm) {
    return { raw: '', normalized: '', barangays: [], districts: [], isCityWide: false }
  }

  const matchedBarangays = new Set()
  const matchedDistricts = new Set()

  for (const [districtKey, info] of Object.entries(ZAMBOANGA_DISTRICTS)) {
    for (const brgy of info.barangays) {
      const escaped = brgy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i')
      if (regex.test(norm)) {
        matchedBarangays.add(brgy)
        matchedDistricts.add(districtKey)
      }
    }
  }

  const isCityWide = matchedBarangays.size === 0 && /zamboanga/i.test(norm)
  return {
    raw: String(rawLocation || '').trim(),
    normalized: norm,
    barangays: [...matchedBarangays],
    districts: [...matchedDistricts],
    isCityWide,
  }
}

function formatBarangayDisplay(brgy) {
  return brgy
    .split(/([\s-])/)
    .map((part) => (part.length > 0 && /[a-z]/i.test(part[0]) ? part[0].toUpperCase() + part.slice(1) : part))
    .join('')
}

function computeLocationProximity(userLocationRaw, targetLocationRaw) {
  const userLoc = extractLocationInfo(userLocationRaw)
  const targetLoc = extractLocationInfo(targetLocationRaw)

  if (!userLoc.normalized || !targetLoc.normalized) {
    return {
      score: 55,
      tier: 'city',
      isNearby: true,
      label: targetLoc.raw || 'Zamboanga City',
      matchedBarangay: null,
      matchedDistrict: null,
    }
  }

  // 1. Exact barangay match
  for (const brgy of userLoc.barangays) {
    if (targetLoc.barangays.includes(brgy)) {
      const pretty = formatBarangayDisplay(brgy)
      return {
        score: 100,
        tier: 'same_barangay',
        isNearby: true,
        label: `Same barangay (${pretty})`,
        matchedBarangay: pretty,
        matchedDistrict: userLoc.districts[0] || null,
      }
    }
  }

  // 2. Direct token overlap (for smaller sitios/subdivisions not in the barangay table)
  const stopWords = new Set(['zamboanga', 'city', 'philippines', 'barangay', 'brgy', 'st', 'street', 'road', 'rd', 'zone'])
  const userTokens = userLoc.normalized.split(' ').filter((w) => w.length >= 4 && !stopWords.has(w))
  const targetTokens = new Set(targetLoc.normalized.split(' ').filter((w) => w.length >= 4 && !stopWords.has(w)))
  const tokenHit = userTokens.find((t) => targetTokens.has(t))
  if (tokenHit) {
    const pretty = formatBarangayDisplay(tokenHit)
    return {
      score: 94,
      tier: 'same_area',
      isNearby: true,
      label: `Same area (${pretty})`,
      matchedBarangay: pretty,
      matchedDistrict: userLoc.districts[0] || null,
    }
  }

  // 3. Same Zamboanga City district
  for (const dist of userLoc.districts) {
    if (targetLoc.districts.includes(dist)) {
      const distLabel = ZAMBOANGA_DISTRICTS[dist]?.label || 'Nearby district'
      return {
        score: 82,
        tier: 'same_district',
        isNearby: true,
        label: `Nearby in ${distLabel}`,
        matchedBarangay: null,
        matchedDistrict: distLabel,
      }
    }
  }

  // 4. Target explicitly serves city-wide Zamboanga City
  if (targetLoc.isCityWide) {
    return {
      score: 70,
      tier: 'city_wide',
      isNearby: true,
      label: 'Serves Zamboanga City',
      matchedBarangay: null,
      matchedDistrict: null,
    }
  }

  // 5. User only specified Zamboanga City generally
  if (userLoc.isCityWide) {
    const targetBrgy = targetLoc.barangays[0] ? formatBarangayDisplay(targetLoc.barangays[0]) : null
    return {
      score: 72,
      tier: 'city_wide',
      isNearby: true,
      label: targetBrgy ? `${targetBrgy}, Zamboanga City` : 'Within Zamboanga City',
      matchedBarangay: targetBrgy,
      matchedDistrict: null,
    }
  }

  // 6. Adjacent district check
  for (const uDist of userLoc.districts) {
    const adj = ADJACENT_DISTRICTS[uDist] || []
    for (const tDist of targetLoc.districts) {
      if (adj.includes(tDist)) {
        const targetDistLabel = ZAMBOANGA_DISTRICTS[tDist]?.label || 'Zamboanga City'
        return {
          score: 62,
          tier: 'adjacent_district',
          isNearby: false,
          label: `${targetDistLabel} (adjacent area)`,
          matchedBarangay: null,
          matchedDistrict: targetDistLabel,
        }
      }
    }
  }

  const targetBrgy = targetLoc.barangays[0] ? formatBarangayDisplay(targetLoc.barangays[0]) : null
  return {
    score: 45,
    tier: 'other_area',
    isNearby: false,
    label: targetBrgy ? `${targetBrgy} (farther area)` : (targetLoc.raw || 'Other Zamboanga area'),
    matchedBarangay: targetBrgy,
    matchedDistrict: null,
  }
}

function computeConductScore({
  averageRating = null,
  reviewCount = 0,
  completedJobs = 0,
  closedJobs = 0,
  avoidableCancellations = 0,
  totalBookings = 0,
  substantiatedReports = 0,
  yearsOfExperience = 0,
} = {}) {
  const avg = averageRating !== null && averageRating !== undefined ? Number(averageRating) : null
  const reviews = Math.max(0, Number(reviewCount) || 0)
  const completed = Math.max(0, Number(completedJobs) || 0)
  const closed = Math.max(0, Number(closedJobs) || 0)
  const badCancels = Math.max(0, Number(avoidableCancellations) || 0)
  const bookings = Math.max(0, Number(totalBookings) || 0)
  const reports = Math.max(0, Number(substantiatedReports) || 0)
  const exp = Math.max(0, Number(yearsOfExperience) || 0)

  // Bayesian smoothed rating score (prior = 4.0 with weight 2) so 5.0(10) > 5.0(1) > unrated(baseline 68)
  const bayesianRating = avg !== null && reviews > 0
    ? ((avg * reviews) + (4.0 * 2)) / (reviews + 2)
    : 3.7
  const ratingScore = Math.round(Math.min(100, Math.max(0, (bayesianRating / 5) * 100)))

  // Conduct of service score starts at 75 for approved users with clean record
  let conduct = 75
  conduct += Math.min(15, completed * 3 + closed * 2)
  conduct += Math.min(8, Math.floor(exp / 2) * 2)
  if (avg !== null && reviews > 0) {
    if (avg >= 4.5) conduct += 10
    else if (avg >= 4.0) conduct += 5
    else if (avg < 3.0) conduct -= 18
  }
  if (bookings > 0 && badCancels > 0) {
    const cancelRate = badCancels / bookings
    conduct -= Math.min(30, Math.round(cancelRate * 45) + badCancels * 4)
  }
  if (reports > 0) {
    conduct -= Math.min(45, reports * 25)
  }
  const conductScore = Math.round(Math.min(100, Math.max(15, conduct)))
  const cleanConduct = reports === 0 && badCancels === 0 && (avg === null || avg >= 3.5)

  let tierLabel = 'Verified Provider'
  if (reports > 0) {
    tierLabel = 'Under Conduct Review'
  } else if (avg !== null && avg >= 4.5 && reviews >= 1 && cleanConduct) {
    tierLabel = 'Top-Rated & Reliable'
  } else if (avg !== null && avg >= 4.0 && reviews >= 1 && cleanConduct) {
    tierLabel = 'Highly Rated · Good Conduct'
  } else if (completed >= 1 && cleanConduct) {
    tierLabel = 'Proven · Clean Conduct'
  } else if (cleanConduct) {
    tierLabel = 'Clean Conduct · Verified'
  }

  const badges = []
  if (avg !== null && avg >= 4.5 && reviews >= 1) badges.push(`★ ${avg.toFixed(1)} Top Rated`)
  else if (avg !== null && reviews >= 1) badges.push(`★ ${avg.toFixed(1)} (${reviews})`)
  if (cleanConduct) badges.push('Clean Conduct')
  if (closed >= 1) badges.push(`${closed} Closed Job${closed === 1 ? '' : 's'}`)

  return {
    conductScore,
    ratingScore,
    cleanConduct,
    tierLabel,
    badges,
    completedJobs: completed,
    closedJobs: closed,
    avoidableCancellations: badCancels,
    substantiatedReports: reports,
  }
}

function computeKeywordRelevance(queryText, fields = []) {
  const q = normalizeLocationText(queryText)
  if (!q) return 0
  const words = q.split(' ').filter((w) => w.length >= 3)
  if (words.length === 0) return 0
  const haystack = normalizeLocationText(fields.filter(Boolean).join(' '))
  let hits = 0
  for (const w of words) {
    if (haystack.includes(w)) hits += 1
  }
  return Math.round((hits / words.length) * 100)
}

function scoreServiceForClient({ service, clientLocation, queryText = '', sortBy = 'smart_ai' }) {
  const proximity = computeLocationProximity(clientLocation, service.service_area || service.gardener_service_area)
  const conduct = computeConductScore({
    averageRating: service.average_rating,
    reviewCount: service.review_count,
    completedJobs: service.completed_jobs,
    closedJobs: service.closed_jobs,
    avoidableCancellations: service.avoidable_cancellations,
    totalBookings: service.total_bookings,
    substantiatedReports: service.substantiated_reports,
    yearsOfExperience: service.years_of_experience,
  })
  const keywordScore = computeKeywordRelevance(queryText, [
    service.title,
    service.description,
    service.category_name,
    service.business_name,
    service.service_area,
  ])

  let matchScore
  if (sortBy === 'nearby') {
    matchScore = Math.round(proximity.score * 0.65 + conduct.conductScore * 0.2 + conduct.ratingScore * 0.15)
  } else if (sortBy === 'top_rated') {
    matchScore = Math.round(conduct.ratingScore * 0.6 + conduct.conductScore * 0.25 + proximity.score * 0.15)
  } else if (sortBy === 'best_conduct') {
    matchScore = Math.round(conduct.conductScore * 0.6 + conduct.ratingScore * 0.25 + proximity.score * 0.15)
  } else {
    const base = proximity.score * 0.35 + conduct.ratingScore * 0.35 + conduct.conductScore * 0.30
    matchScore = queryText.trim()
      ? Math.round(base * 0.8 + keywordScore * 0.2)
      : Math.round(base)
  }

  const reasons = []
  reasons.push(proximity.label)
  if (service.average_rating != null && Number(service.review_count) > 0) {
    reasons.push(`${Number(service.average_rating).toFixed(1)}★ from ${service.review_count} verified review${Number(service.review_count) === 1 ? '' : 's'}`)
  }
  if (conduct.cleanConduct) {
    reasons.push(conduct.closedJobs > 0
      ? `Clean service conduct (${conduct.closedJobs} completed & closed)`
      : 'Clean conduct record (0 reports)')
  }
  if (Number(service.years_of_experience) >= 2) {
    reasons.push(`${service.years_of_experience} yrs experience`)
  }
  if (keywordScore >= 50) {
    reasons.push('Matches your search preference')
  }

  return {
    ...service,
    ai_match: {
      matchScore: Math.min(99, Math.max(20, matchScore)),
      proximity,
      conduct,
      keywordScore,
      reasons: reasons.slice(0, 4),
    },
  }
}

function scoreOfferForClient({ offer, inquiryLocation, estimatedMin = null, estimatedMax = null, sortBy = 'smart_ai' }) {
  const proximity = computeLocationProximity(inquiryLocation, offer.gardener_service_area)
  const conduct = computeConductScore({
    averageRating: offer.average_rating,
    reviewCount: offer.review_count,
    completedJobs: offer.completed_jobs,
    closedJobs: offer.closed_jobs,
    avoidableCancellations: offer.avoidable_cancellations,
    totalBookings: offer.total_bookings,
    substantiatedReports: offer.substantiated_reports,
    yearsOfExperience: offer.years_of_experience,
  })

  let priceScore = 70
  let priceLabel = null
  const amount = offer.amount !== null && offer.amount !== undefined && offer.amount !== '' ? Number(offer.amount) : null
  const estMin = estimatedMin !== null && estimatedMin !== undefined ? Number(estimatedMin) : null
  const estMax = estimatedMax !== null && estimatedMax !== undefined ? Number(estimatedMax) : null
  if (amount !== null && estMin && estMax && estMax >= estMin) {
    if (amount >= estMin && amount <= estMax) {
      priceScore = 95
      priceLabel = 'Within indicative budget range'
    } else if (amount < estMin) {
      priceScore = 88
      priceLabel = 'Below indicative estimate'
    } else if (amount <= estMax * 1.15) {
      priceScore = 72
      priceLabel = 'Slightly above estimate'
    } else {
      priceScore = 52
      priceLabel = 'Above indicative estimate'
    }
  }

  let matchScore
  if (sortBy === 'nearby') {
    matchScore = Math.round(proximity.score * 0.6 + conduct.conductScore * 0.25 + conduct.ratingScore * 0.15)
  } else if (sortBy === 'top_rated') {
    matchScore = Math.round(conduct.ratingScore * 0.55 + conduct.conductScore * 0.30 + proximity.score * 0.15)
  } else if (sortBy === 'best_conduct') {
    matchScore = Math.round(conduct.conductScore * 0.55 + conduct.ratingScore * 0.25 + proximity.score * 0.20)
  } else if (sortBy === 'lowest_price') {
    matchScore = Math.round(priceScore * 0.55 + conduct.conductScore * 0.25 + proximity.score * 0.20)
  } else {
    matchScore = Math.round(proximity.score * 0.30 + conduct.ratingScore * 0.30 + conduct.conductScore * 0.25 + priceScore * 0.15)
  }

  const reasons = [proximity.label]
  if (offer.average_rating != null && Number(offer.review_count) > 0) {
    reasons.push(`${Number(offer.average_rating).toFixed(1)}★ rating (${offer.review_count} review${Number(offer.review_count) === 1 ? '' : 's'})`)
  }
  if (conduct.cleanConduct) {
    reasons.push(conduct.closedJobs > 0 ? `Good conduct (${conduct.closedJobs} closed jobs)` : 'Clean conduct record')
  }
  if (priceLabel) reasons.push(priceLabel)

  return {
    ...offer,
    ai_match: {
      matchScore: Math.min(99, Math.max(20, matchScore)),
      proximity,
      conduct,
      priceScore,
      priceLabel,
      reasons: reasons.slice(0, 4),
    },
  }
}

function scoreOpenLeadForGardener({ lead, gardenerArea, gardenerCategoryIds = [], queryText = '', sortBy = 'smart_ai' }) {
  const proximity = computeLocationProximity(gardenerArea, lead.location)
  const categoryMatch = Boolean(lead.category_id && gardenerCategoryIds.includes(Number(lead.category_id)))
  const offerCount = Math.max(0, Number(lead.offer_count) || 0)
  const competitionScore = offerCount === 0 ? 100 : offerCount === 1 ? 82 : offerCount === 2 ? 68 : 50
  const clientCleanConduct = Number(lead.client_substantiated_reports || 0) === 0
  const clientClosedJobs = Math.max(0, Number(lead.client_closed_jobs) || 0)
  const clientConductScore = clientCleanConduct
    ? Math.min(100, 80 + clientClosedJobs * 5)
    : 35
  const keywordScore = computeKeywordRelevance(queryText, [
    lead.subject,
    lead.description,
    lead.ai_summary,
    lead.category_name,
    lead.location,
  ])

  let matchScore
  if (sortBy === 'nearby') {
    matchScore = Math.round(proximity.score * 0.65 + (categoryMatch ? 20 : 10) + competitionScore * 0.15)
  } else if (sortBy === 'category_match') {
    matchScore = Math.round((categoryMatch ? 95 : 45) * 0.55 + proximity.score * 0.30 + competitionScore * 0.15)
  } else if (sortBy === 'low_competition') {
    matchScore = Math.round(competitionScore * 0.55 + proximity.score * 0.30 + (categoryMatch ? 15 : 5))
  } else {
    const base = proximity.score * 0.40 + (categoryMatch ? 95 : 55) * 0.25 + competitionScore * 0.20 + clientConductScore * 0.15
    matchScore = queryText.trim()
      ? Math.round(base * 0.8 + keywordScore * 0.2)
      : Math.round(base)
  }

  const reasons = [proximity.label]
  if (categoryMatch) reasons.push(`Matches your ${lead.category_name || 'service'} listing`)
  if (offerCount === 0) reasons.push('No competing offers yet — be first!')
  else reasons.push(`${offerCount} competing offer${offerCount === 1 ? '' : 's'}`)
  if (clientCleanConduct && clientClosedJobs > 0) {
    reasons.push(`Verified repeat client (${clientClosedJobs} closed booking${clientClosedJobs === 1 ? '' : 's'})`)
  } else if (clientCleanConduct) {
    reasons.push('Clean client record')
  }

  return {
    ...lead,
    ai_match: {
      matchScore: Math.min(99, Math.max(20, matchScore)),
      proximity,
      categoryMatch,
      competitionScore,
      clientCleanConduct,
      clientConductLabel: clientCleanConduct
        ? (clientClosedJobs > 0 ? `Repeat Client (${clientClosedJobs} closed)` : 'Clean Client Record')
        : 'Flagged Account',
      reasons: reasons.slice(0, 4),
    },
  }
}

module.exports = {
  ZAMBOANGA_DISTRICTS,
  computeConductScore,
  computeLocationProximity,
  extractLocationInfo,
  scoreOfferForClient,
  scoreOpenLeadForGardener,
  scoreServiceForClient,
}
