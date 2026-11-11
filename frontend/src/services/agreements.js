import { apiRequest } from './api'

export const agreementsApi = {
  listByInquiry: (inquiryId) => apiRequest(`/agreements/inquiry/${inquiryId}`),
  get: (agreementId) => apiRequest(`/agreements/${agreementId}`),
  propose: (inquiryId, payload) => apiRequest(`/agreements/inquiry/${inquiryId}`, {
    method: 'POST',
    body: payload,
  }),
  proposeDirectService: (payload) => apiRequest('/agreements/direct-service', {
    method: 'POST',
    body: payload,
  }),
  edit: (agreementId, payload) => apiRequest(`/agreements/${agreementId}`, {
    method: 'PUT',
    body: payload,
  }),
  approve: (agreementId, version) => apiRequest(`/agreements/${agreementId}/approve`, {
    method: 'POST',
    body: { version },
  }),
  cancel: (agreementId) => apiRequest(`/agreements/${agreementId}/cancel`, {
    method: 'POST',
  }),
}
