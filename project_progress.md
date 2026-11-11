# HugaTiera – Project Progress

## Project Information
- Project: HugaTiera
- Frontend: React.js + Vite
- Backend: Node.js + Express.js
- Database: MySQL
- Architecture: REST API

## Current Phase
Phase: 15 – System Integration and Testing

Status: In progress (partially verified; NOT complete)

Scope revision (approved 2026-11-10): the system concept was revised after the professor consultation (two unified request workflows, mutual agreement before confirmation, Gemini-assisted photo understanding). The work is tracked as the **Revision Track R0–R7** in `prompt/masterprompt.md` (Section 11A) and `prompt/prompts.md`. It sits between the completed Phases 1–14 and Phase 16. The 16-phase numbering is unchanged. Current step: **R4 – Case 2 Direct Service Provider Inquiry end-to-end (`backend/controllers/inquiry.controller.js`, `backend/routes/inquiry.routes.js`, `frontend/src/services/inquiries.js`, `frontend/src/pages/GardenerPage.jsx`, `frontend/src/pages/InquiryPage.jsx`, `backend/tests/r4.directInquiry.test.js`) implemented and verified with sequential, rollback, authorization, offer revision/locking, and concurrency tests (`36/36` backend tests passing across `integration`, `r2`, `r3`, and `r4` suites on `hugatiera_db_migration_test`); original working database (`hugatiera_db`) remains untouched per user instruction.**

## Phase 15 Verification Status (accurate record)
- **Verified by execution:** frontend `npm run lint` and `npm run build` pass; backend `npm test` (`backend/tests/integration.test.js`, 13 tests, TC-01 to TC-16) passes against the local MySQL database (run outside the sandbox because the sandbox blocks MySQL port 3306).
- **Implemented but NOT browser-verified:** notification routing/badges, inquiry date formatting, inquiry close/cancel buttons, booking "Saving..." states, backend-offline retry screen, gardener portfolio gallery and rating display, portfolio edit UI, report forms, homepage category links, direct-booking conversation button.
- **Still pending manual verification:** responsive layouts (mobile/tablet/desktop), live Gemini request (the default model `gemini-2.5-flash-lite` was set from prior knowledge and has not been confirmed against the live API), administrator success-path UI, notification delivery with real accounts.
- **Phase 15 cannot be marked complete** until the manual checks above pass and the revision track is integrated and re-tested.

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
- [ ] Phase 15 – System Integration and Testing
- [ ] Phase 16 – Deployment and Documentation

