# HugaTiera – Project Progress

## Project Information
- Project: HugaTiera
- Frontend: React.js (`^19.3.1`) + Vite (`^8.3.6`)
- Backend: Node.js + Express.js (`^5.3.0`)
- Database: MySQL / MariaDB (`InnoDB`, `25` tables, `59` foreign keys)
- Architecture: REST API

## Current Phase
Phase: 15 – System Integration and Testing (with Revision Track R0–R7, Post-Migration Audit Phases 1–3, and Feature Rollouts through Migrations `001`–`013` completed)

Status: **Automated integration, Production Migrations `001`–`013` on `hugatiera_db`, Post-Migration Audit Phases 1–3 (`ISS-01`–`ISS-10`), post-audit feature enhancements (18+ registration/basic info, itemized per-sq.m price estimator, working schedule & daily crew capacity, reservation/deposit/completion agreement workflow, event-based cancellation & mutual rescheduling, category-specific open requests, smart AI proximity/good-conduct recommendations, gardener planning calendar with urgency notifications, Dual Role `Client ⇄ Gardener`, Assigned Clerk workspace + Gardener self-service "My Clerks", PayMongo Checkout + Sandbox/Demo online payment gateway), Security/Bug Hardening Pass, UI/UX 100% polish upgrades, and idempotent Zamboanga City demo seeding completed and verified (`80/80` automated backend tests across 15 suites passing, frontend `eslint` & `vite build` passing, `0` production npm vulnerabilities). Manual live-key Gemini/PayMongo and final interactive defense walk-through remain noted below before final Phase 15 → Phase 16 sign-off.**

Scope revision (approved 2026-11-10): the system concept was revised after the professor consultation (two unified request workflows, mutual agreement before confirmation, Gemini-assisted photo understanding). The work is tracked as the **Revision Track R0–R7** in `prompt/masterprompt.md` (Section 11A) and `prompt/prompts.md`. It sits between the completed Phases 1–14 and Phase 16. The 16-phase numbering is unchanged.

### Summary of Completed Revision, Migration & Audit Milestones (November 2026)
1. **Steps R0 / R0b:** Architectural decisions, state machines, and additive 19-table schema changes documented in `docs/implementation/implementation-plan.md` and approved by the user.
2. **Step R1:** Additive migration (`database/migrations/001_unified_requests_and_agreements.sql`), structural rollback (`001_unified_requests_and_agreements_rollback.sql`), and fresh-install schema (`database/schema/hugatiera_schema.sql`) rehearsed and verified against `hugatiera_db_migration_test`.
3. **Step R2:** Secure garden photo upload and authenticated delivery (`/api/request-images`, `sharp` validation, `1920×1920` resize, complete EXIF/GPS metadata removal, separate `originals/` and `generated/` folders, 24h orphan cleanup) verified by `backend/tests/r2.requestImages.test.js` (`12/12` passing).
4. **Step R3:** Versioned mutual agreement engine (`/api/agreements`) and booking creation gating (`POST /api/bookings` retired with `409 MUTUAL_AGREEMENT_REQUIRED`, priced-service agreements routed via `POST /api/agreements/direct-service`, two-party approval required on the exact same version) verified by `backend/tests/r3.agreements.test.js` (`5/5` suites passing).
5. **Step R4:** Case 2 Direct Service Provider Inquiry end to end (`serviceId` or `gardenerId`, draft photo attachment, feasibility response types `offer`/`feasible`/`modifications`/`cannot_do`, offer revision snapshots in `quotation_revisions`, withdrawal, locking on acceptance, lazy expiry) verified by `backend/tests/r4.directInquiry.test.js` (`6/6` suites passing).
6. **Step R5:** Case 1 General Service Request, Open Service Requests Board (`GET /api/inquiries/open` with area-level privacy), multi-provider offer isolation, client comparison enrichment, Case 1 conversation gating, and request renewal (`POST /api/inquiries/:inquiryId/renew`) verified by `backend/tests/r5.generalRequest.test.js` (`6/6` suites passing).
7. **Steps R6 / R7:** Gemini Requirements Assistant (`POST /api/ai/requirements`), Uploaded-Photo Understanding (`POST /api/ai/photo-analysis`), Configurable Automatic Model Fallback (`GEMINI_MODEL=gemini-3.8-flash` primary → `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite` fallback on transient `429`/`5xx`/timeout/network errors), Provider Decision-Support View, and Concurrency-Safe Database-Backed Rate Limits (`SELECT ... FOR UPDATE` + `ai_usage_log`) verified by `backend/tests/r6.aiAssistance.test.js` (`9/9` suites passing).
8. **Production Database Migration 001 (Executed 2026-11-12):**
   - Completed preflight report, backup verification (`hugatiera_db_backup_20261112_201307.sql` restored into `hugatiera_db_backup_verify` with `14/14` `CHECKSUM TABLE` parity), and final pre-migration backup (`hugatiera_db_pre_migration001_final_20261112_202700.sql`).
   - Executed `database/migrations/001_unified_requests_and_agreements.sql` (SHA-256 `c7422e9a253d7a15e870a1290c850e30358b35d020e94bc7d269a8961f0e8a8d`) once against `hugatiera_db`.
   - Verified `19` tables, `46` foreign keys, `19/19` table DDL parity with `hugatiera_db_migration_test`, preservation of all existing rows, and normalization of duplicate active Quotation ID `3` on `inquiry_id = 2` / `gardener_id = 16` from `'sent'` to `'withdrawn'`.
