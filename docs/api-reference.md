# HugaTiera — Complete REST API Reference

This document provides the complete technical reference for all **16 REST API route modules** registered in `backend/app.js` on `main`.

---

## 1. Global API Conventions

- **Base URL:** `http://localhost:5000/api`
- **Authentication Mechanism:** `HttpOnly`, `SameSite=Lax` JWT cookie named `auth_token` (configured via `JWT_EXPIRES_IN`). Requests from the React frontend use `credentials: 'include'`.
- **Rate Limiting & Security Headers:** `/api/auth/register` (40/15 min per IP) and `/api/auth/login` (15/15 min per IP+email) enforce in-memory rate limits (`429`). All responses emit `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.
- **Account Status Verification (`requireAuth`):** Every protected request verifies that the JWT is valid **and** queries `SELECT id, role, is_active FROM users WHERE id = ?` in MySQL. Deactivated accounts (`is_active = FALSE`) immediately receive `403 Forbidden`.
- **Role-Based Authorization (`requireRole(...roles)`):** Returns `403 Forbidden` (`{ message: 'You do not have permission to access this resource.' }`) if `req.user.role` is not in the allowed list.
- **Standard Error Responses (`backend/app.js`):**
  - `400 Bad Request`: Validation failure, malformed JSON payload, or invalid file upload (`LIMIT_FILE_SIZE` > 5 MB, unsupported MIME type, or corrupt image stream).
  - `401 Unauthorized`: Missing, invalid, or expired `auth_token` cookie.
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
| `POST` | `/api/auth/register` | Public | Public (`client`, `gardener`, `both`) | Registers a Client or Gardener account (Gardener automatically includes Client mode) with optional `middleName`, required `dateOfBirth` (18+ validation), required `phone` (10–15 digits), creates matching profile row(s), and sets the session cookie. Blocks `administrator` and `clerk` (`400`). Rate-limited. |
| `POST` | `/api/auth/login` | Public | All active users | Authenticates email/password and sets the session cookie. Rate-limited. |
| `POST` | `/api/auth/logout` | Public | All | Clears the session cookie. |
| `GET` | `/api/auth/me` | Required | `client`, `gardener`, `clerk`, `administrator` | Returns the currently authenticated user's profile, active role, and dual-role flags (`canActAsClient`, `canActAsGardener`, `isDualRole`). |
| `POST` | `/api/auth/switch-role` | Required | Dual-role accounts | Switches active session mode between `'client'` and `'gardener'` and re-issues the JWT cookie. |
| `POST` | `/api/auth/enable-dual-role` | Required | `client`, `gardener` | Enables the secondary Client or Gardener capability on an existing account and ensures both profile rows exist. |
| `GET` | `/api/auth/administrator-check` | Required | `administrator` | Verifies administrator role access (`{ "status": "ok" }`). |

- **`POST /api/auth/register` Request Body:**
  ```json
  {
    "firstName": "Maria",
    "middleName": "Cruz",
    "lastName": "Santos",
    "dateOfBirth": "1998-05-14",
    "phone": "09171234567",
    "address": "Tetuan",
    "city": "Zamboanga City",
    "email": "maria@example.com",
    "password": "Password123",
    "role": "client"
  }
  ```
  - **Validation & Security:** Rejects `role: "administrator"` and `role: "clerk"` with `400` (Clerk accounts are created by a service provider under `POST /api/profiles/me/clerks` or by an Administrator). Rejects underage registrants (`< 18` years old) and invalid mobile numbers (`< 10` or `> 15` digits) with `400`. Rejects duplicate emails with `409`. Hashes password with `bcryptjs`. Registering as `'gardener'` (or `'both'`) enables `can_act_as_client = TRUE` and `can_act_as_gardener = TRUE` and creates both `client_profiles` and `gardener_profiles` rows.

---

## 4. Profiles, Avatars, Availability, My Clerks & Reports Module (`/api/profiles`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/profiles/:userId/avatar` | Public | All | Streams a user's `sharp`-sanitized profile picture (`users.avatar_path`). |
| `GET` | `/api/profiles/me` | Required | All authenticated | Returns account info (including `middleName`, `dateOfBirth`, computed `age`, `avatarPath`, dual-role flags), role profile fields (including gardener working days, hours, `max_concurrent_jobs`, `crew_size`), and dashboard `counts`. |
| `PUT` | `/api/profiles/me` | Required | All authenticated | Updates personal info, birthday (18+), phone, and role-specific profile/schedule/crew fields. |
| `POST` | `/api/profiles/me/avatar` | Required | All authenticated | Uploads/replaces the user's profile picture (`multipart/form-data`, field `avatar`, max 5 MB, `sharp` EXIF-stripped). |
| `DELETE` | `/api/profiles/me/avatar` | Required | All authenticated | Deletes the user's profile picture file and clears `users.avatar_path`. |
| `GET` | `/api/profiles/me/unavailable-dates` | Required | `gardener` | Lists the gardener's blocked/unavailable date ranges (`gardener_unavailable_dates`). |
| `POST` | `/api/profiles/me/unavailable-dates` | Required | `gardener` | Adds an unavailable/blocked date range (`{ startDate, endDate, reason }`). |
| `DELETE` | `/api/profiles/me/unavailable-dates/:blockId` | Required | `gardener` | Removes a blocked date range owned by the gardener. |
| `GET` | `/api/profiles/me/clerks` | Required | `gardener` | Lists clerks assigned to the authenticated gardener (`clerk_gardener_assignments`). |
| `POST` | `/api/profiles/me/clerks` | Required | `gardener` | Creates a new Clerk account and links them to the gardener in a transaction. |
| `POST` | `/api/profiles/me/clerks/assign` | Required | `gardener` | Links an existing Clerk account by email to the gardener. |
| `DELETE` | `/api/profiles/me/clerks/:assignmentId` | Required | `gardener` | Revokes a clerk assignment from the gardener. |
| `POST` | `/api/profiles/reports` | Required | All authenticated | Submits a moderation report against a user, service, or message. |

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
| `GET` | `/api/services/categories` | Public | All | Lists all active service categories (`is_active = TRUE`) including per-sq.m baseline rates (`rate_per_sqm_min`, `rate_per_sqm_max`, `min_base_fee`). |
| `GET` | `/api/services/pricing-addons` | Public | All | Lists active configurable plant, material, equipment, and disposal pricing add-ons (`pricing_addons`). |
| `GET` | `/api/services` | Public | All | Searches and paginates public gardening services from active, approved gardeners (includes `image_path`, `first_portfolio_id`, `workers_required`, and `gardener_avatar_path`). |
| `GET` | `/api/services/:serviceId/image` | Public | All | Streams the service's cover/business design photo (`services.image_path`). |
| `GET` | `/api/services/:serviceId` | Public | All | Returns details of a single public service listing. |
| `GET` | `/api/services/mine` | Required | `gardener` | Lists all services owned by the authenticated gardener (including inactive or pending-approval listings). |
| `POST` | `/api/services` | Required | `gardener` | Creates a new service listing (including `workersRequired`) for the authenticated gardener. |
| `PUT` | `/api/services/:serviceId` | Required | `gardener` | Updates an existing service listing owned by the authenticated gardener. |
| `POST` | `/api/services/:serviceId/image` | Required | `gardener` | Uploads/replaces a service cover/design photo (`multipart/form-data`, field `image`, max 5 MB, `sharp` EXIF-stripped). |
| `DELETE` | `/api/services/:serviceId/image` | Required | `gardener` | Removes a service cover photo and clears `services.image_path`. |
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
| `GET` | `/api/gardeners/:gardenerId` | Public | All | Returns an approved, active gardener's public profile (including avatar, schedule, crew size), active services, portfolio items (`portfolios`), and rating summary (`average_rating`, `review_count`). |
| `GET` | `/api/gardeners/:gardenerId/availability` | Public | All | Returns the gardener's working days/hours, `crew_size`, `max_concurrent_jobs`, upcoming blocked dates, and computed fully-booked dates. |
| `POST` | `/api/gardeners/:gardenerId/availability/check` | Public | All | Validates a proposed `{ scheduledStart, scheduledEnd, serviceId }` window against working days, blocked dates, simultaneous job cap, and daily worker crew capacity. |

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
| `GET` | `/api/inquiries` | Required | `client`, `gardener` | Lists inquiries for the authenticated client or gardener (including `first_image_id` thumbnail reference and Case 1 requests where the gardener submitted an offer). Administrators are blocked (`403` — use `/api/admin/activity`). |
| `GET` | `/api/inquiries/open` | Required | `gardener`, `administrator` | Lists non-expired open Case 1 general service requests (`request_type = 'general'`, `status IN ('open', 'responded')`) for approved gardeners (`403` if unapproved). |
| `POST` | `/api/inquiries/estimate` | Required | `client`, `gardener`, `administrator` | Computes an itemized per-sq.m price estimate (`estimatedLaborMin/Max`, `estimatedMaterialsMin/Max`, `estimatedMin/MaxAmount`, duration estimate) from category, `areaSqm`, `workComplexity`, `materialsOption`, and selected `addonItems`. |
| `POST` | `/api/inquiries` | Required | `client` | Creates a Case 1 (`general`) or Case 2 (`direct`) service request with optional price predictor inputs, `priceComment`, `categorySpecs` JSON, itemized `addonItems`, and up to 5 draft `imageIds`. |
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

