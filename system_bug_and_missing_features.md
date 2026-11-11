# HugaTiera System Bug and Missing Features Audit

Date: 2026-11-10

This document is the Phase 15 audit list. It tracks confirmed bugs, verified
fixes, intentional workflow limitations, and remaining optional enhancements.

## Status legend

- **Resolved & verified**: fixed in source and checked by build/lint and the automated API integration tests. Items marked "browser verification pending" have not yet been checked in a real browser.
- **Verified limitation**: implemented behavior that follows approved scope rules.
- **Optional / Future enhancement**: not required for the core academic MVP.

## 1. Phase 15 Bugs Resolved & Verified

### BUG-01 — Notification badges and destinations
- **Status:** Resolved & verified.
- **Fix implemented:** Added routing destinations in `CommunicationPage.jsx` for `review` (`/gardeners/:id` for gardeners, `/bookings` for clients) and `gardener_profile` (`/dashboard`) notifications, and included general unread notifications in the `DashboardPage.jsx` `Messages` navigation badge so every unread notification is represented.

### BUG-02 — Notification read-state action clarity
- **Status:** Resolved & verified.
- **Fix implemented:** Renamed the global action in `CommunicationPage.jsx` to “Mark all notifications read” so its global scope is explicit.

### BUG-03 — Direct booking regression coverage
- **Status:** Resolved & verified.
- **Fix implemented:** Added automated tests in `backend/tests/integration.test.js` (`TC-05`, `TC-06`, `TC-11`, `TC-12`) covering eligible approved priced services, unpriced services, deactivated services, unapproved gardeners, non-client submissions, and overlapping schedule conflicts.

### BUG-04 — Generic backend error responses
- **Status:** Resolved & verified.
- **Fix implemented:** Updated `backend/app.js` error middleware to generate correlation `requestId`s, return `400` for malformed JSON payloads, `503` (`DATABASE_UNAVAILABLE`) for MySQL connectivity errors, and `500` (`INTERNAL_ERROR`) for unexpected server faults.

### BUG-05 — Authentication vs. backend-unavailable handling
- **Status:** Resolved & verified.
- **Fix implemented:** Updated `frontend/src/services/auth.js`, `AuthContext.jsx`, and `ProtectedRoute.jsx` to distinguish `401` responses from network/`503` failures and show an “Unable to reach server” retry screen instead of redirecting to `/login` when the backend is offline.

### BUG-06 — Raw ISO timestamps on inquiry and quotation dates
- **Status:** Resolved & verified.
- **Fix implemented:** Added locale date formatting (`formatDate`) in `frontend/src/pages/InquiryPage.jsx` for `requested_date`, `availability_start`, `availability_end`, and `valid_until`, plus UI controls to close or cancel open inquiries.

### BUG-07 — Booking state changes processing feedback
- **Status:** Resolved & verified.
- **Fix implemented:** Added `updatingStatus`, `submittingReview`, and `statusMessage` feedback states in `frontend/src/pages/BookingPage.jsx` to disable buttons while requests are in flight and display confirmation banners.

### Additional Phase 15 Fixes Completed During Handoff Audit
- **Default Gemini model identifier (`NEW-01`):** Updated `backend/services/ai.service.js`, `backend/.env.example`, and `README.md` to default to `gemini-2.5-flash-lite` and automatically normalize legacy `gemini-3.5-flash-lite` values.
- **Authenticated header & non-client service detail UX (`NEW-02`):** Updated `App.jsx`, `ServicesPage.jsx`, `ServiceDetailPage.jsx`, and `GardenerPage.jsx` so authenticated users see `Dashboard` instead of `Sign in`, and non-client users on `ServiceDetailPage` see an informative role note.
- **Public gardener portfolio & average rating (`NEW-03`):** Updated `service.controller.js` (`getGardener`) and `GardenerPage.jsx` to display the gardener's portfolio gallery, average star rating, and total review count, and wired portfolio metadata editing (`servicesApi.updatePortfolio`) in `DashboardPage.jsx`.
- **Immediate deactivation enforcement (`NEW-04`):** Updated `backend/middleware/auth.middleware.js` (`requireAuth`) to verify `users.is_active = TRUE` against MySQL and immediately invalidate deactivated accounts (`TC-15`).
- **End-to-end user report creation (`FEAT-04`):** Added `POST /api/profiles/reports` in `profile.controller.js` and report forms on `ServiceDetailPage.jsx` and `GardenerPage.jsx` (`TC-15`).
- **Direct-booking conversations (`FEAT-06`):** Extended `POST /api/conversations` (`conversation.controller.js`) to support `bookingId` for direct bookings and added an “Open conversation” button on `BookingPage.jsx` (`TC-13`).
- **Homepage category links (`FEAT-11`):** Connected homepage category cards in `App.jsx` and `ServicesPage.jsx` to filter by live `categoryId` query parameters.

## 2. Verified limitations and workflow decisions

### LIMIT-01 — Direct bookings do not create an inquiry

- **Status:** Intentional behavior.
- **Current behavior:** Direct booking requests have nullable `inquiry_id` and
  `quotation_id`. They are valid booking records for defined services.
- **Decision:** Preserve this. An inquiry-based booking remains connected to its
  original inquiry; a direct booking remains independent.