9. **Post-Migration Audit & Approved Implementation Phases 1–3 (`ISS-01`–`ISS-10`, Executed 2026-11-12):**
   - **Phase 1 (`ISS-01`, `ISS-02`, `ISS-03`, `ISS-04`, `ISS-10`):** Fixed authenticated request image URLs using `getRequestImageFileUrl(img.id)` (`API_ORIGIN`), changed Admin Activity SQL joins (`listActivity`) to `LEFT JOIN` with `'Open General Request'` fallback so unassigned Case 1 requests appear, updated Gardener dashboard inquiry counts (`getProfile`) to include Case 1 requests where the gardener submitted an offer, added SQL `COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(u.first_name, ' ', u.last_name))` display-name fallbacks across `service.controller.js`, `inquiry.controller.js`, `booking.controller.js`, and `admin.controller.js`, and synchronized `.env.example` files. Verified with **`51/51` backend tests passing**, frontend lint passing, and frontend build passing.
   - **Phase 2 (`ISS-05`, `ISS-06`, `ISS-07`):** Reorganized Client and Gardener dashboards into `Overview` and `Profile & Settings` tabs (`DashboardPage.jsx`), updated Administrator header navigation to show only `Admin Panel` and `Messages`, restricted `/api/bookings` and `GET /api/inquiries` to `requireRole('client', 'gardener')` (`403` for administrators), added `totalInquiries` and `totalBookings` to `GET /api/admin/summary` (`openInquiries / totalInquiries` and `completedBookings / totalBookings`), updated the landing page floating message button (`App.jsx`) to hide on `/messages` and show an unread badge, and added `TC-17` to `backend/tests/integration.test.js`. Verified with **`52/52` backend tests passing**, frontend lint passing, and frontend build passing.
   - **Phase 3 (`ISS-08`, `ISS-09`):** Added human-readable status formatting (`formatStatusLabel` in `InquiryPage.jsx`, `BookingPage.jsx`, and `DashboardPage.jsx`), distinct CSS badge classes for all Revision Track statuses (`provider_selected`, `in_agreement`, `confirmed`, `expired`, `withdrawn`, `proposed`, `agreed`, `superseded`, `in_progress`, `completed`, `pending`), responsive flex-wrap rules at `<= 560px`, enriched `GET /api/bookings` and `GET /api/bookings/:bookingId` with `LEFT JOIN agreements a ON a.id = b.agreement_id`, rendered the read-only **Mutual Agreement Summary** panel on `BookingDetailPage`, and added `TC-18` to `backend/tests/integration.test.js`. Verified with **`53/53` backend tests passing**, frontend lint passing, and frontend build passing.
