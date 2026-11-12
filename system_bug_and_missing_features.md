# HugaTiera — System Bug, Post-Migration Audit & Scope Status

Last Updated: 2026-11-12

This document tracks the resolved Phase 15 bug fixes (`BUG-01` through `BUG-07`), the resolved Post-Migration System Alignment & UI/UX Audit findings (`ISS-01` through `ISS-10`), intentional academic scope boundaries, and optional post-MVP enhancements.

---

## Status Legend
- **Resolved & Verified:** Fixed in source and verified by ESLint, Vite production build, and the 53 automated backend integration/revision tests (`integration`, `r2`, `r3`, `r4`, `r5`, `r6`).
- **Intentional Scope Boundary:** Behavior that follows approved project rules in `prompt/masterprompt.md` and `AGENTS.md`.
- **Optional Post-MVP Enhancement:** Not required for the academic Software Engineering MVP.

---

## 1. Post-Migration System Alignment & UI/UX Audit Findings Resolved (`ISS-01` – `ISS-10`)

All ten audit findings identified after Production Migration 001 (November 12, 2026) were implemented and verified across Phases 1–3:

### Phase 1 — Critical Integration and Backend Fixes (`51/51` Backend Tests Passing)
- **`ISS-01` — Authenticated Request Image URLs:** Updated `frontend/src/pages/InquiryPage.jsx` to resolve all garden photo `src` attributes via `getRequestImageFileUrl(img.id)` (`API_ORIGIN` from `VITE_API_URL`) instead of relative `/api/request-images/...` paths so cross-port Vite (`:5173`) to Express (`:5000`) image requests load with credentials.
- **`ISS-02` — Unassigned Case 1 General Requests in Admin Activity:** Changed `INNER JOIN users g` to `LEFT JOIN users g` in `backend/controllers/admin.controller.js` (`listActivity`) with `COALESCE(..., 'Open General Request')` so unassigned Case 1 requests appear in the Administrator Activity Monitor.
- **`ISS-03` — Gardener Dashboard Inquiry Count for Case 1 Offers:** Updated `backend/controllers/profile.controller.js` (`getProfile`) to count inquiries where `i.gardener_id = ?` **or** `EXISTS (SELECT 1 FROM quotations q WHERE q.inquiry_id = i.id AND q.gardener_id = ?)`.
- **`ISS-04` — Gardener Optional `business_name` Display Fallbacks:** Added `COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(u.first_name, ' ', u.last_name))` across `service.controller.js`, `inquiry.controller.js`, `booking.controller.js`, and `admin.controller.js`, plus frontend fallback helpers.
- **`ISS-10` — Environment Example Synchronization:** Updated `backend/.env.example` and `frontend/.env.example` with `DB_PORT=3306`, `GEMINI_MODEL=gemini-3.8-flash`, `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite`, `GEMINI_THINKING_LEVEL=low`, and `AI_HOURLY_LIMIT=10`.

### Phase 2 — Role-Specific Dashboards, Admin Navigation & Floating Icon (`52/52` Backend Tests Passing)
- **`ISS-05` — Client & Gardener Dashboard Layout vs Profile Editing:** Added `Overview` and `Profile & Settings` tabs to `DashboardPage.jsx` so Client and Gardener dashboards prioritize active requests, offers, agreements, and bookings while keeping profile editing accessible in `Profile & Settings`.
- **`ISS-06` — Administrator Navigation, Role Restrictions & Summary Statistics:** Updated `DashboardHeader` so administrators see only `Admin Panel` and `Messages`; restricted `/api/bookings` and `GET /api/inquiries` to `requireRole('client', 'gardener')` (`403` for administrators); added `totalInquiries` and `totalBookings` to `GET /api/admin/summary` (`openInquiries / totalInquiries` and `completedBookings / totalBookings`). Verified in `TC-17`.
- **`ISS-07` — Landing Page Floating Message Icon:** Updated `FloatingMessageButton` in `frontend/src/App.jsx` to hide on `/messages`, show role-appropriate aria-labels/titles, and display an unread notification badge (`99+` cap) for authenticated users.

### Phase 3 — Workflow Status Badges & Booking Agreement Summary (`53/53` Backend Tests Passing)
- **`ISS-08` — Workflow Status Badge Styles, Human-Readable Labels & Mobile Wrapping:** Added `formatStatusLabel` across `InquiryPage.jsx`, `BookingPage.jsx`, and `DashboardPage.jsx` (`provider_selected` → `Provider Selected`, `in_agreement` → `Agreement in Progress`, `in_progress` → `In Progress`, etc.), added distinct `.status-*` CSS badge styles in `App.css`, and added `flex-wrap: wrap` at `<= 560px` so badges never overflow on mobile screens.
- **`ISS-09` — Booking Details Mutual Agreement Summary:** Extended `listBookings` and `getBooking` in `backend/controllers/booking.controller.js` with `LEFT JOIN agreements a ON a.id = b.agreement_id` and added a read-only **Mutual Agreement Summary** panel on `BookingDetailPage` (`frontend/src/pages/BookingPage.jsx`) showing Agreement Version, Status, Final Agreed Amount, Price Basis, Approved Timestamps, Agreed Scope of Work, and Agreed Conditions (with graceful fallback for legacy bookings where `agreement_id IS NULL`). Verified in `TC-18`.

