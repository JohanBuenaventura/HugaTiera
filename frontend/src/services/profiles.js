const apiBaseUrl = import.meta.env?.VITE_API_URL || '/api'

export const initialProfile = {
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  city: 'Zamboanga City',
  bio: '',
  businessName: '',
  description: '',
  serviceArea: 'Zamboanga City',
  yearsOfExperience: '',
}

export const FLOATING_MESSAGE_ICON_LABEL = 'Open messages and notifications'

export function shouldShowFloatingMessageIcon(user) {
  return Boolean(user && (user.role === 'client' || user.role === 'gardener'))
}

export function getDashboardNavLinks(role, unreadCounts = {}) {
  if (role === 'administrator') {
    return [
      { to: '/dashboard', label: 'Overview', type: 'route' },
      { href: '#admin-approvals', label: 'Approvals', type: 'anchor' },
      { href: '#admin-activity', label: 'Activity', type: 'anchor' },
      { href: '#admin-reports', label: 'Reports', type: 'anchor' },
      { href: '#admin-accounts', label: 'Accounts', type: 'anchor' },
      { to: '/services', label: 'Marketplace', type: 'route' },
    ]
  }
  return [
    { to: '/dashboard', label: 'Overview', type: 'route' },
    { to: '/inquiries', label: 'Inquiries', badge: unreadCounts.inquiries || 0, type: 'route' },
    { to: '/messages', label: 'Messages', badge: unreadCounts.messages || 0, type: 'route' },
    { to: '/bookings', label: 'Bookings', badge: unreadCounts.bookings || 0, type: 'route' },
    { to: '/dashboard?tab=profile', label: 'Profile', type: 'route' },
  ]
}

export function resolveDashboardTab(tabParam, profileView = false) {
  if (profileView || tabParam === 'profile' || tabParam === 'settings') {
    return 'profile'
  }
  return 'overview'
}

export function buildProfileForm(result, baseForm = initialProfile) {
  const userPart = result?.user || {}
  const profilePart = result?.profile || {}
  return {
    ...baseForm,
    ...userPart,
    ...profilePart,
    firstName: userPart.firstName ?? userPart.first_name ?? baseForm.firstName ?? '',
    lastName: userPart.lastName ?? userPart.last_name ?? baseForm.lastName ?? '',
    phone: userPart.phone ?? baseForm.phone ?? '',
    address: profilePart.address ?? baseForm.address ?? '',
    city: profilePart.city ?? baseForm.city ?? 'Zamboanga City',
    bio: profilePart.bio ?? baseForm.bio ?? '',
    businessName: profilePart.businessName ?? profilePart.business_name ?? baseForm.businessName ?? '',
    description: profilePart.description ?? baseForm.description ?? '',
    serviceArea: profilePart.serviceArea ?? profilePart.service_area ?? baseForm.serviceArea ?? 'Zamboanga City',
    yearsOfExperience: profilePart.yearsOfExperience ?? profilePart.years_of_experience ?? baseForm.yearsOfExperience ?? '',
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'The profile request failed.')
  return data
}

export const profileApi = {
  get: () => request('/profiles/me'),
  update: (profile) => request('/profiles/me', { method: 'PUT', body: JSON.stringify(profile) }),
  adminSummary: () => request('/admin/summary'),
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
  adminServices: () => request('/admin/services'),
  updateServiceStatus: (id, isActive) => request(`/admin/services/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  adminActivity: () => request('/admin/activity'),
  adminReports: () => request('/admin/reports'),
  updateReport: (id, status) => request(`/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  createReport: (details) => request('/profiles/reports', { method: 'POST', body: JSON.stringify(details) }),
}