10. **UI/UX Consistency Pass, Migration 002 & Account/Media Additions (Executed 2026-11-17):**
   - **Migration 002 (`002_avatars_service_images.sql`):** Rehearsed apply + rollback + re-apply on `hugatiera_db_migration_test`, backed up `hugatiera_db` to `database/backups/hugatiera_db_pre_migration002_20261117_2304.sql`, and applied `users.avatar_path` and `services.image_path` to `hugatiera_db`.
   - **Media & Admin Account Endpoints:** Added `sharp` EXIF-stripped profile picture upload/delivery/delete (`/api/profiles/me/avatar`, `/api/profiles/:userId/avatar`), service cover/design photo upload/delivery/delete (`/api/services/:serviceId/image`), and Admin account edit/role-switch/delete (`PATCH`/`DELETE /api/admin/users/:userId` with `ON DELETE RESTRICT` `409` handling), verified by `backend/tests/avatarsServicesAdmin.test.js` (`3/3` passing).
   - **UI/UX Consistency & Navigation:** Applied the Three-Color Design System (`#244B36`, `#F7F5EC`, `#D99A36`), separated `/messages` and `/notifications` pages, added floating bottom-right `<AiAssistantWidget />`, separated Admin tabs (`Overview`, `Analytics`, `Approvals`, `Activity`, `Reports`, `Accounts`), moved dashboard tabs to top-right `.dashboard-topbar`, upgraded Marketplace/Inquiries/Bookings to 3-column image cards, made editorial/public headers sticky, fixed Inquiry Detail photo/notes layout, and added smart recent-email quick-fill + password visibility toggles on Login/Register.
11. **Post-Audit Feature Enhancements & Migrations 003–010 (Executed 2026-11-18 – 2026-11-20):**
   - **Migration 003 (`003_user_basic_info.sql`):** Added optional `middle_name`, `date_of_birth` with 18+ age verification, client address/city persistence, and gardener onboarding fields (`registrationBasicInfo.test.js`, `3/3` passing).
   - **Migrations 004 & 006 (`004_inquiry_price_estimator.sql`, `006_itemized_pricing_settings.sql`):** Added per-sq.m labor baseline rates, separate plant/material pricing add-ons (`pricing_addons`, `inquiry_addons`), Admin Pricing tab, live `POST /api/inquiries/estimate`, client price comments, ocular/site-visit flags, and gardener labor/materials quotation splits (`inquiryPriceEstimator.test.js`, `4/4` passing).
   - **Migration 005 (`005_scheduling_availability_capacity.sql`):** Added gardener working days/hours, blocked dates (`gardener_unavailable_dates`), estimated job duration, and simultaneous job capacity enforcement (`schedulingAvailability.test.js`).
   - **Migrations 007 & 008 (`007_reservation_payment_workflow.sql`, `008_transaction_completion_agreement.sql`):** Added Reservation vs. Confirmed Paid Booking deposit gating, `booking_payments` (`TXN-YYYYMMDD-XXXXXX` codes), private receipt upload/verification, post-completion balance payment, mutual Transaction Completion Agreement (`POST /api/bookings/:bookingId/complete-transaction`), and strict review gate requiring full payment + mutual closure (`reservationPayments.test.js`, `1/1` passing).
   - **Migration 009 (`009_event_cancellation_and_reschedule.sql`):** Added structured event-based cancellation reasons (e.g., typhoon/weather, accident/emergency) and mutual rescheduling (`booking_reschedule_requests`) with live availability checks and payment preservation (`cancellationReschedule.test.js`, `2/2` passing).
   - **Migration 010 (`010_inquiry_category_specs.sql`):** Added `inquiries.category_specs` JSON for dynamic category-specific Open Request forms (Landscaping, Lawn Care, Tree & Plant Care, Potted & Terrace Gardens, Garden Maintenance, Garden Improvement).
   - **Engaging Dashboards, Gardener Calendar & Smart AI Matching:** Added WCAG-AA readability polish, 4-step booking progress stepper & next-step banners, featured service/open-lead/review showcases on Client & Gardener dashboards, collapsible `<GardenerScheduleCalendar />`, and hybrid Smart AI Filtering & Good-Conduct Recommendations (`GET /api/ai/recommendations`, `POST /api/ai/recommendations/summary`; `smartAiRecommendations.test.js`, `3/3` passing).