## 11. Bookings, Payments, Gateway Checkout, Reschedules & Closure Module (`/api/bookings`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/bookings/payment-gateway/config` | Required | `client`, `gardener`, `clerk`, `administrator` | Returns active payment gateway configuration (`paymongo` vs built-in `sandbox_demo` mode and supported methods). |
| `GET` | `/api/bookings` | Required | `client`, `gardener` | Lists bookings belonging to the authenticated client or gardener, including `first_image_id`, agreement summary, `booking_stage` (`reserved` \| `booked`), `payment_status`, `transaction_status`, and computed `schedule_urgency` fields. Administrators receive `403`. |
| `POST` | `/api/bookings` | Required | All authenticated | **Retired in Step R3:** Always returns `409 Conflict` (`code: 'MUTUAL_AGREEMENT_REQUIRED'`). Bookings are created exclusively via mutual agreement approval. |
| `GET` | `/api/bookings/:bookingId` | Required | `client`, `gardener` | Returns full booking details, Mutual Agreement Summary, `payments` (`booking_payments` with `TXN-...` codes), `rescheduleRequests` (`booking_reschedule_requests`), and completion closure status. |
| `PATCH` | `/api/bookings/:bookingId/status` | Required | `client`, `gardener` | Updates booking status (`in_progress` / `completed` by gardener on paid bookings; event-based `cancelled` with `cancellationReasonType` and `cancellationReason` by client or gardener). |
| `POST` | `/api/bookings/:bookingId/complete-transaction` | Required | `client`, `gardener` | Records client or gardener sign-off on the **Transaction Completion Agreement** (requires `status = 'completed'` and `payment_status = 'fully_paid'`). Once both sign off, sets `transaction_status = 'closed'` and unlocks client review submission. |
| `POST` | `/api/bookings/:bookingId/reschedule-requests` | Required | `client`, `gardener` | Submits an event-based reschedule request (`reasonType`, `reasonDetails`, `proposedStart`, `proposedEnd`). |
| `PATCH` | `/api/bookings/:bookingId/reschedule-requests/:requestId` | Required | `client`, `gardener` | Counterparty approves (`approved` — re-validates schedule/crew capacity and updates booking dates), declines, or requester cancels a reschedule request. |
| `POST` | `/api/bookings/:bookingId/payments/checkout` | Required | `client` | Creates a PayMongo Checkout session (or built-in Sandbox/Demo session) for partial deposit, full payment, or remaining balance and stores a `booking_payments` record with unique `TXN-...` code. |
| `POST` | `/api/bookings/:bookingId/payments/:paymentId/confirm-gateway` | Required | `client` | Verifies the PayMongo or Sandbox/Demo checkout session, marks payment verified, updates `amount_paid` / `payment_status`, and upgrades `'reserved'` to `'booked'` when deposit threshold is met. |
| `POST` | `/api/bookings/:bookingId/payments` | Required | `client` | Submits manual/offline payment proof (`multipart/form-data`, optional `receipt` image `sharp`-sanitized) with `paymentType`, `paymentMethod`, `amount`, and `referenceNumber`. |
| `PATCH` | `/api/bookings/:bookingId/payments/:paymentId` | Required | `gardener` | Approves (`verified`) or rejects (`rejected`, with `rejectionReason`) a client's manual payment proof and updates `booking_stage` / `payment_status`. |
| `GET` | `/api/bookings/:bookingId/payments/:paymentId/receipt` | Required | `client`, `gardener`, `clerk`, `administrator` | Streams an uploaded payment receipt image after verifying authorization. |