## Completed Features
- Approved React + Vite, Node.js + Express.js, and MySQL architecture.
- MySQL schema initialized in `database/schema/hugatiera_schema.sql`.
- Backend health endpoint at `GET /api/health`.
- Backend-to-MySQL connectivity verified locally.
- Frontend lint and production build verified.
- Responsive HugaTiera landing page foundation implemented.
- Reusable navigation, logo, button, service-card, workflow, assistant, and footer UI patterns added.
- Client and gardener registration with validation and hashed passwords implemented.
- JWT authentication using HttpOnly cookies implemented.
- Login, logout, current-session, protected frontend route, and role-protected backend checks implemented.
- Administrator self-registration rejected.
- Role-specific profile retrieval and updates connected to MySQL.
- Client and gardener dashboard activity counts connected to MySQL.
- Administrator summary and basic account activation management implemented.
- Gardener service listing CRUD with category assignment and ownership checks implemented.
- Public approved-service browsing and service detail data implemented.
- Portfolio image upload, metadata update, deletion, and validated image delivery implemented.
- Public marketplace search and filtering by keyword, category, and service area implemented.
- Marketplace sorting and pagination implemented.
- Service detail and public gardener profile pages implemented.
- Client inquiry creation, listing, detail, and status updates implemented.
- Gardener quotation creation with transactional inquiry response updates implemented.
- Client quotation acceptance and decline implemented.
- Inquiry and quotation frontend routes, forms, lists, and detail views implemented.
- Inquiry workflow explicitly does not create bookings automatically.
- REST conversations and message history with client/gardener ownership checks implemented.
- Message sending, timestamps, and read tracking implemented.
- Notifications for inquiries, quotations, quotation decisions, and new messages implemented.
- Notification listing, unread counts, and mark-read actions implemented.
- Messaging and notifications frontend page implemented at `/messages`.
- Client booking requests can be submitted from accepted quotations.
- Booking schedules, details, history, and ownership checks implemented.
- Gardener booking acceptance, decline, service progress, and completion implemented.
- Client booking cancellation and schedule conflict prevention implemented.
- Booking status notifications implemented.
- Completed-booking review eligibility and ownership checks implemented.
- Duplicate reviews are prevented at the application and database levels.
- Client ratings and written feedback implemented.
- Visible reviews displayed on public gardener profiles.
- Backend-mediated text Garden Planning Assistant implemented with Gemini configuration.
- Assistant input validation, 10 requests-per-hour user limit, timeout, quota, and credential error handling implemented.
- Authenticated assistant page implemented at `/assistant` with examples and safety disclaimer.
- Administrator account management and role-protected dashboard implemented.
- Administrator category creation, activation, and deactivation implemented.
- Administrator service listing monitoring and moderation implemented.
- Administrator inquiry and booking activity monitoring implemented.
- Administrator report review and status management implemented.
- Phase 15 core API workflow smoke-tested from registration through profile update, service creation/search, inquiry, quotation, booking lifecycle, messaging, notifications, and review creation.
- Phase 15 validation checks confirmed protected endpoints, invalid-input responses, database relationship integrity, frontend lint/build, and secret exposure protections.
- Phase 15 audit updated the roadmap and current folder-structure documentation to match the approved 16-phase React/Express/MySQL project.
- Phase 15 UI fixes made homepage service/navigation actions functional and exposed gardener approval/public-visibility status.
- Client and gardener dashboards now show recent inquiries, booking activity, and role-specific next actions.
- Dashboard navigation now shows unread notification counts, and related notifications can open their workflow records.
- Dashboard unread badges are now separated by destination: inquiries, bookings, and messages each show only their related unread activity.
- Dashboard unread badges count unique related workflow records, so repeated booking status notifications do not inflate the displayed count.
- Messages and notifications now use a more spacious responsive layout with separate conversation and notification sections.
- Direct booking requests are supported for approved active services with indicative pricing, while inquiry-to-quotation booking remains available.
- Service-detail inquiry navigation now validates service IDs and shows clear errors instead of failing ambiguously.
- Homepage now displays recently added approved services from the marketplace API.
- Inquiry and related workflow records now commit atomically with their notifications.
- Inquiry list and detail pages now provide loading, validation, and explicit error states for authenticated users.
- Fixed the gardener inquiry-detail blank page caused by passing a promise-returning loader directly to `useEffect`.
- Implemented Phase 15 bug fixes (`BUG-01` through `BUG-07`; verified by lint/build/API tests, browser verification pending), including full notification routing (`review`, `gardener_profile`), locale date formatting on inquiries/quotations, inquiry close/cancel UI actions, booking status processing feedback, and `401` vs. `503`/network separation in `AuthContext` and `ProtectedRoute`.
- Added public gardener portfolio gallery rendering, average rating calculation, and gardener dashboard portfolio metadata editing (`PUT /api/portfolios/:portfolioId`).
- Added user-submitted report creation (`POST /api/profiles/reports`) on service detail and gardener profile pages, connected to administrator report moderation.
- Extended conversation creation (`POST /api/conversations`) to support direct bookings without an inquiry, and added an “Open conversation” action on booking detail pages.
- Updated `requireAuth` middleware to verify active user status (`users.is_active = TRUE`) in MySQL so deactivated accounts lose access immediately.
- Updated default Gemini model configuration to `gemini-2.5-flash-lite` with automatic normalization for legacy `gemini-3.5-flash-lite` settings.
- Added and executed automated backend integration & regression test suite (`backend/tests/integration.test.js`, 13 test suites covering `TC-01` through `TC-16`, all passing).
- Implemented Step R2 secure garden photo upload and authenticated delivery (`/api/request-images`, `backend/middleware/upload.middleware.js`, `backend/controllers/requestImage.controller.js`, `backend/routes/requestImage.routes.js`, `frontend/src/services/requestImages.js`, `backend/server.js`) with `sharp` image decoding, auto-orientation, resizing within 1920×1920, complete EXIF/GPS/XMP/IPTC metadata removal, separate `originals/` and `generated/` storage, periodic + upload-triggered orphan cleanup (DB-first delete + disk-orphan sweep), and role/ownership access checks (verified by `backend/tests/r2.requestImages.test.js`, 12/12 passing, and `backend/tests/integration.test.js`, 13/13 passing on `hugatiera_db_migration_test`).
- Implemented Step R3 mutual agreement engine and booking creation gating (`backend/controllers/agreement.controller.js`, `backend/routes/agreement.routes.js`, `backend/controllers/booking.controller.js`, `frontend/src/services/agreements.js`, `frontend/src/pages/BookingPage.jsx`, `frontend/src/pages/InquiryPage.jsx`, `frontend/src/pages/ServiceDetailPage.jsx`):
  - Retired direct `POST /api/bookings` creation (`409 MUTUAL_AGREEMENT_REQUIRED`) and routed priced-service arrangements through `POST /api/agreements/direct-service`.
  - Enforced explicit two-party approval on the exact same agreement version before a booking is confirmed (`status = 'accepted'`, linked via `bookings.agreement_id`).
  - Enforced versioned agreement editing (`PUT /api/agreements/:id` marks version $N$ as `'superseded'`, inserts version $N+1$ linked via `previous_agreement_id`, and resets both `client_approved_at` and `gardener_approved_at` to `NULL`).
  - Protected all agreement writes with parent-inquiry `SELECT ... FOR UPDATE` serialization, stale-version rejection (`409`), duplicate-approval rejection (`409`), schedule conflict checks, and atomic rollback on mid-transaction failures (verified by `backend/tests/r3.agreements.test.js`, `5/5` comprehensive suites including `Promise.all` concurrency tests passing on `hugatiera_db_migration_test`).