12. **3-Step Rollout: Migrations 011–013 (Executed 2026-11-20 – 2026-11-21, Verified 2026-11-23):**
   - **Step 1 / Migration 011 (`011_crew_capacity_workers.sql`):** Added `gardener_profiles.crew_size` and `services.workers_required`, worker-weighted peak-overlap validation (`CREW_CAPACITY_EXCEEDED`), `fullyBookedDates` ("Fully Booked — No Service Available") day blocking, calendar urgency badges (`Overdue`, `Urgent Today`, `Due Tomorrow`, `To Do`), idempotent `booking_reminder` notifications, and clearer UI navigation cues (`schedulingAvailability.test.js`, `3/3` passing).
   - **Step 2 / Migration 012 (`012_dual_role_and_assigned_clerk.sql`):** Added Dual Role (`can_act_as_client`, `can_act_as_gardener`, `role: 'both'` registration, 1-click `POST /api/auth/switch-role` Client ⇄ Gardener mode switch, `POST /api/auth/enable-dual-role` opt-in, self-dealing `409` guards) and Assigned Clerk role (`users.role = 'clerk'`, `clerk_gardener_assignments`, Admin assignment UI, and `<ClerkDashboard />` scoped strictly to assigned gardeners with `403 NOT_ASSIGNED_TO_GARDENER` enforcement; `dualRoleAndClerk.test.js`, `4/4` passing).
   - **Step 3 / Migration 013 (`013_payment_gateway_sessions.sql`):** Extended `booking_payments` with optional PayMongo Checkout / Sandbox Demo gateway tracking (`gateway_provider`, `gateway_session_id`, `gateway_checkout_url`, `gateway_status`, `gateway_paid_at`, `grab_pay`/`card` methods), `backend/services/paymentGateway.service.js`, `GET /api/bookings/payment-gateway/config`, `POST /api/bookings/:bookingId/payments/checkout`, and atomic idempotent `POST /api/bookings/:bookingId/payments/:paymentId/confirm-gateway` (notifying gardener + assigned clerk), plus 2-tab online/manual checkout UI and built-in Sandbox/Demo modal on `BookingPage.jsx` (`paymentGateway.test.js`, `3/3` passing).
13. **Security Hardening, Bug Fixes, Gardener Self-Service "My Clerks" & 100% UI/UX Polish (Executed & Verified 2026-11-23):**
   - **Security Hardening (6 Fixes):**
     - Eliminated Open Redirect risk in PayMongo checkout by using server-side `FRONTEND_URL` (ignoring client `Origin` headers) and enforcing `https://` redirect validation on the frontend.
     - Added HTTP security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, disabled `X-Powered-By`), `256kb` JSON payload limit, and sliding-window auth rate limiting (`backend/middleware/rateLimit.middleware.js`) on `/api/auth/login` and `/api/auth/register`.
     - Upgraded portfolio image uploads (`portfolio.routes.js`, `portfolio.controller.js`, `upload.middleware.js`) to `sharp` magic-byte validation, EXIF/GPS metadata stripping, and `resolveContainedPath` containment.
     - Guarded `sandbox_demo` payments from running in `NODE_ENV=production` unless `ALLOW_SANDBOX_PAYMENTS=true` is explicitly enabled, added online checkout overpayment cap (`400 OVERPAYMENT_EXCEEDS_BALANCE`), and hardened `switchRole` to block non-client/gardener roles.
   - **Functional Bug Fixes (6 Fixes):**
     - Fixed Admin → Accounts → Assigned Clerks rendering (`clerk_name` / `gardener_name`).
     - Added `gateway_provider`, `gateway_session_id`, `gateway_checkout_url`, `gateway_status`, and `gateway_paid_at` to `GET /api/bookings/:bookingId` so online payment badges and Resume Checkout persist across reloads.
     - Enabled `/notifications` access and sidebar unread badge for `clerk` users, plus `gateway_provider` badges on `ClerkDashboard.jsx`.
     - Fixed dual-role booking detail role detection (`Number(booking.gardener_id) === Number(user.id)`) with mode-mismatch warning banner, and excluded a dual-role user's own open requests from `GET /api/inquiries/open` and `GET /api/ai/recommendations?mode=leads`.
   - **Gardener Self-Service "My Clerks":**
     - Added `GET /api/profiles/me/clerks`, `POST /api/profiles/me/clerks` (atomic clerk account creation + exclusive assignment), `POST /api/profiles/me/clerks/assign` (link existing `clerk` by email with `400 TARGET_NOT_CLERK` anti-hijack guard), and `DELETE /api/profiles/me/clerks/:assignmentId` (`profile.controller.js`, `profile.routes.js`).
     - Added `<GardenerClerksPanel />` and a dedicated **My Clerks** tab (`/dashboard?tab=clerks`) on the Gardener Dashboard (`dualRoleAndClerk.test.js`, `5/5` passing).
   - **100% UI/UX Polish & Demo Seeding:**
     - Polished `/register` 3-option role cards (**Find a gardener**, **Offer services**, **Both (Client & Provider)**), `?role=both` query support, full-width `Short bio / specialties` textarea, and `aria-label="City"` (verified visually in live browser).
     - Replaced browser `window.prompt()` / `window.confirm()` dialogs with styled accessible modals (`Escape`-key & backdrop close) for payment rejection, account deletion, and clerk revocation.
     - Added **Print / Save PDF** booking & receipt summary (`@media print` stylesheet in `App.css`), public availability/crew-size/fully-booked date previews on `ServiceDetailPage.jsx` and `GardenerPage.jsx`, and animated skeleton loading placeholders.
     - Created idempotent Zamboanga City demo seed script (`backend/scripts/seedDemo.js`, `npm --prefix backend run seed:demo`) and populated `hugatiera_db` with 6 role demo accounts, 4 active approved services, 1 open landscaping request, and 1 closed 5-star booking.