---

## 12. Reviews Module (`/api/reviews`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/reviews/recent` | Public | All | Returns recent visible verified reviews across the platform for the Client Discovery dashboard showcase. |
| `GET` | `/api/reviews/gardeners/:gardenerId` | Public | All | Lists visible reviews (`is_visible = TRUE`) and rating summary (`average_rating`, `review_count`) for a gardener. |
| `GET` | `/api/reviews/bookings/:bookingId` | Required | `client`, `gardener`, `administrator` | Returns the review submitted for a specific booking (or `null` if none). |
| `POST` | `/api/reviews` | Required | `client` | Submits a one-time rating (`1`–`5`) and optional `reviewText`. Strictly gated: booking must be `status = 'completed'`, `payment_status = 'fully_paid'`, and `transaction_status = 'closed'`. Duplicate reviews return `409`. |

---

## 13. Conversations & Messages Module (`/api/conversations`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/conversations` | Required | `client`, `gardener`, `administrator` | Lists conversation threads for the authenticated user with `other_party_id`, `other_party_role`, `other_party_name`, inquiry/service context (`inquiry_subject`, `inquiry_status`, `inquiry_location`, `service_title`), latest linked booking context (`booking_id`, `booking_status`, `booking_stage`, `booking_scheduled_start`), `latest_message`, `latest_message_at`, `latest_sender_id`, and `unread_count`. |
| `POST` | `/api/conversations` | Required | `client`, `gardener` | Opens or retrieves an existing conversation thread from `{ inquiryId, gardenerId }` or `{ bookingId }`. On Case 1 general requests, a gardener must hold an active (`sent` or `accepted`) offer (`403` otherwise). |
| `GET` | `/api/conversations/:conversationId/messages` | Required | `client`, `gardener`, `administrator` | Returns chronological messages in a thread and marks incoming unread messages as read (`read_at = CURRENT_TIMESTAMP`). |
| `POST` | `/api/conversations/:conversationId/messages` | Required | `client`, `gardener` | Sends a message (`messageText`, 1–2000 chars) and creates an in-app notification for the recipient. |

