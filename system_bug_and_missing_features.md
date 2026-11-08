# HugaTiera System Bug and Missing Features Audit

Date: 2026-11-08

This document is the current Phase 15 audit list. It separates confirmed bugs,
verified limitations, unverified items that still require testing, and features
that are not implemented. It should be updated as each item is fixed and
verified.

## Status legend

- **Confirmed bug**: reproduced in the browser or proven by source/data inspection.
- **Verified limitation**: implemented behavior that may need a product decision or UX improvement.
- **Needs testing**: no failure has been confirmed yet.
- **Not implemented**: required or recommended capability is not currently present.

## 1. Confirmed bugs and fixes still required

### BUG-01 — Notification badges can be misleading

- **Status:** Partially fixed.
- **Area:** Dashboard navigation and notifications.
- **Finding:** Multiple notifications for one booking previously inflated the
  Bookings badge. The badge now counts unique related booking records.
- **Remaining issue:** Notifications for reviews, gardener approvals, and other
  entity types do not appear beside a dedicated navigation destination. Some
  notification cards also have no destination because the frontend only routes
  inquiry, booking, and conversation notifications.
- **Fix required:** Add destinations or a clear notifications destination for
  review, gardener-profile, and other notifications. Ensure every unread
  notification is represented consistently.
- **Files:** `frontend/src/pages/DashboardPage.jsx`,
  `frontend/src/pages/CommunicationPage.jsx`.

### BUG-02 — Notification read state is global but navigation badges are local

- **Status:** Confirmed design inconsistency.
- **Finding:** “Mark notifications read” marks every notification read, while
  dashboard badges are grouped by destination. A user may expect only the
  currently viewed category to be cleared.
- **Fix required:** Either rename the action to “Mark all notifications read”
  and keep the current behavior, or add category-specific read actions.

### BUG-03 — Direct booking needs complete regression coverage

- **Status:** The original runtime bug was fixed and browser-verified.
- **Finding:** Direct booking initially returned a generic 503 because the new
  controller still referenced a quotation variable. The request now creates a
  pending booking and a gardener notification correctly.
- **Fix required:** Add automated tests for:
  - eligible approved service;
  - service without an indicative price;
  - inactive service;
  - unapproved gardener;
  - non-client submission;
  - overlapping schedule;
  - notification rollback when booking creation fails.

### BUG-04 — Backend failures are too generic

- **Status:** Confirmed maintainability issue.
- **Finding:** Unexpected controller/database errors are returned as
  “A backend dependency is unavailable.” This hides whether the failure is a
  query error, validation defect, or actual MySQL outage.
- **Fix required:** Keep detailed errors in server logs, but return stable
  request IDs or more specific safe error categories. Add integration tests for
  expected database and validation failures.

### BUG-05 — Authentication failures can appear as page loading or redirect

- **Status:** Reproduced during browser testing when the backend was stopped.
- **Finding:** Protected pages redirect to login when `/api/auth/me` cannot be
  reached. This is correct for an unauthenticated response but confusing when
  the backend is temporarily unavailable.
- **Fix required:** Distinguish `401` from network/`503` errors and show a
  backend-unavailable message with retry guidance instead of treating every
  failure as “not logged in.”

### BUG-06 — Inquiry and quotation dates display raw ISO timestamps

- **Status:** Confirmed UI issue.
- **Finding:** Inquiry #2 displayed values such as
  `2026-11-07T16:00:00.000Z` instead of a local, readable date.
- **Fix required:** Format requested dates and quotation availability consistently
  using the existing locale formatting helpers or a shared date utility.

### BUG-07 — Booking state changes lack consistent processing feedback

- **Status:** Confirmed UX gap.
- **Finding:** Booking detail actions do not disable themselves or show a
  “Saving...” state while a status request is in progress.
- **Fix required:** Add pending state, disable duplicate clicks, and show success
  or error feedback after accepting, declining, cancelling, starting, or
  completing a booking.

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
