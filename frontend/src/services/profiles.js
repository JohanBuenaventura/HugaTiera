const apiBaseUrl = import.meta.env?.VITE_API_URL || '/api'

export const MIN_REGISTRATION_AGE = 18

export const WEEKDAY_OPTIONS = [
  { code: 'mon', short: 'Mon', label: 'Monday' },
  { code: 'tue', short: 'Tue', label: 'Tuesday' },
  { code: 'wed', short: 'Wed', label: 'Wednesday' },
  { code: 'thu', short: 'Thu', label: 'Thursday' },
  { code: 'fri', short: 'Fri', label: 'Friday' },
  { code: 'sat', short: 'Sat', label: 'Saturday' },
  { code: 'sun', short: 'Sun', label: 'Sunday' },
]

const JS_DAY_TO_CODE = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function parseWorkingDaysArray(value) {
  if (Array.isArray(value)) {
    const clean = value.map((d) => String(d).trim().toLowerCase().slice(0, 3)).filter((d) => WEEKDAY_OPTIONS.some((w) => w.code === d))
    return clean.length > 0 ? clean : WEEKDAY_OPTIONS.map((w) => w.code)
  }
  if (typeof value === 'string' && value.trim()) {
    const clean = value.split(',').map((d) => d.trim().toLowerCase().slice(0, 3)).filter((d) => WEEKDAY_OPTIONS.some((w) => w.code === d))
    return clean.length > 0 ? clean : WEEKDAY_OPTIONS.map((w) => w.code)
  }
  return WEEKDAY_OPTIONS.map((w) => w.code)
}

export function formatWorkingDaysLabel(value) {
  const days = parseWorkingDaysArray(value)
  if (days.length === 7) return 'Daily (Mon–Sun)'
  return WEEKDAY_OPTIONS.filter((w) => days.includes(w.code)).map((w) => w.short).join(', ')
}

function parseTimeMinutes(hhmm, fallbackMinutes) {
  const match = /^(\d{2}):(\d{2})/.exec(String(hhmm || ''))
  if (!match) return fallbackMinutes
  return Number(match[1]) * 60 + Number(match[2])
}

function isDateBlocked(dateStr, unavailableDates = []) {
  return unavailableDates.some((block) => dateStr >= block.start_date && dateStr <= block.end_date)
}

