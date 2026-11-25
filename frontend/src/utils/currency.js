export function formatPHP(amount, { decimals = 0, fallback = '—' } = {}) {
  if (amount === null || amount === undefined || amount === '') return fallback
  const num = Number(amount)
  if (!Number.isFinite(num)) return fallback
  return `₱${num.toLocaleString('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}