---

## 2. Earlier Phase 15 Bugs Resolved & Verified (`BUG-01` – `BUG-07` & Handoff Items)

- **`BUG-01` — Notification badges and destinations:** Added routing in `CommunicationPage.jsx` for `review` and `gardener_profile` notifications and separated unread badges by destination in `DashboardPage.jsx`.
- **`BUG-02` — Notification read-state action clarity:** Renamed global action to “Mark all notifications read”.
- **`BUG-03` — Direct booking & agreement regression coverage:** Covered in `backend/tests/integration.test.js` and `backend/tests/r3.agreements.test.js`.
- **`BUG-04` — Structured backend error responses:** `backend/app.js` generates correlation `requestId`s and returns `400` for invalid JSON/upload errors, `503 DATABASE_UNAVAILABLE` for MySQL connection errors, and `500 INTERNAL_ERROR` for unexpected exceptions.
- **`BUG-05` — Authentication vs backend-unavailable handling:** `AuthContext.jsx` and `ProtectedRoute.jsx` distinguish `401` from `503`/network outages and render an offline retry screen instead of redirecting to `/login`.
- **`BUG-06` — Locale date formatting on inquiries and quotations:** Implemented in `InquiryPage.jsx` and `BookingPage.jsx`.
- **`BUG-07` — Booking state-change processing feedback:** Added in-flight button disabling and confirmation banners in `BookingPage.jsx`.
- **Additional Resolved Items (`NEW-01`–`NEW-04`, `FEAT-04`, `FEAT-06`, `FEAT-11`, `FEAT-13`, `FEAT-14`):**
  - Default Gemini primary model updated to `gemini-3.8-flash` with `gemini-3.5-flash-lite` fallback (`NEW-01` / `Step R6`).
  - Public gardener portfolio gallery, average star rating, and portfolio metadata editing (`NEW-03`).
  - Immediate account deactivation enforcement in `requireAuth` (`NEW-04`).
  - User-submitted moderation reports (`POST /api/profiles/reports`, `FEAT-04`).
  - Conversation creation from bookings (`POST /api/conversations` with `bookingId`, `FEAT-06`).
  - Live homepage category filter links (`FEAT-11`).
  - Uploaded garden photo understanding (`POST /api/ai/photo-analysis` + `sharp` EXIF stripping, resolving the photo-understanding portion of `FEAT-13`).
  - Database-backed AI quota status and recent usage display (`GET /api/ai/usage` + `ai_usage_log`, resolving `FEAT-14`).

---

## 3. Intentional Scope Boundaries & Workflow Decisions

1. **Mutual Agreement Required Before Booking (`Step R3`):** Neither an inquiry, offer, nor offer acceptance creates a booking. Direct `POST /api/bookings` returns `409 MUTUAL_AGREEMENT_REQUIRED`. All bookings are created by the second approval on `POST /api/agreements/:agreementId/approve`.
2. **Priced-Service Direct Agreements:** Only active services from approved gardeners with a positive `indicative_price` expose the direct agreement proposal action (`POST /api/agreements/direct-service`). Unpriced/flexible services use the Case 2 inquiry flow.
3. **Paid AI Image Generation Postponed:** Text and uploaded-photo understanding are active (`gemini-3.8-flash` / `gemini-3.5-flash-lite`). Paid image generation is intentionally blocked with `501 IMAGE_GENERATION_POSTPONED`, while `request_images.kind` (`'original'` vs `'ai_generated'`) and `ai_usage_log` keep the schema ready for future expansion.
4. **No Online Payments or E-Commerce:** Wallets, escrow, payment gateways, and physical product sales are excluded per `prompt/masterprompt.md`.

---

## 4. Optional Post-MVP Enhancements (Out of Current Academic Scope)

- **Password Reset via Email (`FEAT-01`):** Forgot-password token and external email delivery.
- **External Email / SMS Notifications (`FEAT-02`):** Notifications are currently stored and delivered in-app via MySQL.
- **Dedicated Admin Audit Table (`FEAT-03`):** Request/offer/agreement events are logged in `request_events` and AI calls in `ai_usage_log`; a separate table for admin category/account toggles is optional.
- **Gardener Working Hours Calendar (`FEAT-08`):** The backend enforces schedule conflict detection across active bookings and agreements, without requiring gardeners to pre-populate weekly shift calendars.