---

## 14. Notifications Module (`/api/notifications`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/notifications` | Required | `client`, `gardener`, `clerk`, `administrator` | Returns recent notifications (`limit 50`) and `unreadCount` for the authenticated user. |
| `PATCH` | `/api/notifications/read-all` | Required | `client`, `gardener`, `clerk`, `administrator` | Marks all unread notifications for the user as read. |
| `PATCH` | `/api/notifications/:notificationId/read` | Required | `client`, `gardener`, `clerk`, `administrator` | Marks a single notification owned by the user as read. |

---

## 15. AI Garden Planning & Smart Matching Module (`/api/ai`)

| Method | Path | Auth | Allowed Roles | Purpose |
|---|---|---|---|---|
| `GET` | `/api/ai/usage` | Required | `client`, `gardener`, `administrator` | Returns the user's rolling 60-minute AI quota status (`limit`, `used`, `remaining`, `windowHours`) and `recentUsage` log entries from `ai_usage_log`. |
| `GET` | `/api/ai/recommendations` | Required | `client`, `gardener`, `administrator` | Ranks nearby services (`mode=services`) or open leads (`mode=leads`) using hybrid Zamboanga City barangay proximity, verified review scores, and clean conduct metrics (`smartMatching.js`). Supports `area`, `categoryId` (positive integer category filter), `keyword`, `sortBy`, `nearbyOnly`, `highRatingOnly`, and `cleanConductOnly`. |
| `POST` | `/api/ai/recommendations/summary` | Required | `client`, `gardener`, `administrator` | Generates an optional Gemini-powered advisory summary explaining top recommended services or leads. |
| `POST` | `/api/ai/garden-plan` | Required | `client`, `gardener`, `administrator` | Generates a concise Zamboanga City tropical garden planning guide from `{ prompt }` (max `3,000` chars) with strict gardening-only `systemInstruction` domain guardrails. |
| `POST` | `/api/ai/garden-plan/stream` | Required | `client`, `gardener`, `administrator` | Streams a garden planning guide over Server-Sent Events (`text/event-stream`: `chunk`, `done`, `error` events) with strict gardening-only `systemInstruction` guardrails, model-aware thinking levels, automatic fallback, and DB-backed `ai_usage_log` quota enforcement. |
| `POST` | `/api/ai/requirements` | Required | `client`, `gardener`, `administrator` | Generates editable JSON requirement suggestions (`structuredSummary`, `refinedDescription`, `suggestedCategoryId`, `suggestedCategoryName`, `gardeningIdeas`, `followUpQuestions`) from `{ prompt, location, requestType, imageIds }`. |
| `POST` | `/api/ai/photo-analysis` | Required | `client`, `gardener`, `administrator` | Analyzes a client's uploaded garden photo (`{ imageId, note }`) using multimodal Gemini (`gemini-3.8-flash` primary, `gemini-3.5-flash-lite` automatic fallback) and stores the description in `request_images.ai_description`. |

---

## 16. Assigned Clerk Operations Module (`/api/clerk`)