### LIMIT-02 — Services without indicative prices cannot be directly booked

- **Status:** Intentional product rule.
- **Current behavior:** The direct-booking button is shown only when the
  service has an indicative price. Clients must inquire about flexible or
  unpriced services.
- **Decision:** Preserve unless the project approves a different pricing model.

### LIMIT-03 — Gardener approval uses a boolean

- **Status:** Verified schema limitation.
- **Finding:** `is_approved` cannot distinguish pending, rejected, and
  request-changes states.
- **Fix required:** If the distinction matters, add an approval status and
  feedback fields through a reviewed database migration. Do not silently
  change the current workflow.

### LIMIT-04 — No online payments

- **Status:** Intentionally out of scope.
- **Decision:** Do not add wallets, escrow, refunds, or payment settlement
  without explicit project approval.

## 3. Features not yet implemented

### FEAT-01 — Password reset and account recovery

- No forgot-password flow, reset token, expiration, or reset email workflow.

### FEAT-02 — Email or external delivery for notifications

- Notifications are stored and displayed in-app only.
- No email, SMS, or push notification integration exists.

### FEAT-03 — Administrator audit log

- Administrator actions are not persisted in a dedicated audit-log table.
- Add this before production deployment if accountability is required.

### FEAT-04 — User-submitted reports

- The administrator dashboard can read and update reports, but no client or
  gardener report form/API was found for creating them.
- Add report creation with ownership, validation, and abuse protection.

### FEAT-05 — Advanced administrator moderation

- There is no complete moderation workflow for reported users/content,
  evidence, administrator notes, or audit history.

### FEAT-06 — Conversation creation from all relevant workflows

- Existing conversation creation supports the current inquiry-oriented flow.
- Verify and improve conversation creation for direct bookings so users can
  communicate after a direct booking request without relying on an inquiry.

### FEAT-07 — Notification destinations for all notification types

- Review notifications, approval notifications, and other non-inquiry/
  booking/conversation notifications need clear destinations or an explicit
  informational state.

### FEAT-08 — Service availability and gardener working hours

- The system checks booking conflicts but does not provide gardener-managed
  availability, working hours, holidays, or blocked dates.

### FEAT-09 — Booking rescheduling

- Current booking actions cover acceptance, decline, cancellation, progress,
  and completion. There is no reschedule request workflow.

### FEAT-10 — Search result loading states and richer marketplace UX

- Basic loading/error/empty states exist, but skeleton loading, saved searches,
  favorites, and richer comparison tools are not implemented.

### FEAT-11 — Real category links from homepage cards

- Homepage category cards currently link to the general services page rather
  than applying real category IDs to the marketplace filter.

### FEAT-12 — Role-aware mobile navigation

- The dashboard header does not have a dedicated mobile navigation menu.
- Responsive CSS exists, but mobile navigation must be tested and improved.

### FEAT-13 — AI image generation or garden visualization

- The assistant is text-based. Image generation, visual layouts, and uploaded
  garden-image analysis are not implemented.
- Keep these optional because they may add cost and complexity.

### FEAT-14 — AI usage history and user-visible quota status

- The backend applies a request limit, but users do not have a complete usage
  history or clear remaining-quota display.

### FEAT-15 — Production operations

The following are not yet completed:

- deployment configuration;
- production environment validation;
- database backup and restore procedure;
- monitoring and alerting;
- API rate limiting beyond the assistant limit;
- security headers and hardened production CORS;
- centralized structured logging;
- accessibility audit;
- automated browser regression suite.

## 4. Required Phase 15 test matrix

Before declaring Phase 15 complete, test these paths with separate client,
gardener, and administrator accounts:

1. Register, login, logout, session expiration, and disabled account behavior.
2. Gardener approval, request changes, public visibility, and notifications.
3. Service creation, update, deactivation, portfolio upload, and ownership.
4. Public search, category filtering, sorting, pagination, and empty states.
5. Inquiry creation, duplicate submissions, quotation, acceptance, and decline.
6. Direct booking creation, gardener acceptance, conflict prevention, and
   notification delivery.
7. Booking cancellation, decline, progress, completion, and review eligibility.
8. Conversation creation, message sending, read tracking, and notification
   routing.
9. Notification badges, mark-read behavior, and every notification type.
10. AI success, invalid input, timeout, quota, missing key, and provider error.
11. Administrator account, category, service, report, and gardener controls.
12. Desktop, tablet, and mobile layouts.

## 5. Recommended fix order

1. Fix notification destinations and complete badge/read-state behavior.
2. Add date formatting and booking action processing states.
3. Add automated backend tests for inquiry, direct booking, authorization,
   conflicts, and notification transactions.
4. Add report creation and administrator audit logging.
5. Complete manual AI, portfolio, administrator, and responsive testing.
6. Decide whether approval statuses need to distinguish pending/rejected/
   request-changes.
7. Address password recovery and production security before Phase 16.

## 6. Not evidence of an application bug

- A browser `401` after the backend is stopped is an environment/server
  availability problem, not proof that the route authorization is broken.
- Existing temporary Phase 15 records, including test bookings and repeated
  notifications, should not be treated as production data.
- A direct booking without an inquiry is expected and valid under the approved
  direct-booking design.
