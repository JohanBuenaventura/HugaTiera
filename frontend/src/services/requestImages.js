import { apiRequest } from './api'

export function uploadRequestImage(file, inquiryId = null) {
  const formData = new FormData()
  formData.append('image', file)
  if (inquiryId !== null && inquiryId !== undefined && String(inquiryId).trim() !== '') {
    formData.append('inquiryId', String(inquiryId))
  }
  return apiRequest('/request-images', {
    method: 'POST',
    body: formData,
  })
}

export function fetchInquiryImages(inquiryId) {
  return apiRequest(`/request-images/inquiry/${inquiryId}`)
}

export function deleteRequestImage(imageId) {
  return apiRequest(`/request-images/${imageId}`, {
    method: 'DELETE',
  })
}

export function getRequestImageUrl(imageId) {
  return `/api/request-images/${imageId}`
}