All endpoints in `/api/clerk` require `requireAuth` and `requireRole('clerk')` and strictly verify that `:gardenerId` is linked to the clerk in `clerk_gardener_assignments`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/clerk/workspace` | Returns all gardeners assigned to the clerk, their schedules, unavailable dates, services, bookings, and pending payment proofs. |
| `PUT` | `/api/clerk/gardeners/:gardenerId/schedule` | Updates an assigned gardener's working days, working hours, `maxConcurrentJobs`, `crewSize`, and `availabilityNotes`. |
| `POST` | `/api/clerk/gardeners/:gardenerId/unavailable-dates` | Adds a blocked/unavailable date range for an assigned gardener. |
| `DELETE` | `/api/clerk/gardeners/:gardenerId/unavailable-dates/:blockId` | Removes a blocked date range for an assigned gardener. |
| `POST` | `/api/clerk/gardeners/:gardenerId/services` | Creates a service listing on behalf of an assigned gardener. |
| `PATCH` | `/api/clerk/gardeners/:gardenerId/services/:serviceId/status` | Activates or deactivates an assigned gardener's service listing. |
| `PATCH` | `/api/clerk/gardeners/:gardenerId/bookings/:bookingId/payments/:paymentId` | Verifies or rejects a manual payment proof on an assigned gardener's booking. |

---

## 17. Administrator Module (`/api/admin`)

All endpoints in `/api/admin` require `requireAuth` and `requireRole('administrator')` (`403` for non-administrators).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/summary` | Returns platform `counts` and the `users` account list (including `phone`, `avatar_path`, `middle_name`, `date_of_birth`, dual-role flags). |
| `PATCH` | `/api/admin/users/:userId` | Edits a user's `firstName`, `middleName`, `lastName`, `phone`, `dateOfBirth`, `role` (`client` \| `gardener` \| `clerk` \| `administrator`), dual-role flags, and `isActive` inside a transaction (blocks self-demotion/self-deactivation). |
| `PATCH` | `/api/admin/users/:userId/status` | Activates or deactivates a user account (`{ isActive: boolean }`). Rejects self-deactivation (`400`). |
| `DELETE` | `/api/admin/users/:userId` | Deletes an unreferenced user account (`204`) + cleans up avatar; blocks self-deletion (`400`) and returns `409 Conflict` when referenced by inquiries/bookings (`ON DELETE RESTRICT`). |
| `GET` | `/api/admin/clerk-assignments` | Lists all `clerk_gardener_assignments` along with available clerks and gardeners. |
| `POST` | `/api/admin/clerk-assignments` | Assigns a clerk to manage a gardener (`{ clerkId, gardenerId, notes }`). |
| `DELETE` | `/api/admin/clerk-assignments/:assignmentId` | Removes a clerk-to-gardener assignment. |
| `GET` | `/api/admin/gardeners/pending` | Lists gardener profiles awaiting administrator approval (`is_approved = FALSE`). |
| `PATCH` | `/api/admin/gardeners/:userId/approval` | Approves (`isApproved: true`) or requests changes (`isApproved: false`, optional `feedback`) on a gardener profile and sends an in-app notification. |
| `GET` | `/api/admin/categories` | Lists all service categories (`active` and `inactive`) with per-sq.m baseline rates. |
| `POST` | `/api/admin/categories` | Creates a new service category (`{ name, description, ratePerSqmMin, ratePerSqmMax, minBaseFee }`). |
| `PATCH` | `/api/admin/categories/:categoryId` | Updates a category's name, description, baseline sq.m rates, or `isActive` status. |
| `GET` | `/api/admin/pricing-addons` | Lists all `pricing_addons` items (`plant`, `material`, `equipment`, `disposal`). |
| `POST` | `/api/admin/pricing-addons` | Creates a configurable pricing add-on item. |
| `PATCH` | `/api/admin/pricing-addons/:addonId` | Updates a pricing add-on's rates, unit, type, description, or active status. |
| `GET` | `/api/admin/services` | Lists all gardener service listings across the platform for moderation. |
| `PATCH` | `/api/admin/services/:serviceId/status` | Activates or deactivates a service listing (`{ isActive: boolean }`). |
| `GET` | `/api/admin/activity` | Returns recent platform-wide `inquiries` (including unassigned Case 1 general requests via `LEFT JOIN` with `'Open General Request'` label) and `bookings`. |
| `GET` | `/api/admin/reports` | Lists user-submitted moderation reports. |
| `PATCH` | `/api/admin/reports/:reportId` | Updates a report's `status` (`open`, `reviewing`, `resolved`, `dismissed`) and `resolutionNotes`. |
