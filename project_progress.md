# HugaTiera – Project Progress

## Project Information
- Project: HugaTiera
- Frontend: React.js (`^19.3.1`) + Vite (`^8.3.6`)
- Backend: Node.js + Express.js (`^5.3.0`)
- Database: MySQL / MariaDB (`InnoDB`, `19` tables, `46` foreign keys)
- Architecture: REST API

## Current Phase
Phase: 15 – System Integration and Testing (with Revision Track R0–R7, Production Migration 001, and Post-Migration Audit Phases 1–3 completed)

Status: **Automated integration, Production Migration 001 on `hugatiera_db`, Post-Migration Audit Phases 1–3 (`ISS-01`–`ISS-10`), and comprehensive documentation synchronization completed (`53/53` automated backend tests passing, frontend lint & production build passing). Manual live-key Gemini and browser visual checks remain noted below before final Phase 15 sign-off.**

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

## Phase 15 Verification Status (accurate record)
- **Verified by execution:**
  - Frontend `npm --prefix frontend run lint` (`0` errors, `0` warnings) and `npm --prefix frontend run build` pass.
  - All 6 automated backend test suites (**`53/53` tests total**: `integration.test.js` `15/15`, `r2.requestImages.test.js` `12/12`, `r3.agreements.test.js` `5/5`, `r4.directInquiry.test.js` `6/6`, `r5.generalRequest.test.js` `6/6`, and `r6.aiAssistance.test.js` `9/9`) pass sequentially against `hugatiera_db_migration_test`.
  - Production Migration 001 executed and verified on `hugatiera_db` (`19` tables, `46` foreign keys).
- **Still pending manual verification:** live Gemini request with a real `GEMINI_API_KEY` against the live Google endpoint, and interactive browser verification of responsive layouts across physical/emulated mobile/tablet/desktop viewports.

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
- [ ] Phase 15 – System Integration and Testing (Automated suites `53/53`, Production Migration 001, and Audit Phases 1–3 `ISS-01`–`ISS-10` complete; awaiting final user sign-off)
- [ ] Phase 16 – Deployment and Documentation

## Completed Features
- Approved React + Vite, Node.js + Express.js, and MySQL architecture.
- 19-table MySQL schema in `database/schema/hugatiera_schema.sql` and Migration 001 in `database/migrations/001_unified_requests_and_agreements.sql` (applied to both `hugatiera_db_migration_test` and `hugatiera_db`).
- Backend health endpoint at `GET /api/health`.
- Client and gardener registration with validation, hashed passwords, and `HttpOnly` JWT cookies.
- Live `users.is_active = TRUE` verification in `requireAuth` so deactivated accounts immediately lose access.
- Role-specific profile retrieval, updates, and tabbed `Overview` vs `Profile & Settings` dashboards (`ISS-05`).
- Gardener service listing CRUD, portfolio upload/edit/delete, public marketplace search/filter/sort/pagination, and automatic full-name fallback when `business_name` is empty (`ISS-04`).
- Step R2 secure garden photo upload and authenticated delivery (`/api/request-images`, `sharp` resize + EXIF/GPS strip, `getRequestImageFileUrl` frontend origin resolution `ISS-01`).
- Step R3 versioned mutual agreement engine (`/api/agreements`), priced-service direct agreement routing (`POST /api/agreements/direct-service`), two-party approval gating before booking confirmation, and read-only Mutual Agreement Summary on booking details (`ISS-09`).
- Step R4 Case 2 Direct Service Provider Inquiry (feasibility responses `offer`/`feasible`/`modifications`/`cannot_do`, offer revisions in `quotation_revisions`, withdrawal, offer locking, lazy expiry).
- Step R5 Case 1 General Service Request, Open Service Requests Board (`GET /api/inquiries/open`), multi-provider offer isolation, client side-by-side comparison metrics, Case 1 conversation gating, and request renewal (`POST /api/inquiries/:inquiryId/renew`).
- Step R6/R7 Gemini Requirements Assistant (`POST /api/ai/requirements`), Uploaded-Photo Understanding (`POST /api/ai/photo-analysis`), primary (`gemini-3.8-flash`) to fallback (`gemini-3.5-flash-lite`) resilience, Provider Decision-Support View, and concurrency-safe MySQL rate limiting (`ai_usage_log`).
- Administrator moderation dashboard with `openInquiries / totalInquiries` and `completedBookings / totalBookings` metrics (`ISS-06`), unassigned Case 1 activity visibility (`ISS-02`), pending gardener approval queue, category/service moderation, and report resolution.
- Human-readable workflow status labels, distinct status badge colors, and mobile flex-wrapping (`ISS-08`).

## Database Status
- **Production Database (`hugatiera_db`):** Migrated via Migration 001 on **November 12, 2026**. Confirmed `19` tables and `46` foreign keys, with pre-migration backups preserved in `database/backups/` (git-ignored). **Do not rerun Migration 001 on `hugatiera_db`.**
- **Automated Test Database (`hugatiera_db_migration_test`):** Confirmed `19` tables and `46` foreign keys (`19/19` DDL match with `hugatiera_db`). Used exclusively by the automated backend test suites (`DB_NAME=hugatiera_db_migration_test`).
- Complete 19-table schema documentation, 46 FK summary, Mermaid ERD, and Migration 001 record are in `database/README.md`.

## Known Issues & Limitations
- Live Gemini generation requires a valid `GEMINI_API_KEY` in `backend/.env` when testing against the live Google API.
- Direct booking creation bypassing mutual agreement is retired by design (`POST /api/bookings` returns `409 MUTUAL_AGREEMENT_REQUIRED`); all new bookings are created via mutual agreement approval (`POST /api/agreements/:agreementId/approve`).
- Online payments, physical product e-commerce, GPS dispatch, and paid AI image generation (`501 IMAGE_GENERATION_POSTPONED`) remain intentionally out of scope.
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
- User reviews the updated project documentation (`README.md`, `database/README.md`, `docs/architecture-and-workflows.md`, `docs/api-reference.md`, `project_progress.md`, `system_bug_and_missing_features.md`, `folder_structure.md`).
- Perform final live browser/presentation walk-through and confirm readiness for Phase 16 sign-off.
