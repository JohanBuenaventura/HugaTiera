// Structured Zamboanga City billing-style address utilities.
// Synced with backend/utils/smartMatching.js so barangay proximity matching works seamlessly
// without requiring any new database migration.

export const OTHER_BARANGAY_VALUE = '__other__'

export const ZAMBOANGA_BARANGAYS = [
  'Arena Blanco',
  'Ayala',
  'Baliwasan',
  'Baluno',
  'Boalan',
  'Bunguiao',
  'Cabaluay',
  'Cabatangan',
  'Calarian',
  'Camino Nuevo',
  'Campo Islam',
  'Canelar',
  'Capisan',
  'Cawit',
  'Culianan',
  'Curuan',
  'Divisoria',
  'Dulian',
  'Guisao',
  'Guiwan',
  'Kasanyangan',
  'La Paz',
  'Labuan',
  'Lamisahan',
  'Lanzones',
  'Limpapa',
  'Lumayang',
  'Lunzuran',
  'Maasin',
  'Malagutay',
  'Mampang',
  'Manicahan',
  'Mariki',
  'Mercedes',
  'Pampanga',
  'Pamucutan',
  'Panubigan',
  'Pasobolong',
  'Pasonanca',
  'Putik',
  'Quiniput',
  'Recodo',
  'Rio Hondo',
  'Salaan',
  'San Jose Gusu',
  'San Ramon',
  'San Roque',
  'Sangali',
  'Sinunuc',
  'Sta. Barbara',
  'Sta. Catalina',
  'Sta. Maria',
  'Sto. Nino',
  'Talabaan',
  'Talisayan',
  'Talon-Talon',
  'Taluksangay',
  'Tetuan',
  'Tolosa',
  'Tugbungan',
  'Tulungatung',
  'Tumaga',
  'Upper Calarian',
  'Victoria',
  'Vitali',
  'Zambowood',
  'Zone I',
  'Zone II',
  'Zone III',
  'Zone IV',
]

export const DEFAULT_ADDRESS_PARTS = {
  street: '',
  barangay: '',
  customBarangay: '',
  landmark: '',
  city: 'Zamboanga City',
  province: 'Zamboanga del Sur',
  postalCode: '7000',
}

const KNOWN_PROVINCES = [
  'Zamboanga del Sur',
  'Zamboanga del Norte',
  'Zamboanga Sibugay',
  'Zamboanga Peninsula',
  'Basilan',
]

const BARANGAYS_BY_LENGTH = [...ZAMBOANGA_BARANGAYS].sort((a, b) => b.length - a.length)

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function resolveBarangayName(parts = {}) {
  if (parts.barangay === OTHER_BARANGAY_VALUE) {
    return cleanText(parts.customBarangay)
  }
  return cleanText(parts.barangay)
}

export function composeStructuredAddress(parts = {}) {
  const street = cleanText(parts.street)
  const barangay = resolveBarangayName(parts)
  const landmark = cleanText(parts.landmark)
  const province = cleanText(parts.province)
  const postalCode = cleanText(parts.postalCode)

  const segments = []
  if (street) segments.push(street)

  if (barangay) {
    const formattedBarangay = /^(brgy\.?|barangay|zone\b)/i.test(barangay)
      ? barangay
      : `Brgy. ${barangay}`
    segments.push(formattedBarangay)
  }

  if (landmark) {
    segments.push(`(${landmark.replace(/[()]/g, '').trim()})`)
  }

  const regionZip = [province, postalCode].filter(Boolean).join(' ')
  if (regionZip) {
    segments.push(regionZip)
  }

  return segments.join(', ')
}

export function formatAddressPreview(parts = {}) {
  const composed = composeStructuredAddress(parts)
  const city = cleanText(parts.city)
  if (!composed && !city) return ''
  if (!city) return composed

  const street = cleanText(parts.street)
  const barangay = resolveBarangayName(parts)
  const landmark = cleanText(parts.landmark)
  const province = cleanText(parts.province)
  const postalCode = cleanText(parts.postalCode)

  const previewParts = []
  if (street) previewParts.push(street)
  if (barangay) {
    previewParts.push(/^(brgy\.?|barangay|zone\b)/i.test(barangay) ? barangay : `Brgy. ${barangay}`)
  }
  if (landmark) previewParts.push(`(${landmark.replace(/[()]/g, '').trim()})`)
  if (city) previewParts.push(city)
  const regionZip = [province, postalCode].filter(Boolean).join(' ')
  if (regionZip) previewParts.push(regionZip)

  return previewParts.join(', ')
}

