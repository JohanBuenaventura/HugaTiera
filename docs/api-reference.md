# HugaTiera — Complete REST API Reference

This document provides the complete technical reference for all **15 REST API route modules** registered in `backend/app.js`.

---

## 1. Global API Conventions

- **Base URL:** `http://localhost:5000/api`
- **Authentication Mechanism:** `HttpOnly`, `SameSite=Lax` JWT cookie named `hugatiera_token` (7-day expiry). Requests from the React frontend use `withCredentials: true`.
- **Account Status Verification (`requireAuth`):** Every protected request verifies that the JWT is valid **and** queries `SELECT id, role, is_active FROM users WHERE id = ?` in MySQL. Deactivated accounts (`is_active = FALSE`) immediately receive `403 Forbidden`.
- **Role-Based Authorization (`requireRole(...roles)`):** Returns `403 Forbidden` (`{ message: 'You do not have permission to access this resource.' }`) if `req.user.role` is not in the allowed list.
- **Standard Error Responses (`backend/app.js`):**
  - `400 Bad Request`: Validation failure, malformed JSON payload, or invalid file upload (`LIMIT_FILE_SIZE` > 5 MB, unsupported MIME type, or corrupt image stream).
  - `401 Unauthorized`: Missing, invalid, or expired `hugatiera_token` cookie.
  - `403 Forbidden`: Insufficient role permissions, unapproved gardener profile, deactivated account, or resource ownership violation.
  - `404 Not Found`: Target entity does not exist.
  - `409 Conflict`: Invalid workflow state transition, stale agreement version, schedule overlap, locked offer, or retired direct booking creation (`MUTUAL_AGREEMENT_REQUIRED`).
  - `429 Too Many Requests`: Per-user AI hourly rate limit reached (`AI_HOURLY_LIMIT`, default `10`/hour).
  - `501 Not Implemented`: Postponed AI image generation (`IMAGE_GENERATION_POSTPONED`).
  - `502 Bad Gateway` / `503 Service Unavailable` / `504 Gateway Timeout`: Upstream Gemini failure or MySQL database unavailability (`DATABASE_UNAVAILABLE`).

---

## 2. Health Module (`/api/health`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/health` | Public | All | Verifies Express server availability and executes `SELECT 1` against MySQL. |

- **Success Response (`200`):** `{ "status": "ok", "database": "connected" }`
- **Error Response (`503`):** `{ "status": "error", "code": "DATABASE_UNAVAILABLE", "message": "...", "requestId": "..." }`

---

## 3. Authentication Module (`/api/auth`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Public (`client`, `gardener` only) | Registers a new client or gardener account, creates the matching role profile row in a transaction, and sets the `hugatiera_token` cookie. |
| `POST` | `/api/auth/login` | Public | All active users | Authenticates email/password and sets the `hugatiera_token` cookie. |
| `POST` | `/api/auth/logout` | Public | All | Clears the `hugatiera_token` cookie. |
| `GET` | `/api/auth/me` | Required | `client`, `gardener`, `administrator` | Returns the currently authenticated user's profile and role. |
| `GET` | `/api/auth/administrator-check` | Required | `administrator` | Verifies administrator role access (`{ "status": "ok" }`). |

- **`POST /api/auth/register` Request Body:**
  ```json
  {
    "firstName": "Maria",
    "lastName": "Santos",
    "email": "maria@example.com",
    "password": "Password123",
    "role": "client",
    "phone": "09171234567"
  }
  ```
  - **Validation & Security:** Rejects `role: "administrator"` with `403`. Rejects duplicate emails with `409`. Hashes password with `bcryptjs` (`10` rounds). Creates `client_profiles` (`city = 'Zamboanga City'`) or `gardener_profiles` (`service_area = 'Zamboanga City'`, `is_approved = FALSE`).

---

## 4. Profiles & Reports Module (`/api/profiles`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/profiles/me` | Required | `client`, `gardener`, `administrator` | Returns the user's account info, role-specific profile fields (`client_profiles` or `gardener_profiles`), and dashboard `counts`. |
| `PUT` | `/api/profiles/me` | Required | `client`, `gardener`, `administrator` | Updates personal details (`firstName`, `lastName`, `phone`) and role-specific profile fields (`address`, `city`, `bio` for clients; `businessName`, `description`, `serviceArea`, `yearsOfExperience` for gardeners). |
| `POST` | `/api/profiles/reports` | Required | `client`, `gardener`, `administrator` | Submits a moderation report against a user, service, or message. |