- Implemented Step R4 Case 2 Direct Service Provider Inquiry end-to-end (`backend/controllers/inquiry.controller.js`, `backend/routes/inquiry.routes.js`, `frontend/src/services/inquiries.js`, `frontend/src/pages/GardenerPage.jsx`, `frontend/src/pages/InquiryPage.jsx`, `backend/tests/r4.directInquiry.test.js`):
  - Supported Case 2 direct inquiries initiated either from a specific service (`?serviceId=`) or directly from a gardener profile (`?gardenerId=`), with optional category, AI-assisted requirement summary (`aiSummary`), expiration period (`expiresInDays`), and transactional attachment of uploaded draft photos (`imageIds` via `attachImagesToInquiry`).
  - Enforced strict Case 2 authorization so only an approved gardener who is the targeted `inquiry.gardener_id` can view or respond to a direct inquiry, and blocked unapproved/inactive providers or mismatched service-provider pairs.
  - Added feasibility assessment and response types (`offer`, `feasible`, `modifications`, `cannot_do`, `interest`) with required `proposedChanges` validation for `modifications`, offer revision history (`PUT /api/inquiries/quotations/:quotationId` snapshotting prior versions into `quotation_revisions`), and offer withdrawal (`POST /api/inquiries/quotations/:quotationId/withdraw`) before acceptance.
  - Enforced offer locking (`locked_at = NOW()`) and `status = 'provider_selected'` (`booking = null`) upon client acceptance, blocking `cannot_do` acceptance (`409`) and preventing unilateral offer revisions or withdrawals after acceptance (`409`).
  - Implemented lazy request expiration (`checkAndPersistLazyExpiry`) that transitions `open`/`responded` inquiries past `expires_at` to `expired` while preserving inquiries already in `provider_selected`, `in_agreement`, or `confirmed`.
  - Verified with `backend/tests/r4.directInquiry.test.js` (`6/6` suites passing, `36/36` total backend tests passing across `integration`, `r2`, `r3`, and `r4`).

## Database Status
- Original working database `hugatiera_db` remains untouched with 14 tables (backed up to `database/backups/hugatiera_db_pre_R1_20261111.sql`, git-ignored).
- Additive migration (`database/migrations/001_unified_requests_and_agreements.sql`), structural rollback (`database/migrations/001_unified_requests_and_agreements_rollback.sql`), and updated fresh-install schema (`database/schema/hugatiera_schema.sql`, 19 tables) have been rehearsed and verified against the separate test database `hugatiera_db_migration_test` on MariaDB 10.4.32.
- Schema documentation and updated Mermaid ER diagram are in `database/README.md`.

## Known Issues
- Live Gemini generation has never been verified; it requires a valid `GEMINI_API_KEY` in `backend/.env`, and the model name must be confirmed against the live API.
- Responsive layouts, administrator success-path UI, and real-account notification delivery still need manual verification.
- Direct booking creation bypassing mutual agreement has been retired (`POST /api/bookings` returns `409 MUTUAL_AGREEMENT_REQUIRED`); both inquiry-based and priced-service arrangements now require explicit two-party approval of the same mutual agreement version (R3 completed).
- Uploaded portfolio images (`GET /api/portfolios/:portfolioId/image`) remain publicly viewable by design for gardener portfolios, whereas client garden photos (`/api/request-images`) now enforce magic-byte + `sharp` decode validation, EXIF/GPS removal, and authenticated access control (R2 completed).
- The AI assistant rate limit is in-memory and resets when the backend restarts (to be moved to the database in R6).
- Optional post-MVP enhancements (password-reset emails, external email/SMS notifications, a dedicated admin audit log) remain out of scope unless requested.
- Test records created by earlier manual testing remain in the local database until cleanup is approved. The automated test suites (`backend/tests/integration.test.js`, `backend/tests/r2.requestImages.test.js`, and `backend/tests/r3.agreements.test.js`) target `hugatiera_db_migration_test` exclusively and remove the records they create.
- `npm --prefix backend audit` reports 2 moderate advisories in `minimatch` (`7.0.0 - 11.0.0`, `GHSA-g3hv-75wg-m249`), a transitive dependency of `nodemon` (`devDependencies` only; `sharp` and production dependencies have 0 vulnerabilities). Resolving it via `npm audit fix --force` would downgrade `nodemon` to `3.1.11` and was intentionally not run without user approval.