export function computeEstimatedEndDateTime({
  scheduledStart,
  workingDaysCount,
  hoursCount,
  workingDays = WEEKDAY_OPTIONS.map((w) => w.code),
  workStartTime = '08:00',
  workEndTime = '17:00',
  unavailableDates = [],
}) {
  if (!scheduledStart) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(scheduledStart)
  if (!match) return ''

  const allowedDays = parseWorkingDaysArray(workingDays)
  const startMin = parseTimeMinutes(workStartTime, 8 * 60)
  const endMin = parseTimeMinutes(workEndTime, 17 * 60)
  const dailyShiftMin = Math.max(60, endMin - startMin)

  let remainingMin
  if (Number(hoursCount) > 0) {
    remainingMin = Math.round(Number(hoursCount) * 60)
  } else if (Number(workingDaysCount) > 0) {
    remainingMin = Math.round(Number(workingDaysCount) * dailyShiftMin)
  } else {
    return ''
  }

  let cursor = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0, 0)
  if (Number.isNaN(cursor.getTime())) return ''

  const formatLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const formatLocalDateTime = (d) => `${formatLocalDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  let guard = 0
  while (remainingMin > 0 && guard < 180) {
    guard += 1
    const dateStr = formatLocalDate(cursor)
    const dayCode = JS_DAY_TO_CODE[cursor.getDay()]
    if (!allowedDays.includes(dayCode) || isDateBlocked(dateStr, unavailableDates)) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, Math.floor(startMin / 60), startMin % 60, 0, 0)
      continue
    }

    const currentMin = cursor.getHours() * 60 + cursor.getMinutes()
    const effectiveStart = Math.max(currentMin, startMin)
    if (effectiveStart >= endMin) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, Math.floor(startMin / 60), startMin % 60, 0, 0)
      continue
    }

    const availableToday = endMin - effectiveStart
    if (remainingMin <= availableToday) {
      const finishMin = effectiveStart + remainingMin
      const endDate = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), Math.floor(finishMin / 60), finishMin % 60, 0, 0)
      return formatLocalDateTime(endDate)
    }

    remainingMin -= availableToday
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, Math.floor(startMin / 60), startMin % 60, 0, 0)
  }
  return ''
}

export const initialProfile = {
  firstName: '',
  middleName: '',
  lastName: '',
  phone: '',
  dateOfBirth: '',
  address: '',
  city: 'Zamboanga City',
  bio: '',
  businessName: '',
  description: '',
  serviceArea: 'Zamboanga City',
  yearsOfExperience: '',
  workingDays: WEEKDAY_OPTIONS.map((w) => w.code),
  workStartTime: '08:00',
  workEndTime: '17:00',
  maxConcurrentJobs: 1,
  availabilityNotes: '',
  unavailableDates: [],
}

export function formatUserFullName({ firstName, middleName, lastName } = {}) {
  return [firstName, middleName, lastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' ')
}

export function calculateAgeFromDob(dobString) {
  if (!dobString || typeof dobString !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dobString.trim())
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(year, month - 1, day)
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
    return null
  }

  const today = new Date()
  let age = today.getFullYear() - year
  const currentMonth = today.getMonth() + 1
  const currentDay = today.getDate()
  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age -= 1
  }
  return age
}

export function getMaxBirthDateForAge(minAge = MIN_REGISTRATION_AGE) {
  const today = new Date()
  const year = today.getFullYear() - minAge
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const FLOATING_MESSAGE_ICON_LABEL = 'Open messages and notifications'

export function shouldShowFloatingMessageIcon(user) {
  return Boolean(user && (user.role === 'client' || user.role === 'gardener'))
}

export function getDashboardNavLinks(role, unreadCounts = {}) {
  if (role === 'administrator') {
    return [
      { to: '/dashboard', label: 'Overview', type: 'route' },
      { to: '/dashboard?tab=analytics', label: 'Analytics', type: 'route' },
      { to: '/dashboard?tab=approvals', href: '#admin-approvals', label: 'Approvals', type: 'route' },
      { to: '/dashboard?tab=pricing', href: '#admin-pricing', label: 'Pricing', type: 'route' },
      { to: '/dashboard?tab=activity', href: '#admin-activity', label: 'Activity', type: 'route' },
      { to: '/dashboard?tab=reports', href: '#admin-reports', label: 'Reports', type: 'route' },
      { to: '/dashboard?tab=accounts', href: '#admin-accounts', label: 'Accounts', type: 'route' },
      { to: '/services', label: 'Marketplace', type: 'route' },
    ]
  }
  if (role === 'clerk') {
    return [
      { to: '/dashboard', label: 'Overview', type: 'route' },
      { to: '/dashboard?tab=schedules', label: 'Schedules', type: 'route' },
      { to: '/dashboard?tab=payments', label: 'Payments', type: 'route' },
      { to: '/dashboard?tab=services', label: 'Services', type: 'route' },
      { to: '/services', label: 'Marketplace', type: 'route' },
    ]
  }
  return [
    { to: '/dashboard', label: 'Overview', type: 'route' },
    ...(role === 'client' ? [{ to: '/services', label: 'Marketplace', type: 'route' }] : []),
    { to: '/inquiries', label: 'Inquiries', badge: unreadCounts.inquiries || 0, type: 'route' },
    { to: '/messages', label: 'Messages', badge: unreadCounts.messages || 0, type: 'route' },
    { to: '/notifications', label: 'Notifications', badge: unreadCounts.notifications || 0, type: 'route' },
    { to: '/bookings', label: 'Bookings', badge: unreadCounts.bookings || 0, type: 'route' },
    { to: '/dashboard?tab=profile', label: 'Profile', type: 'route' },
  ]
}

export function resolveDashboardTab(tabParam, profileView = false) {
  if (profileView || tabParam === 'profile' || tabParam === 'settings') {
    return 'profile'
  }
  if (['services', 'portfolio', 'analytics', 'approvals', 'pricing', 'activity', 'reports', 'accounts', 'schedules', 'payments'].includes(tabParam)) {
    return tabParam
  }
  return 'overview'
}

export function buildProfileForm(result, baseForm = initialProfile) {
  const userPart = result?.user || {}
  const profilePart = result?.profile || {}
  const rawDob = userPart.dateOfBirth ?? userPart.date_of_birth ?? baseForm.dateOfBirth ?? ''
  const normalizedDob = typeof rawDob === 'string' && rawDob.length >= 10 ? rawDob.slice(0, 10) : ''
  return {
    ...baseForm,
    ...userPart,
    ...profilePart,
    firstName: userPart.firstName ?? userPart.first_name ?? baseForm.firstName ?? '',
    middleName: userPart.middleName ?? userPart.middle_name ?? baseForm.middleName ?? '',
    lastName: userPart.lastName ?? userPart.last_name ?? baseForm.lastName ?? '',
    phone: userPart.phone ?? baseForm.phone ?? '',
    dateOfBirth: normalizedDob,
    avatarPath: userPart.avatarPath ?? userPart.avatar_path ?? null,
    address: profilePart.address ?? baseForm.address ?? '',
    city: profilePart.city ?? baseForm.city ?? 'Zamboanga City',
    bio: profilePart.bio ?? baseForm.bio ?? '',
    businessName: profilePart.businessName ?? profilePart.business_name ?? baseForm.businessName ?? '',
    description: profilePart.description ?? baseForm.description ?? '',
    serviceArea: profilePart.serviceArea ?? profilePart.service_area ?? baseForm.serviceArea ?? 'Zamboanga City',
    yearsOfExperience: profilePart.yearsOfExperience ?? profilePart.years_of_experience ?? baseForm.yearsOfExperience ?? '',
    workingDays: parseWorkingDaysArray(profilePart.workingDays ?? profilePart.working_days ?? baseForm.workingDays),
    workStartTime: String(profilePart.workStartTime ?? profilePart.work_start_time ?? baseForm.workStartTime ?? '08:00').slice(0, 5),
    workEndTime: String(profilePart.workEndTime ?? profilePart.work_end_time ?? baseForm.workEndTime ?? '17:00').slice(0, 5),
    maxConcurrentJobs: Number(profilePart.maxConcurrentJobs ?? profilePart.max_concurrent_jobs ?? baseForm.maxConcurrentJobs ?? 1) || 1,
    crewSize: Math.max(
      Number(profilePart.crewSize ?? profilePart.crew_size ?? baseForm.crewSize ?? 1) || 1,
      Number(profilePart.maxConcurrentJobs ?? profilePart.max_concurrent_jobs ?? baseForm.maxConcurrentJobs ?? 1) || 1,
    ),
    availabilityNotes: profilePart.availabilityNotes ?? profilePart.availability_notes ?? baseForm.availabilityNotes ?? '',
    unavailableDates: Array.isArray(profilePart.unavailableDates ?? profilePart.unavailable_dates)
      ? (profilePart.unavailableDates ?? profilePart.unavailable_dates)
      : (baseForm.unavailableDates || []),
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || 'The profile request failed.')
  return data
}

export const profileApi = {
  get: () => request('/profiles/me'),
  update: (profile) => request('/profiles/me', { method: 'PUT', body: JSON.stringify(profile) }),
  listUnavailableDates: () => request('/profiles/me/unavailable-dates'),
  addUnavailableDate: (payload) => request('/profiles/me/unavailable-dates', { method: 'POST', body: JSON.stringify(payload) }),
  deleteUnavailableDate: (blockId) => request(`/profiles/me/unavailable-dates/${blockId}`, { method: 'DELETE' }),
  avatarUrl: (userId) => `${apiBaseUrl}/profiles/${userId}/avatar`,
  uploadAvatar: (file) => {
    const body = new FormData()
    body.append('avatar', file)
    return request('/profiles/me/avatar', { method: 'POST', body })
  },
  deleteAvatar: () => request('/profiles/me/avatar', { method: 'DELETE' }),
  adminSummary: () => request('/admin/summary'),
  adminUpdateUser: (userId, payload) => request(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  adminDeleteUser: (userId) => request(`/admin/users/${userId}`, { method: 'DELETE' }),
  updateUserStatus: (userId, isActive) => request(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  }),
  adminPendingGardeners: () => request('/admin/gardeners/pending'),
  updateGardenerApproval: (userId, isApproved, reason = '') => request(`/admin/gardeners/${userId}/approval`, {
    method: 'PATCH',
    body: JSON.stringify({ isApproved, reason }),
  }),
  adminCategories: () => request('/admin/categories'),
  createCategory: (details) => request('/admin/categories', { method: 'POST', body: JSON.stringify(details) }),
  updateCategory: (id, details) => request(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(details) }),
  adminPricingAddons: () => request('/admin/pricing-addons'),
  createPricingAddon: (details) => request('/admin/pricing-addons', { method: 'POST', body: JSON.stringify(details) }),
  updatePricingAddon: (id, details) => request(`/admin/pricing-addons/${id}`, { method: 'PATCH', body: JSON.stringify(details) }),
  adminServices: () => request('/admin/services'),
  updateServiceStatus: (id, isActive) => request(`/admin/services/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  adminActivity: () => request('/admin/activity'),
  adminReports: () => request('/admin/reports'),
  updateReport: (id, status) => request(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  adminClerkAssignments: () => request('/admin/clerk-assignments'),
  adminCreateClerkAssignment: (payload) => request('/admin/clerk-assignments', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  adminDeleteClerkAssignment: (assignmentId) => request(`/admin/clerk-assignments/${assignmentId}`, {
    method: 'DELETE',
  }),
  createReport: (details) => request('/profiles/reports', { method: 'POST', body: JSON.stringify(details) }),
}
