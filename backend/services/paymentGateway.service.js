const crypto = require('crypto')

const PAYMONGO_API_BASE = 'https://api.paymongo.com/v1'

const ONLINE_PAYMENT_METHODS = new Set(['gcash', 'maya', 'grab_pay', 'card'])

const METHOD_TO_PAYMONGO_TYPE = {
  gcash: 'gcash',
  maya: 'paymaya',
  grab_pay: 'grab_pay',
  card: 'card',
}

function getPayMongoSecretKey() {
  const key = typeof process.env.PAYMONGO_SECRET_KEY === 'string'
    ? process.env.PAYMONGO_SECRET_KEY.trim()
    : ''
  return key || null
}

function isSandboxAllowed() {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_SANDBOX_PAYMENTS === 'true'
}

function getGatewayConfig() {
  const secretKey = getPayMongoSecretKey()
  const isPayMongo = Boolean(secretKey)
  const isTestKey = isPayMongo && secretKey.startsWith('sk_test_')
  const sandboxAvailable = !isPayMongo && isSandboxAllowed()
  return {
    provider: isPayMongo ? 'paymongo' : (sandboxAvailable ? 'sandbox_demo' : 'unavailable'),
    mode: isPayMongo ? (isTestKey ? 'paymongo_test' : 'paymongo_live') : (sandboxAvailable ? 'sandbox_demo' : 'unavailable'),
    label: isPayMongo
      ? (isTestKey ? 'PayMongo Checkout (Test Mode)' : 'PayMongo Checkout')
      : (sandboxAvailable ? 'Online Checkout (Sandbox / Demo Mode)' : 'Online Checkout Unavailable'),
    supportedMethods: ['gcash', 'maya', 'grab_pay', 'card'],
    minAmountPhp: 20,
    enabled: isPayMongo || sandboxAvailable,
  }
}

function buildPayMongoAuthHeader(secretKey) {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`
}

async function createCheckoutSession({
  bookingId,
  paymentId,
  transactionCode,
  amountPhp,
  paymentMethod,
  description,
  clientName,
  clientEmail,
}) {
  const secretKey = getPayMongoSecretKey()
  const safeBase = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '')
  const successUrl = `${safeBase}/bookings/${bookingId}?gatewayPaymentId=${paymentId}&gatewayResult=success`
  const cancelUrl = `${safeBase}/bookings/${bookingId}?gatewayPaymentId=${paymentId}&gatewayResult=cancelled`

  if (!secretKey) {
    if (!isSandboxAllowed()) {
      const err = new Error('Online payment gateway is not configured for production. Please use manual proof upload or configure PAYMONGO_SECRET_KEY.')
      err.statusCode = 503
      throw err
    }
    const sessionId = `cs_demo_${crypto.randomBytes(8).toString('hex')}`
    return {
      provider: 'sandbox_demo',
      sessionId,
      checkoutUrl: null,
      demoMode: true,
      successUrl,
      cancelUrl,
    }
  }

  const paymongoMethod = METHOD_TO_PAYMONGO_TYPE[paymentMethod] || 'gcash'
  const amountCentavos = Math.round(Number(amountPhp) * 100)
  const payload = {
    data: {
      attributes: {
        billing: {
          name: clientName || 'HugaTiera Client',
          email: clientEmail || undefined,
        },
        description: description || `HugaTiera Booking #${bookingId} (${transactionCode})`,
        line_items: [
          {
            currency: 'PHP',
            amount: amountCentavos,
            description: description || `Gardening service payment (${transactionCode})`,
            name: `HugaTiera Booking #${bookingId}`,
            quantity: 1,
          },
        ],
        payment_method_types: [paymongoMethod],
        reference_number: transactionCode,
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
    },
  }

  const response = await fetch(`${PAYMONGO_API_BASE}/checkout_sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: buildPayMongoAuthHeader(secretKey),
    },
    body: JSON.stringify(payload),
  })

  const json = await response.json().catch(() => null)
  if (!response.ok || !json?.data?.id) {
    const detail = json?.errors?.[0]?.detail || 'PayMongo checkout session could not be created.'
    const err = new Error(detail)
    err.statusCode = 502
    throw err
  }

  return {
    provider: 'paymongo',
    sessionId: json.data.id,
    checkoutUrl: json.data.attributes?.checkout_url || null,
    demoMode: false,
    successUrl,
    cancelUrl,
  }
}

async function verifyCheckoutSession({ provider, sessionId, demoOutcome = 'paid' }) {
  if (provider === 'sandbox_demo') {
    if (!isSandboxAllowed()) {
      const err = new Error('Sandbox payment confirmation is disabled in production.')
      err.statusCode = 503
      throw err
    }
    const normalized = String(demoOutcome || 'paid').trim().toLowerCase()
    if (normalized === 'paid') {
      const refCode = `DEMO-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
      return {
        paid: true,
        gatewayStatus: 'paid',
        gatewayReference: refCode,
      }
    }
    return {
      paid: false,
      gatewayStatus: normalized === 'failed' ? 'failed' : 'cancelled',
      gatewayReference: null,
    }
  }

  const secretKey = getPayMongoSecretKey()
  if (!secretKey) {
    const err = new Error('PayMongo secret key is not configured on the server.')
    err.statusCode = 503
    throw err
  }

  const response = await fetch(`${PAYMONGO_API_BASE}/checkout_sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: buildPayMongoAuthHeader(secretKey),
    },
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || !json?.data?.attributes) {
    const detail = json?.errors?.[0]?.detail || 'Unable to verify PayMongo checkout session.'
    const err = new Error(detail)
    err.statusCode = 502
    throw err
  }

  const attrs = json.data.attributes
  const paidPayment = Array.isArray(attrs.payments)
    ? attrs.payments.find((p) => p?.attributes?.status === 'paid')
    : null
  const intentSucceeded = attrs.payment_intent?.attributes?.status === 'succeeded'
  const paid = Boolean(paidPayment || intentSucceeded || attrs.status === 'paid')
  const gatewayReference = paidPayment?.id || attrs.payment_intent?.id || sessionId

  return {
    paid,
    gatewayStatus: paid ? 'paid' : (attrs.status === 'expired' ? 'cancelled' : 'awaiting_payment'),
    gatewayReference,
  }
}

module.exports = {
  ONLINE_PAYMENT_METHODS,
  getGatewayConfig,
  createCheckoutSession,
  verifyCheckoutSession,
}