## Phase 15 Verification Status (accurate record — re-verified 2026-11-23)
- **Verified by execution:**
  - Frontend `npm --prefix frontend run lint` (`0` errors, `0` warnings) and `npm --prefix frontend run build` pass.
  - `npm --prefix backend audit --omit=dev` and `npm --prefix frontend audit --omit=dev` report `0` production vulnerabilities.
  - All **`15` automated backend test suites (`80/80` tests, `0` failures)** pass against `hugatiera_db_migration_test`:
    - Feature & integration suites (`42/42`): `avatarsServicesAdmin.test.js` (`3/3`), `cancellationReschedule.test.js` (`2/2`), `dualRoleAndClerk.test.js` (`5/5`), `inquiryPriceEstimator.test.js` (`4/4`), `integration.test.js` (`15/15`), `paymentGateway.test.js` (`3/3`), `registrationBasicInfo.test.js` (`3/3`), `reservationPayments.test.js` (`1/1`), `schedulingAvailability.test.js` (`3/3`), `smartAiRecommendations.test.js` (`3/3`).
    - Revision Track suites (`38/38`): `r2.requestImages.test.js` (`12/12`), `r3.agreements.test.js` (`5/5`), `r4.directInquiry.test.js` (`6/6`), `r5.generalRequest.test.js` (`6/6`), `r6.aiAssistance.test.js` (`9/9`).
  - Live HTTP security headers verified on `GET /api/health` (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, no `X-Powered-By`).
  - Demo seed script (`backend/scripts/seedDemo.js`) verified idempotent on `hugatiera_db_migration_test` and executed on `hugatiera_db` (`4` live approved services verified via `GET /api/services`).
  - Production Migrations `001`–`013` rehearsed (apply → rollback → re-apply) on `hugatiera_db_migration_test`, backed up to `database/backups/`, and executed on `hugatiera_db` (`25` tables, `59` foreign keys).
- **Still pending manual verification:** live Gemini request with a real `GEMINI_API_KEY`, live/test PayMongo Checkout with a real `PAYMONGO_SECRET_KEY` (when configured; Sandbox/Demo mode is verified end-to-end), and final interactive defense walk-through across desktop/tablet/mobile viewports.

## Phase Checklist