- **Dashboard Counts Behavior (`GET /api/profiles/me` — `ISS-03`):**
  - For **Clients**: returns `{ inquiries, bookings, unreadNotifications }`.
  - For **Gardeners**: returns `{ activeServices, inquiries, bookings, unreadNotifications }`, where `inquiries` counts both direct inquiries (`i.gardener_id = ?`) **and** Case 1 general requests where the gardener has submitted an offer (`EXISTS (SELECT 1 FROM quotations q WHERE q.inquiry_id = i.id AND q.gardener_id = ?)`).
- **`POST /api/profiles/reports` Request Body:**
  ```json
  {
    "reportedUserId": 16,
    "reportedServiceId": 5,
    "reportedMessageId": null,
    "reason": "Inaccurate service description",
    "details": "Optional supporting context"
  }
  ```
  - Prevents self-reporting (`400`) and validates that referenced targets exist (`404`).

---

## 5. Services & Marketplace Module (`/api/services`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/services/categories` | Public | All | Lists all active service categories (`is_active = TRUE`). |
| `GET` | `/api/services` | Public | All | Searches and paginates public gardening services from active, approved gardeners. |
| `GET` | `/api/services/:serviceId` | Public | All | Returns details of a single public service listing. |
| `GET` | `/api/services/mine` | Required | `gardener` | Lists all services owned by the authenticated gardener (including inactive or pending-approval listings). |
| `POST` | `/api/services` | Required | `gardener` | Creates a new service listing for the authenticated gardener. |
| `PUT` | `/api/services/:serviceId` | Required | `gardener` | Updates an existing service listing owned by the authenticated gardener. |
| `DELETE` | `/api/services/:serviceId` | Required | `gardener` | Soft-deactivates (`is_active = FALSE`) a service owned by the authenticated gardener. |

- **`GET /api/services` Query Parameters:**
  - `keyword` (optional string — matches title, description, business name, or gardener name)
  - `categoryId` (optional positive integer)
  - `serviceArea` (optional string)
  - `sort` (`newest` | `price_low` | `price_high`, default `newest`)
  - `page` (default `1`), `limit` (default `9`, max `24`)
- **Display Name Fallback (`ISS-04`):** All service queries return `gardener_business_name` with automatic SQL fallback to `CONCAT(u.first_name, ' ', u.last_name)` when `gp.business_name` is `NULL` or empty.

---

## 6. Public Gardener Profiles Module (`/api/gardeners`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/gardeners/:gardenerId` | Public | All | Returns an approved, active gardener's public profile, active services, portfolio items (`portfolios`), and rating summary (`average_rating`, `review_count`). |

- Returns `404` if the gardener does not exist, is inactive, or has `is_approved = FALSE`.

---

## 7. Portfolios Module (`/api/portfolios`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/portfolios/:portfolioId/image` | Public | All | Streams the validated portfolio image file with `Content-Type` and `X-Content-Type-Options: nosniff`. |
| `GET` | `/api/portfolios/me` | Required | `gardener` | Lists portfolio items owned by the authenticated gardener. |
| `POST` | `/api/portfolios` | Required | `gardener` | Uploads a new portfolio image (`multipart/form-data`, field `image`, max 5 MB, JPEG/PNG/WebP magic-byte validated) with `title` and `description`. |
| `PUT` | `/api/portfolios/:portfolioId` | Required | `gardener` | Updates `title` and `description` of a portfolio item owned by the gardener. |
| `DELETE` | `/api/portfolios/:portfolioId` | Required | `gardener` | Deletes the portfolio database record and removes its image file from disk. |

---

