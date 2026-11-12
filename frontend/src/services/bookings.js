const apiBaseUrl = import.meta.env?.VITE_API_URL || '/api'

export const WORKFLOW_STATUS_LABELS = {
  open: 'Open',
  responded: 'Responded',
  provider_selected: 'Provider Selected',
  in_agreement: 'Agreement in Progress',
  confirmed: 'Confirmed',
  closed: 'Closed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
  proposed: 'Proposed',
  agreed: 'Agreed',
  superseded: 'Superseded',
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
}

export function formatStatusLabel(status) {
  if (status === null || status === undefined) return 'Unknown'
  const raw = String(status).trim()
  if (!raw) return 'Unknown'
  const key = raw.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(WORKFLOW_STATUS_LABELS, key)) {
    return WORKFLOW_STATUS_LABELS[key]
  }
  return raw
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ''))
    .join(' ')
}

export function getStatusBadgeClass(status) {
  const raw = status === null || status === undefined ? '' : String(status).trim().toLowerCase()
  const safeSlug = raw && /^[a-z0-9_]+$/.test(raw) ? raw : 'unknown'
  return `inquiry-status status-${safeSlug}`
}

function formatApprovalState(timestamp) {
  if (!timestamp) {
    return { approved: false, timestamp: null, label: 'Pending / Not recorded' }
  }
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return { approved: false, timestamp: null, label: 'Pending / Not recorded' }
  }
  return {
    approved: true,
    timestamp,
    label: `Approved on ${parsed.toLocaleString()}`,
  }
}

export function buildBookingAgreementSummary(booking, currentUser = null) {
  if (!booking || typeof booking !== 'object') {
    return {
      hasAgreement: false,
      versionLabel: null,
      amountLabel: null,
      scopeOfWork: null,
      conditions: null,
      clientApproval: formatApprovalState(null),
      gardenerApproval: formatApprovalState(null),
      inquiryPath: null,
    }
  }

  const hasValidInquiryId = Number.isInteger(Number(booking.inquiry_id)) && Number(booking.inquiry_id) > 0
  const isAuthorizedForInquiry = Boolean(
    currentUser && (
      currentUser.role === 'administrator'
      || (
        (currentUser.role === 'client' || currentUser.role === 'gardener')
        && (
          (booking.client_id == null && booking.gardener_id == null)
          || Number(currentUser.id) === Number(booking.client_id)
          || Number(currentUser.id) === Number(booking.gardener_id)
        )
      )
    ),
  )
  const inquiryPath = hasValidInquiryId && isAuthorizedForInquiry
    ? `/inquiries/${Number(booking.inquiry_id)}`
    : null

  const scopeOfWork = typeof booking.agreed_scope === 'string' && booking.agreed_scope.trim()
    ? booking.agreed_scope.trim()
    : null
  const conditions = typeof booking.agreed_conditions === 'string' && booking.agreed_conditions.trim()
    ? booking.agreed_conditions.trim()
    : null
  const priceBasis = typeof booking.agreed_price_basis === 'string' && booking.agreed_price_basis.trim()
    ? booking.agreed_price_basis.trim()
    : null
  const hasNumericAmount = booking.agreed_amount !== null
    && booking.agreed_amount !== undefined
    && String(booking.agreed_amount).trim() !== ''
    && Number.isFinite(Number(booking.agreed_amount))

  let amountLabel = null
  if (hasNumericAmount) {
    const formattedAmount = `PHP ${Number(booking.agreed_amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
    amountLabel = priceBasis ? `${formattedAmount} (${priceBasis})` : formattedAmount
  } else if (priceBasis) {
    amountLabel = priceBasis
  }

  const clientApproval = formatApprovalState(booking.client_approved_at)
  const gardenerApproval = formatApprovalState(booking.gardener_approved_at)

  const hasVersion = booking.agreement_version !== null
    && booking.agreement_version !== undefined
    && String(booking.agreement_version).trim() !== ''

  const hasAgreement = Boolean(
    booking.agreement_id != null
    || hasVersion
    || amountLabel
    || scopeOfWork
    || conditions
    || clientApproval.approved
    || gardenerApproval.approved,
  )

  const versionLabel = hasAgreement
    ? (hasVersion ? `Confirmed via Mutual Agreement v${booking.agreement_version}` : 'Mutual Service Agreement')
    : null

  return {
    hasAgreement,
    versionLabel,
    amountLabel,
    scopeOfWork,
    conditions,
    clientApproval,
    gardenerApproval,
    inquiryPath,
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(data?.message || 'The booking request failed.')
  return data
}

export const bookingsApi = {
  list: () => request('/bookings'),
  get: (id) => request(`/bookings/${id}`),
  create: (details) => request('/bookings', { method: 'POST', body: JSON.stringify(details) }),
  status: (id, status) => request(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
}
