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
  reserved: 'Reservation (Unpaid)',
  booked: 'Confirmed Booking (Paid)',
  unpaid: 'Unpaid',
  pending_verification: 'Pending Verification',
  partially_paid: 'Partially Paid',
  fully_paid: 'Fully Paid',
  verified: 'Verified',
  rejected: 'Rejected',
  approved: 'Approved',
  pending_closure: 'Awaiting Closing Agreement',
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
    headers: options.body instanceof FormData
      ? options.headers
      : { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || 'The booking request failed.')
  return data
}

export const PAYMENT_METHOD_LABELS = {
  gcash: 'GCash',
  maya: 'Maya',
  grab_pay: 'GrabPay',
  card: 'Credit / Debit Card',
  bank_transfer: 'Bank Transfer',
  cash: 'Cash (In Person)',
  other: 'Other',
}

export const GATEWAY_PROVIDER_LABELS = {
  paymongo: 'PayMongo Checkout',
  sandbox_demo: 'Online Demo Checkout',
  manual: 'Manual Proof',
}

export const BOOKING_EVENT_REASON_OPTIONS = [
  { value: 'typhoon_weather', label: 'Severe Weather / Typhoon' },
  { value: 'accident_emergency', label: 'Accident / Medical or Family Emergency' },
  { value: 'schedule_conflict', label: 'Schedule Conflict / Unavailability' },
  { value: 'scope_or_plan_change', label: 'Change in Plans / Requirements' },
  { value: 'property_access_issue', label: 'Site / Property Access Issue' },
  { value: 'other', label: 'Other Reason' },
]

export const BOOKING_EVENT_REASON_LABELS = Object.fromEntries(
  BOOKING_EVENT_REASON_OPTIONS.map((opt) => [opt.value, opt.label]),
)

export const bookingsApi = {
  list: () => request('/bookings'),
  get: (id) => request(`/bookings/${id}`),
  create: (details) => request('/bookings', { method: 'POST', body: JSON.stringify(details) }),
  status: (id, status, extra = {}) => request(`/bookings/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...extra }),
  }),
  submitPayment: (bookingId, { paymentType, paymentMethod, amount, referenceNumber, notes, receiptFile }) => {
    const body = new FormData()
    body.append('paymentType', paymentType)
    body.append('paymentMethod', paymentMethod)
    body.append('amount', String(amount))
    if (referenceNumber) body.append('referenceNumber', referenceNumber)
    if (notes) body.append('notes', notes)
    if (receiptFile) body.append('receipt', receiptFile)
    return request(`/bookings/${bookingId}/payments`, { method: 'POST', body })
  },
  verifyPayment: (bookingId, paymentId, payload) => request(`/bookings/${bookingId}/payments/${paymentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  paymentGatewayConfig: () => request('/bookings/payment-gateway/config'),
  createGatewayCheckout: (bookingId, payload) => request(`/bookings/${bookingId}/payments/checkout`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  confirmGatewayPayment: (bookingId, paymentId, payload = {}) => request(`/bookings/${bookingId}/payments/${paymentId}/confirm-gateway`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  confirmTransactionCompletion: (bookingId, payload = {}) => request(`/bookings/${bookingId}/complete-transaction`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  createRescheduleRequest: (bookingId, payload) => request(`/bookings/${bookingId}/reschedule-requests`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  respondRescheduleRequest: (bookingId, requestId, payload) => request(`/bookings/${bookingId}/reschedule-requests/${requestId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  receiptUrl: (bookingId, paymentId) => `${apiBaseUrl}/bookings/${bookingId}/payments/${paymentId}/receipt`,
}