## 8. Request Images Module (`/api/request-images`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `POST` | `/api/request-images` | Required | `client` | Uploads a garden photo (`multipart/form-data`, field `image`, max 5 MB), validates & strips EXIF/GPS metadata with `sharp`, and stores it under `uploads/request-images/originals/`. |
| `GET` | `/api/request-images/inquiry/:inquiryId` | Required | `client`, `gardener`, `administrator` | Lists all `request_images` attached to an inquiry (subject to inquiry access authorization). |
| `GET` | `/api/request-images/:imageId` | Required | `client`, `gardener`, `administrator` | Streams the sanitized image file (`Cache-Control: private, max-age=3600`) after verifying ownership or inquiry access. |
| `PATCH` | `/api/request-images/:imageId` | Required | `client` | Updates `ai_description` on a photo uploaded by the client (`max 2000` chars). Cannot modify once inquiry is `confirmed`, `closed`, or `cancelled` (`409`). |
| `DELETE` | `/api/request-images/:imageId` | Required | `client` | Deletes an unattached draft photo (`inquiry_id IS NULL`) uploaded by the client and unlinks its file. Rejects attached photos with `409`. |

- **Access Control on `GET /api/request-images/:imageId`:**
  - Unattached draft (`inquiry_id IS NULL`): accessible **only** to `uploaded_by` (the uploading client) or an `administrator`.
  - Attached to a **Case 2 (`direct`)** inquiry: accessible to `inquiry.client_id`, `inquiry.gardener_id` (if approved), or `administrator`.
  - Attached to a **Case 1 (`general`)** inquiry: accessible to `inquiry.client_id`, `administrator`, any approved gardener while the inquiry is open on the board (`open`/`responded`/`provider_selected`/`in_agreement`), the selected `inquiry.gardener_id`, or any gardener who submitted an offer on the inquiry.

---

## 9. Inquiries, Open Requests Board & Quotations Module (`/api/inquiries`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/inquiries` | Required | `client`, `gardener` | Lists inquiries for the authenticated client or gardener (including Case 1 requests where the gardener submitted an offer). Administrators are blocked (`403` — use `/api/admin/activity`). |
| `GET` | `/api/inquiries/open` | Required | `gardener`, `administrator` | Lists non-expired open Case 1 general service requests (`request_type = 'general'`, `status IN ('open', 'responded')`) for approved gardeners (`403` if unapproved). |
| `POST` | `/api/inquiries` | Required | `client` | Creates a Case 1 (`general`) or Case 2 (`direct`) service request and transactionally attaches up to 5 draft `imageIds`. |
| `GET` | `/api/inquiries/:inquiryId` | Required | `client`, `gardener`, `administrator` | Returns inquiry details, attached `images`, `quotations` (filtered by role), `agreements`, `events`, and `booking`. |
| `POST` | `/api/inquiries/:inquiryId/renew` | Required | `client` | Renews an expired or active request by extending `expires_at` (`expiresInDays`: `1`–`90`, default `14`) and restoring `'expired'` status to `'responded'` or `'open'`. |
| `PATCH` | `/api/inquiries/:inquiryId/status` | Required | `client`, `gardener`, `administrator` | Updates inquiry status to `'closed'` (client, assigned gardener, or admin) or `'cancelled'` (client or admin). Blocked once `'in_agreement'` or `'confirmed'` (`409`). |
| `POST` | `/api/inquiries/:inquiryId/quotations` | Required | `gardener` | Submits a provider offer (Case 1) or feasibility response (Case 2). Requires an approved gardener profile (`403`). |
| `PUT` | `/api/inquiries/quotations/:quotationId` | Required | `gardener` | Revises an unaccepted offer (`status = 'sent'`, `locked_at IS NULL`), saving the previous version to `quotation_revisions` and incrementing `revision_number`. |
| `POST` | `/api/inquiries/quotations/:quotationId/withdraw` | Required | `gardener` | Withdraws an unaccepted offer (`status = 'withdrawn'`). |
| `PATCH` | `/api/inquiries/quotations/:quotationId/status` | Required | `client` | Client accepts (`status = 'accepted'`) or declines (`status = 'declined'`) a quotation. Accepting locks the offer (`locked_at = NOW()`), sets `inquiries.status = 'provider_selected'`, and does **not** create a booking (`booking: null`). |
| `GET` | `/api/inquiries/:inquiryId/agreements` | Required | `client`, `gardener`, `administrator` | Alias for `GET /api/agreements/inquiry/:inquiryId`. |
| `POST` | `/api/inquiries/:inquiryId/agreements` | Required | `client`, `gardener` | Alias for `POST /api/agreements/inquiry/:inquiryId`. |