export function validateStructuredAddress(parts = {}, { requireFields = true } = {}) {
  const street = cleanText(parts.street)
  const barangay = resolveBarangayName(parts)
  const city = cleanText(parts.city)
  const postalCode = cleanText(parts.postalCode)

  if (requireFields) {
    if (!street) return 'Please enter your house/unit, purok, or street address.'
    if (!barangay) return 'Please select or enter your barangay.'
    if (!city) return 'Please enter your city or municipality.'
  }

  if (postalCode && !/^\d{4}$/.test(postalCode)) {
    return 'ZIP / postal code must be a 4-digit Philippine postal code (e.g., 7000).'
  }

  const composed = composeStructuredAddress(parts)
  if (composed.length > 255) {
    return 'Combined address details are too long (maximum 255 characters). Please shorten the street or landmark.'
  }

  return ''
}

export function parseStructuredAddress(rawAddress = '', rawCity = 'Zamboanga City') {
  const city = cleanText(rawCity) || 'Zamboanga City'
  let working = cleanText(rawAddress)

  if (!working) {
    return {
      ...DEFAULT_ADDRESS_PARTS,
      city,
    }
  }

  let postalCode = '7000'
  const zipMatch = working.match(/(?:,?\s*)(\d{4})\s*$/)
  if (zipMatch) {
    postalCode = zipMatch[1]
    working = working.slice(0, zipMatch.index).replace(/,\s*$/, '').trim()
  }

  let province = 'Zamboanga del Sur'
  for (const candidate of KNOWN_PROVINCES) {
    const regex = new RegExp(`(?:,?\\s*)${escapeRegex(candidate)}\\s*$`, 'i')
    if (regex.test(working)) {
      province = candidate
      working = working.replace(regex, '').replace(/,\s*$/, '').trim()
      break
    }
  }

  let landmark = ''
  const landmarkMatch = working.match(/\(([^()]{2,120})\)/)
  if (landmarkMatch) {
    landmark = cleanText(landmarkMatch[1])
    working = working.replace(landmarkMatch[0], '').replace(/\s*,\s*,+/g, ', ').replace(/^,\s*|,\s*$/g, '').trim()
  }

  let barangay = ''
  let customBarangay = ''

  const explicitBrgyMatch = working.match(/(?:^|,\s*)(?:brgy\.?|barangay)\s+([^,]+)/i)
  if (explicitBrgyMatch) {
    const foundRaw = cleanText(explicitBrgyMatch[1])
    const preset = ZAMBOANGA_BARANGAYS.find((item) => item.toLowerCase() === foundRaw.toLowerCase())
    if (preset) {
      barangay = preset
    } else if (foundRaw) {
      barangay = OTHER_BARANGAY_VALUE
      customBarangay = foundRaw
    }
    working = working.replace(explicitBrgyMatch[0], '').replace(/\s*,\s*,+/g, ', ').replace(/^,\s*|,\s*$/g, '').trim()
  } else {
    for (const candidate of BARANGAYS_BY_LENGTH) {
      const regex = new RegExp(`(?:^|[,\\s])${escapeRegex(candidate)}(?=$|[,\\s])`, 'i')
      if (regex.test(working)) {
        barangay = candidate
        // Only strip when it's a clean trailing segment after a comma so phrases like "Purok 2 Upper Cabatangan" stay readable
        const trailingCommaRegex = new RegExp(`,\\s*${escapeRegex(candidate)}\\s*$`, 'i')
        if (trailingCommaRegex.test(working)) {
          working = working.replace(trailingCommaRegex, '').trim()
        }
        break
      }
    }
  }

  return {
    street: working,
    barangay,
    customBarangay,
    landmark,
    city,
    province,
    postalCode,
  }
}