## Important Development Decisions
- Use MySQL, not MongoDB.
- Use React + Vite for the frontend.
- Use Node.js + Express.js for the backend.
- Do not introduce unapproved paid services; do not enable paid Gemini billing without the user's explicit approval.
- Implement text-based AI assistance first.

### Revised system decisions (approved by the user 2026-11-10)
1. **Two workflows, one engine.** Case 1 (General Service Request: open to all approved providers) and Case 2 (Direct Service Provider Inquiry: one chosen provider) share the extended `inquiries` and `quotations` tables.
2. **Mutual agreement is required for BOTH cases.** A provider interest/offer/response, or a client acceptance, never confirms a booking. A booking is created only when both parties approve the same agreement covering scope, price, schedule, and conditions. The existing priced-service direct booking is kept but routed through this agreement step.
3. **Provider offers can be revised** until the client accepts. The latest offer is the active one and revision history is preserved. An accepted offer is locked; later changes require mutual agreement.
4. **AI scope for the first version: text and photo understanding only** (Gemini API). Paid AI image generation is postponed. The architecture must stay extensible so an image-generation provider can be added later (original and generated images stored separately, usage logged).
5. **The AI never** approves requests, selects providers, confirms bookings, sets final prices, or guarantees outcomes. AI-generated content is a client-reviewed suggestion.
6. **Data model:** extend `inquiries` and `quotations` (approved with conditions). Significant schema changes must be presented for review before implementation (proposal in the implementation plan).
7. **Photo processing:** the `sharp` library is approved (added in R2) to validate, resize, and re-encode uploads with all metadata, including GPS location, removed.
8. **Request expiry:** `inquiries.expires_at`; expired requests accept no new offers; requests already in mutual agreement are never auto-cancelled or auto-expired.
9. **Conversation access:** in Case 1 a provider may message the client only after submitting an offer.
10. **Migration safety:** back up, restore into a separate test database, rehearse there; the original database is changed only after explicit user approval.

## Revision Track Status (Phase 15 scope revision)
- [x] R0 – Decisions recorded; `masterprompt.md`, `prompts.md`, `AGENTS.md`, and this file updated.
- [x] R0b – User reviewed and approved the proposed database changes with six clarifications (sharp, `expires_at`, Case 1 conversation access, live DB inspection, transactional agreement versioning, test-DB rehearsal).
- [x] R1 (Active on `hugatiera_db_migration_test`; `hugatiera_db` kept untouched per user instruction) – Additive database migration (`001_unified_requests_and_agreements.sql`), rollback script, fresh-install schema (`hugatiera_schema.sql`), and `database/README.md` completed and verified on the test database.
- [x] R2 – Secure garden-photo upload and storage (`sharp` processing, EXIF/GPS removal, separate `originals/` and `generated/` folders, scheduled + upload-triggered orphan cleanup with DB/file consistency and disk-orphan sweep, authenticated delivery, 12/12 automated tests passing in `backend/tests/r2.requestImages.test.js`).
- [x] R3 – Mutual agreement engine; booking creation gated behind it (versioned agreements, approval reset on edit, stale-version protection, `Promise.all` concurrency serialization, atomic rollback verification, priced-service routing, `5/5` R3 suites + `13/13` Phase 15 suites passing on `hugatiera_db_migration_test`).
- [x] R4 – Case 2 (direct inquiry) end to end (direct inquiry via `serviceId` or `gardenerId`, transactional draft photo attachment & rollback, targeted-provider feasibility responses & offer revisions in `quotation_revisions`, offer withdrawal, lazy expiry, offer locking on acceptance, and transition into R3 mutual agreement; `6/6` R4 suites + `30/30` existing suites passing on `hugatiera_db_migration_test`).
- [ ] R5 – Case 1 (general request, provider board, offers, comparison) end to end.
- [ ] R6 – Gemini requirements assistant and photo understanding; provider decision-support view.
- [ ] R7 – Automated and manual testing; completes Phase 15.

## Next Tasks
- User reviews Step R4 results and confirms whether to proceed to Step R5 (Case 1: General Service Request, Provider Board, Offers & Comparison End-to-End).
- Keep `hugatiera_db` untouched and continue using `hugatiera_db_migration_test` until the user explicitly approves applying Migration 001 to `hugatiera_db`.
- Finish the pending manual Phase 15 verification (responsive layouts, live Gemini, admin UI, notifications).
- Phase 16 (Deployment and Documentation) starts only after R7 and user confirmation.