- **Privacy & Isolation Rules on `GET /api/inquiries/:inquiryId`:**
  - On a **Case 1 (`general`)** request, a viewing gardener only receives their **own** quotation(s) in `quotations`, never competing gardeners' offers.
  - The owning client receives all offers enriched with comparison metrics (`gardener_rating`, `gardener_review_count`, `gardener_completed_bookings`, `gardener_experience_years`, `gardener_service_area`, `gardener_bio`, and up to 4 `gardener_portfolios`).

---

## 10. Mutual Agreements Module (`/api/agreements`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `POST` | `/api/agreements/direct-service` | Required | `client` | Creates a Case 2 direct inquiry for an active priced service **and** proposes Version 1 of the mutual agreement in a single transaction (`status = 'in_agreement'`). |
| `GET` | `/api/agreements/inquiry/:inquiryId` | Required | `client`, `gardener`, `administrator` | Returns `activeAgreement` and full `agreements` version history for an inquiry. |
| `POST` | `/api/agreements/inquiry/:inquiryId` | Required | `client`, `gardener` | Proposes Version 1 of a mutual agreement on an inquiry with an accepted offer (or after a cancelled agreement). |
| `POST` | `/api/agreements` | Required | `client`, `gardener` | Proposes Version 1 of a mutual agreement (accepting `inquiryId` in the JSON request body; same handler as `POST /api/agreements/inquiry/:inquiryId`). |
| `GET` | `/api/agreements/:agreementId` | Required | `client`, `gardener`, `administrator` | Returns a single agreement version record. |
| `PUT` | `/api/agreements/:agreementId` | Required | `client`, `gardener` | Edits a `'proposed'` agreement by marking version $N$ `'superseded'`, inserting version $N+1$ linked via `previous_agreement_id`, resetting counterparty approval to `NULL`, and auto-approving for the editor. |
| `POST` | `/api/agreements/:agreementId/approve` | Required | `client`, `gardener` | Records the counterparty's approval on the specified `version`. On the second party's approval, atomically verifies schedule conflict freedom, sets `status = 'agreed'`, creates the confirmed `bookings` record (`status = 'accepted'`), sets `inquiries.status = 'confirmed'`, and declines competing open offers. |
| `POST` | `/api/agreements/:agreementId/cancel` | Required | `client`, `gardener` | Cancels a `'proposed'` agreement and returns the parent inquiry to `'provider_selected'` (if an accepted offer exists) or `'responded'`/`'open'`. |

---

## 11. Bookings Module (`/api/bookings`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/bookings` | Required | `client`, `gardener` | Lists bookings belonging to the authenticated client or gardener, including joined agreement summary fields (`agreement_version`, `agreed_amount`, `agreed_price_basis`, `agreement_status`). Administrators receive `403`. |
| `POST` | `/api/bookings` | Required | All authenticated | **Retired in Step R3:** Always returns `409 Conflict` (`code: 'MUTUAL_AGREEMENT_REQUIRED'`). Bookings are created exclusively via mutual agreement approval. |
| `GET` | `/api/bookings/:bookingId` | Required | `client`, `gardener` | Returns booking details plus full mutual agreement details (`agreement_version`, `agreed_scope_of_work`, `agreed_amount`, `agreed_price_basis`, `agreed_conditions`, `client_approved_at`, `gardener_approved_at`, `agreement_status`). Administrators receive `403`. |
| `PATCH` | `/api/bookings/:bookingId/status` | Required | `client`, `gardener` | Updates booking status (`in_progress` or `completed` by gardener; `cancelled` by client on `pending`/`accepted` bookings; `accepted`/`declined` by gardener on legacy `pending` rows). |

---

## 12. Reviews Module (`/api/reviews`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/reviews/gardeners/:gardenerId` | Public | All | Lists visible reviews (`is_visible = TRUE`) and rating summary (`average_rating`, `review_count`) for a gardener. |
| `GET` | `/api/reviews/bookings/:bookingId` | Required | `client`, `gardener`, `administrator` | Returns the review submitted for a specific booking (or `null` if none). |
| `POST` | `/api/reviews` | Required | `client` | Submits a one-time rating (`1`–`5`) and optional `reviewText` for a `'completed'` booking owned by the client. Duplicate reviews return `409`. |

---