- [x] Phase 1 – Requirements and System Architecture
- [x] Phase 2 – MySQL Database Design
- [x] Phase 3 – Development Environment Setup
- [x] Phase 4 – Frontend Foundation and UI Design
- [x] Phase 5 – Authentication and Authorization
- [x] Phase 6 – User Profiles and Dashboards
- [x] Phase 7 – Gardening Services and Portfolios
- [x] Phase 8 – Marketplace and Search
- [x] Phase 9 – Service Inquiry and Quotation
- [x] Phase 10 – Messaging and Notifications
- [x] Phase 11 – Booking and Scheduling
- [x] Phase 12 – Ratings and Reviews
- [x] Phase 13 – AI Garden Planning Assistant
- [x] Phase 14 – Administrator Functions
- [ ] Phase 15 – System Integration and Testing (All `80/80` automated backend tests across 15 suites, security/bug hardening, frontend lint & build, demo seed, and Migrations `001`–`013` verified; awaiting final interactive walk-through & user sign-off)
- [ ] Phase 16 – Deployment and Documentation

## Completed Features
- Approved React + Vite, Node.js + Express.js, and MySQL architecture.
- 25-table (`59`-FK) MySQL schema in `database/schema/hugatiera_schema.sql` and Migrations `001`–`013` (each with rollback scripts; applied to both `hugatiera_db_migration_test` and `hugatiera_db`).
- Backend health endpoint at `GET /api/health` with HTTP security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) and auth rate limiting.
- Client, Gardener, and Dual-Role (`Both: Client & Provider`) registration with 18+ age verification, hashed passwords, `HttpOnly` JWT cookies, 1-click Client ⇄ Gardener switching, and self-dealing `409` guards.
- Assigned Clerk role (`clerk_gardener_assignments`), Admin assignment UI, Gardener Self-Service **My Clerks** panel (create/link/revoke), dedicated `<ClerkDashboard />` operations desk, and clerk notifications.
- Live `users.is_active = TRUE` verification in `requireAuth` so deactivated accounts immediately lose access.
- Role-specific profile retrieval, updates, engaging discovery dashboards, collapsible `<GardenerScheduleCalendar />` with urgency notifications, and public availability/crew-capacity/fully-booked previews.
- Gardener service listing CRUD, `sharp`-hardened portfolio/avatar/service/receipt/request-photo uploads (EXIF/GPS stripped, magic-byte checked, path-contained), public marketplace search/filter/sort/pagination, and automatic full-name fallback when `business_name` is empty (`ISS-04`).
- Itemized per-sq.m price estimator, Admin Pricing tab, dynamic category-specific Open Request forms (`category_specs`), and hybrid Smart AI proximity/good-conduct recommendations (`GET /api/ai/recommendations`, `POST /api/ai/recommendations/summary`).
- Step R2–R7 workflows: secure garden photo delivery, versioned mutual agreement engine (`/api/agreements`), Case 1 General Service Requests & Open Requests Board, Case 2 Direct Service Inquiries, Gemini Requirements & Photo Understanding with automatic model fallback (`gemini-3.8-flash` → `gemini-3.5-flash-lite`) and DB-backed rate limits.
- Reservation vs. Confirmed Paid Booking workflow with deposit gating, PayMongo Checkout + Sandbox/Demo online payment gateway + manual receipt proofs, `TXN-...` transaction codes, post-completion balance payment, mutual Transaction Completion Agreement, strict review gate, event-based cancellation & mutual rescheduling, and printable/PDF booking receipt summary.
- Administrator moderation dashboard with analytics, pending gardener approvals, category/pricing/service moderation, account CRUD with styled confirmation modal, clerk assignments, and report resolution.
- Optional idempotent demo seeder (`npm --prefix backend run seed:demo`) for Zamboanga City showcase data.

## Database Status
- **Production Database (`hugatiera_db`):** Migrated through **Migration 013** (latest applied **November 21, 2026**). Confirmed `25` tables and `59` foreign keys, with pre-migration backups preserved in `database/backups/` (git-ignored). **Do not rerun already-applied migrations on `hugatiera_db`.**
- **Automated Test Database (`hugatiera_db_migration_test`):** Confirmed `25` tables and `59` foreign keys (all Migrations `001`–`013` rehearsed via apply → rollback → re-apply). Used exclusively by the automated backend test suites (`DB_NAME=hugatiera_db_migration_test`).
- Fresh-install schema is synced in `database/schema/hugatiera_schema.sql`.