## 13. Conversations & Messages Module (`/api/conversations`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/conversations` | Required | `client`, `gardener`, `administrator` | Lists conversation threads for the authenticated user with `last_message`, `last_message_at`, and `unread_count`. |
| `POST` | `/api/conversations` | Required | `client`, `gardener` | Opens or retrieves an existing conversation thread from `{ inquiryId, gardenerId }` or `{ bookingId }`. On Case 1 general requests, a gardener must hold an active (`sent` or `accepted`) offer (`403` otherwise). |
| `GET` | `/api/conversations/:conversationId/messages` | Required | `client`, `gardener`, `administrator` | Returns chronological messages in a thread and marks incoming unread messages as read (`read_at = CURRENT_TIMESTAMP`). |
| `POST` | `/api/conversations/:conversationId/messages` | Required | `client`, `gardener` | Sends a message (`messageText`, 1–2000 chars) and creates an in-app notification for the recipient. |

---

## 14. Notifications Module (`/api/notifications`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/notifications` | Required | `client`, `gardener`, `administrator` | Returns recent notifications (`limit 50`) and `unreadCount` for the authenticated user. |
| `PATCH` | `/api/notifications/read-all` | Required | `client`, `gardener`, `administrator` | Marks all unread notifications for the user as read. |
| `PATCH` | `/api/notifications/:notificationId/read` | Required | `client`, `gardener`, `administrator` | Marks a single notification owned by the user as read. |

---

## 15. AI Garden Planning Assistant Module (`/api/ai`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/ai/usage` | Required | `client`, `gardener`, `administrator` | Returns the user's rolling 60-minute AI quota status (`limit`, `used`, `remaining`, `windowHours`) and `recentUsage` log entries from `ai_usage_log`. |
| `POST` | `/api/ai/garden-plan` | Required | `client`, `gardener`, `administrator` | Generates a structured tropical garden planning guide from `{ prompt }` (max `3,000` chars). |
| `POST` | `/api/ai/requirements` | Required | `client`, `gardener`, `administrator` | Generates editable JSON requirement suggestions (`structuredSummary`, `refinedDescription`, `suggestedCategoryId`, `suggestedCategoryName`, `gardeningIdeas`, `followUpQuestions`) from `{ prompt, location, requestType, imageIds }`. |
| `POST` | `/api/ai/photo-analysis` | Required | `client`, `gardener`, `administrator` | Analyzes a client's uploaded garden photo (`{ imageId, note }`) using multimodal Gemini (`gemini-3.8-flash` primary, `gemini-3.5-flash-lite` automatic fallback) and stores the description in `request_images.ai_description`. |

---

## 16. Administrator Module (`/api/admin`)

All endpoints in `/api/admin` require `requireAuth` and `requireRole('administrator')` (`403` for non-administrators).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/summary` | Returns platform `counts` (`totalUsers`, `activeServices`, `pendingGardeners`, `openInquiries`, `totalInquiries`, `completedBookings`, `totalBookings`, `openReports`) and the `users` account list. |
| `PATCH` | `/api/admin/users/:userId/status` | Activates or deactivates a user account (`{ isActive: boolean }`). Rejects self-deactivation (`400`). |
| `GET` | `/api/admin/gardeners/pending` | Lists gardener profiles awaiting administrator approval (`is_approved = FALSE`). |
| `PATCH` | `/api/admin/gardeners/:userId/approval` | Approves (`isApproved: true`) or requests changes (`isApproved: false`, optional `feedback`) on a gardener profile and sends an in-app notification. |
| `GET` | `/api/admin/categories` | Lists all service categories (`active` and `inactive`). |
| `POST` | `/api/admin/categories` | Creates a new service category (`{ name, description }`). |
| `PATCH` | `/api/admin/categories/:categoryId` | Updates a category's `name`, `description`, or `isActive` status. |
| `GET` | `/api/admin/services` | Lists all gardener service listings across the platform for moderation. |
| `PATCH` | `/api/admin/services/:serviceId/status` | Activates or deactivates a service listing (`{ isActive: boolean }`). |
| `GET` | `/api/admin/activity` | Returns recent platform-wide `inquiries` (including unassigned Case 1 general requests via `LEFT JOIN` with `'Open General Request'` label) and `bookings`. |
| `GET` | `/api/admin/reports` | Lists user-submitted moderation reports. |
| `PATCH` | `/api/admin/reports/:reportId` | Updates a report's `status` (`open`, `reviewing`, `resolved`, `dismissed`) and `resolutionNotes`. |