## Known Issues & Limitations
- Live Gemini generation requires a valid `GEMINI_API_KEY` in `backend/.env` when testing against the live Google API.
- Live/test PayMongo Checkout requires a valid `PAYMONGO_SECRET_KEY` in `backend/.env`; when omitted, HugaTiera automatically operates in built-in Sandbox/Demo Checkout Mode alongside manual cash/receipt proof uploads.
- Direct booking creation bypassing mutual agreement is retired by design (`POST /api/bookings` returns `409 MUTUAL_AGREEMENT_REQUIRED`); all new bookings are created via mutual agreement approval (`POST /api/agreements/:agreementId/approve`).
- Physical product e-commerce, live GPS tracking/dispatch, payroll, CAD/3D modeling, and paid AI image generation (`501 IMAGE_GENERATION_POSTPONED`) remain intentionally out of scope.
- `npm --prefix backend audit` reports 2 moderate advisories in `minimatch` (a transitive dependency of `nodemon` in `devDependencies` only; production dependencies have `0` vulnerabilities).

## Revision Track & Post-Migration Audit Status
- [x] R0 / R0b – Decisions recorded and database plan approved.
- [x] R1 – Migration 001, rollback script, and 19-table schema verified on `hugatiera_db_migration_test` and executed on `hugatiera_db` (2026-11-12).
- [x] R2 – Secure garden photo upload, `sharp` EXIF/GPS stripping, and authenticated delivery (`12/12` tests passing).
- [x] R3 – Mutual agreement engine and booking gating (`5/5` suites passing).
- [x] R4 – Case 2 Direct Service Provider Inquiry end to end (`6/6` suites passing).
- [x] R5 – Case 1 General Service Request, Open Board, and Offer Comparison end to end (`6/6` suites passing).
- [x] R6 – Gemini requirements assistant, photo understanding, fallback model (`gemini-3.5-flash-lite`), Provider Decision-Support View, and DB rate limits (`9/9` suites passing).
- [x] R7 (Automated Suites) & Post-Migration Audit Phases 1–3 (`ISS-01` through `ISS-10`) – All 10 audit findings implemented and verified (`53/53` backend tests passing, frontend lint & build passing).

## Next Tasks
- **Branch `main` (PR #4 `mergedbranchv1` merged + post-merge refinements verified 2026-11-24):**
  - Merged `mergedbranchv1` into `main` (PR #4), including role-switch error feedback in `AppSidebar.jsx`, Option 3 automatic Client mode for every Gardener (`can_act_as_client = TRUE` + `client_profiles` row), `TEAM_SYNC_GUIDE.md`, and local `hugatiera_db` backup (`hugatiera_db_pre_migrations003_013_20261124_1950.sql`) + Migrations `003`–`013` (`25` tables, `59` FKs).
  - Replaced `"What do you need?"` free-text input in `ClientDiscoveryShowcase` (`DashboardPage.jsx`) with a live service category `<select>` dropdown backed by `categoryId` filtering in `GET /api/ai/recommendations` (`ai.controller.js`).
  - Created and imported idempotent Zamboanga City showcase seed SQL (`database/seeds/zamboanga_demo_data.sql`) into local `hugatiera_db` (`6` approved Zamboanga City gardeners, `12` services across all `6` categories, `2` clients, `6` completed/paid/closed bookings + `6` verified reviews, `3` open general requests; `hugatiera_db_migration_test` kept clean).
  - Redesigned `/register` (`AuthPage.jsx` + `App.css`) into a clean **2-card role selector** (**Find a gardener** / **Offer services**) and **3-step wizard** (`1. About you` → `2. Details` → `3. Account`) with per-step validation and summary review.
  - Enforced **Provider-Managed Clerks**: removed public Clerk signup from `/register`, blocked `role: 'clerk'` on public `POST /api/auth/register` (`400`), updated `dualRoleAndClerk.test.js` (`5/5` passing), and verified frontend lint/build + `23/23` backend regression tests.
  - Created complete role-by-role feature documentation in `docs/system-functionalities.md` and synchronized all project `.md` documentation files to `main`.
- Perform final live browser/presentation walk-through and confirm readiness for Phase 16 sign-off.
