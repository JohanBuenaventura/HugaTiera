# HugaTiera — Gardening and Landscaping Services Platform

**HugaTiera** is a full-stack academic Software Engineering web platform designed initially for **Zamboanga City, Philippines**. It connects clients who need gardening, landscaping, plant care, and garden maintenance services with local gardeners who provide those services.

HugaTiera is a **services marketplace and coordination platform**, not an e-commerce store for physical gardening products. It combines structured service discovery, portfolio showcases, **AI-assisted garden requirement and photo understanding**, a **unified two-workflow request engine** (Case 1 General Service Requests and Case 2 Direct Service Provider Inquiries), **versioned mutual agreements**, booking lifecycle tracking, in-app messaging, ratings and reviews, and administrator moderation.

---

## 1. Main Problems Addressed

1. **Fragmented Local Gardener Discovery:** Clients in Zamboanga City often rely on informal word-of-mouth to find reliable gardeners without clear visibility into service areas, experience, portfolios, or verified reviews.
2. **Unclear Garden Service Requirements:** Clients frequently struggle to articulate garden dimensions, sunlight/drainage conditions, and scope of work before requesting quotes.
3. **Lack of Structured Agreement Before Service Confirmation:** Informal chat arrangements often lead to misunderstandings over scope, pricing, schedule, or location. HugaTiera enforces an explicit **versioned mutual agreement** that both client and gardener must approve before any booking is confirmed.

---

## 2. Implemented Features

- **Role-Based Authentication, 3-Step Registration & Security:**
  - Guided **3-step registration wizard** (`1. About you` → `2. Details` → `3. Account`) with **2 public role cards** (**Find a gardener** for Client, and **Offer services** for Gardener — which automatically includes Client mode and sidebar 1-click switching), optional middle name, 18+ birthday/age validation, and mobile validation.
  - **Provider-Managed Clerks:** Public `administrator` and `clerk` self-registration are strictly blocked (`400`); Gardeners create, link, and revoke Assigned Clerk staff inside **Dashboard → My Clerks** (`GardenerClerksPanel.jsx`).
  - `bcryptjs` password hashing, `HttpOnly` JWT cookies (`auth_token`), sliding-window auth rate limiting, security headers, and live account status verification (`users.is_active = TRUE`) on every protected request.
- **Public Marketplace & Gardener Portfolios:**
  - Keyword, category, and service-area filtering with sorting (`newest`, `price_low`, `price_high`) and pagination (`/services`).
  - Public visibility gated by administrator gardener approval (`gardener_profiles.is_approved = TRUE`).
  - Gardener portfolio photo uploads with magic-byte validation (`JPEG`, `PNG`, `WebP`, up to 5 MB), metadata editing, and public gallery display alongside verified star ratings (`/gardeners/:gardenerId`).
  - Automatic full-name fallback (`first_name + last_name`) whenever a gardener's `business_name` is optional/empty (`ISS-04`).
- **Secure Garden Photo Uploads (`Step R2` & `ISS-01`):**
  - Client garden photo uploads (`POST /api/request-images`) decoded, auto-oriented, resized within `1920×1920`, and re-encoded via `sharp` with **all EXIF, GPS location, XMP, and IPTC metadata stripped**.
  - Separate storage for `originals/` and future `generated/` images, scheduled + upload-triggered 24-hour draft cleanup, and authenticated delivery (`GET /api/request-images/:imageId`).
- **Unified Request Engine — Case 1 & Case 2 (`Steps R4 & R5`):**
  - **Case 1 (General Service Request):** Clients post an open request (`request_type = 'general'`) with up to 5 garden photos and an optional validity window (`7`, `14`, or `30` days). Approved gardeners browse the **Open Service Requests Board** (`GET /api/inquiries/open` with area-level privacy), submit offers, and revise or withdraw offers before client acceptance. Clients compare competing offers side by side with provider ratings, completed bookings, experience, and portfolio previews.
  - **Case 2 (Direct Service Provider Inquiry):** Clients send a direct inquiry (`request_type = 'direct'`) to a specific approved gardener or service listing. The targeted gardener evaluates feasibility and responds with `offer`, `feasible`, `modifications` (with proposed changes), or `cannot_do`.
  - **Offer Revisions & Locking:** Superseded offer revisions are preserved in `quotation_revisions`. Accepting an offer sets `locked_at = NOW()` and transitions the inquiry to `'provider_selected'`.
- **Versioned Mutual Agreement Engine (`Step R3` & `ISS-09`):**
  - Neither an inquiry, offer, nor offer acceptance automatically creates a booking (`POST /api/bookings` returns `409 MUTUAL_AGREEMENT_REQUIRED`).
  - Both Case 1 and Case 2 (plus priced-service requests via `POST /api/agreements/direct-service`) require a **Mutual Agreement** (`agreements` table) specifying `scope_of_work`, `amount`, `price_basis`, `scheduled_start`, `scheduled_end`, `location`, and `conditions`.
  - Editing a proposed agreement creates version $N+1$ (`previous_agreement_id`) and resets counterparty approval.
  - Only when **both** client and gardener approve the **same version** does the backend atomically verify schedule conflicts, mark the agreement `'agreed'`, create the confirmed booking (`status = 'accepted'`), mark the inquiry `'confirmed'`, and decline competing open offers.
  - Booking detail pages display a read-only **Mutual Agreement Summary** panel (`ISS-09`).
- **Gemini AI Garden Planning Assistant (`Step R6 / R7`):**
  - Backend-mediated integration with Google Gemini (`GEMINI_MODEL=gemini-3.8-flash` primary, `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite` automatic fallback on transient `429`/`5xx`/timeout/network errors, `GEMINI_THINKING_LEVEL=low`).
  - Supports standalone tropical garden planning (`POST /api/ai/garden-plan`), structured inquiry requirement generation (`POST /api/ai/requirements`), and multimodal garden photo analysis (`POST /api/ai/photo-analysis`).
  - Concurrency-safe per-user rate limiting (`10` calls/hour via `SELECT ... FOR UPDATE` and `ai_usage_log`).
  - Provider Decision-Support View displays client-reviewed AI summaries and photo descriptions to evaluating gardeners.
- **Role-Specific Dashboards, Messaging, Notifications & Admin Moderation (`Phases 10–14` & `ISS-02`–`ISS-08`):**
  - Tabbed Client and Gardener dashboards (`Overview` vs `Profile & Settings` — `ISS-05`).
  - Administrator dashboard with live `open / total` inquiry and `completed / total` booking metrics (`ISS-06`), pending gardener approval queue, account activation toggles, category/service moderation, unassigned Case 1 activity monitoring (`ISS-02`), and report resolution.
  - In-app 1-to-1 conversations (gated on Case 1 until a gardener holds an active offer), unread notification routing badges, and human-readable workflow status badges (`ISS-08`).

---

## 3. Technology Stack

| Layer | Technology | Version / Details |
|---|---|---|
| **Frontend** | React.js + Vite | `react` `^19.3.1`, `vite` `^8.3.6`, JavaScript (ES Modules), HTML5, CSS3 |
| **Routing & UI** | React Router DOM + Lucide React | `react-router-dom` `^7.18.5`, `lucide-react` `^1.69.0`, `axios` `^1.21.0` |
| **Backend** | Node.js + Express.js | `express` `^5.3.0` (CommonJS REST API, 16 route modules, security headers & auth rate limiting) |
| **Database** | MySQL / MariaDB (`InnoDB`) | `mysql2` `^3.24.6` (`mysql2/promise` connection pool & transactions), `25` tables, `59` FKs, Migrations `001`–`013` |
| **Authentication** | JWT + bcryptjs | `jsonwebtoken` `^9.0.2` (`HttpOnly` cookie `auth_token`), `bcryptjs` `^3.0.2`, `cookie-parser` `^1.4.7`, Dual-Role & Clerk RBAC |
| **Image Processing** | Multer + Sharp | `multer` `^2.5.0`, `sharp` `^0.35.5` (validation, resize, EXIF/GPS stripping across avatars, covers, portfolios, receipts, request photos) |
| **AI & Matching** | Google Gemini REST API + Smart Matching | Primary: `gemini-3.8-flash` \| Fallback: `gemini-3.5-flash-lite` \| Barangay proximity & conduct scoring |
| **Payments** | PayMongo Checkout + Sandbox/Demo | PayMongo Checkout API (when `PAYMONGO_SECRET_KEY` is set) + built-in Sandbox/Demo mode & manual receipt proofs |
| **Testing & Linting** | Node.js Test Runner + ESLint | `node --test` (`80/80` automated backend tests across 15 suites), `eslint` `^10.14.0` |

---

## 4. System Architecture & Workflow Overview

```mermaid
flowchart LR
  Client["Client Browser<br/>(React 19 + Vite)"] <-->|"REST API (JSON + HttpOnly Cookie)"| API["Express 5 Backend<br/>(16 Route Modules, Auth/RBAC, sharp)"]
  Gardener["Gardener & Assigned Clerk<br/>(React 19 + Vite)"] <-->|"REST API (JSON + HttpOnly Cookie)"| API
  Admin["Administrator Browser<br/>(React 19 + Vite)"] <-->|"REST API (JSON + HttpOnly Cookie)"| API
  API <-->|"Parameterized SQL & Transactions"| DB[("MySQL / MariaDB<br/>hugatiera_db (25 Tables, 59 FKs)")]
  API <-->|"Sanitized Files"| Uploads[("backend/uploads/<br/>avatars, services, portfolios, receipts, request-images")]
  API <-->|"HTTPS (Backend Keys Only)"| External["Google Gemini API &<br/>PayMongo Checkout / Sandbox"]
```

### Unified Request-to-Confirmation Workflow
```mermaid
flowchart LR
  A["1. Client Creates Request<br/>Case 1 (General) or Case 2 (Direct)<br/>+ Specs, Estimator, Photos & AI"] --> B["2. Gardener Submits Offer<br/>or Feasibility Response<br/>(Itemized; Revisable while 'sent')"]
  B --> C["3. Client Accepts Offer<br/>(Offer Locked; Status:<br/>'provider_selected')"]
  C --> D["4. Mutual Agreement (v1..vN)<br/>Scope, Price, Deposit, Schedule<br/>(Status: 'in_agreement')"]
  D --> E["5. Both Approve Same Version<br/>(Reservation Created:<br/>'accepted' / 'reserved')"]
  E --> F["6. Deposit Verified (TXN-...)<br/>PayMongo / Sandbox / Receipt<br/>(Confirmed: 'booked')"]
  F --> G["7. Execution, Closure & Review<br/>('in_progress' -> 'completed'<br/>-> 'fully_paid' & 'closed' -> Review)"]
```

---

## 5. Application Modules & Frontend Routes

| Frontend Route | Access | Component (`frontend/src/`) | Purpose |
|---|---|---|---|
| `/` | Public | `App.jsx` (`LandingPage`) | Hero section, live categories, featured approved services, workflow guide, AI preview, and auth-aware floating message button (`ISS-07`). |
| `/services` | Public | `pages/ServicesPage.jsx` | Marketplace search, category/area filter, sort, and pagination. |
| `/services/:serviceId` | Public | `pages/ServiceDetailPage.jsx` | Service details, gardener summary, direct inquiry link, priced-service agreement modal, and report form. |
| `/gardeners/:gardenerId` | Public | `pages/GardenerPage.jsx` | Approved gardener profile, active services, portfolio gallery, reviews, direct inquiry action, and report form. |
| `/login`, `/register` | Public | `pages/AuthPage.jsx` | Sign-in (with password visibility toggle and smart recent-email quick fill) and a **2-card, 3-step registration wizard** (**Find a gardener** for Client, **Offer services** for Gardener with built-in Client mode; Clerk accounts are provider-managed inside **My Clerks**). |
| `/dashboard` | Protected (`client`, `gardener`, `clerk`, `administrator`) | `pages/DashboardPage.jsx` | Role-specific dashboard: Client discovery showcase with live category dropdown & Smart AI matching, Gardener schedule calendar, service covers, portfolios & **My Clerks** staff management, Assigned Clerk operations desk (`ClerkDashboard`), and separated Administrator tabs (`Overview`, `Analytics`, `Approvals`, `Activity`, `Reports`, `Accounts`). |
| `/inquiries` | Protected (`client`, `gardener`) | `pages/InquiryPage.jsx` (`InquiriesPage`) | Client request list or Gardener assigned inquiries + Open Service Requests Board tab. |
| `/inquiries/new` | Protected (`client`) | `pages/InquiryPage.jsx` (`InquiryFormPage`) | Case 1 / Case 2 request creation wizard with garden photo upload, AI photo analysis, and AI requirement assistant. |
| `/inquiries/:inquiryId` | Protected (`client`, `gardener`, `administrator`) | `pages/InquiryPage.jsx` (`InquiryDetailPage`) | Provider Decision-Support View, offer submission/revision/comparison, R3 Mutual Agreement workspace, and event timeline. |
| `/bookings` | Protected (`client`, `gardener`) | `pages/BookingPage.jsx` (`BookingsPage`) | Confirmed and historical bookings list with agreement version badges. |
| `/bookings/new` | Protected (`client`) | `pages/BookingPage.jsx` (`BookingFormPage`) | Redirects/guides users to the R3 Mutual Agreement workflow on the inquiry or service page. |
| `/bookings/:bookingId` | Protected (`client`, `gardener`) | `pages/BookingPage.jsx` (`BookingDetailPage`) | Booking execution controls, read-only **Mutual Agreement Summary** (`ISS-09`), conversation launcher, and post-completion review form. |
| `/profile` | Protected (`client`, `gardener`) | `pages/DashboardPage.jsx` (`profileView`) | Account profile, structured billing-style address, working schedule/crew settings, and avatar upload. |
| `/messages` | Protected (`client`, `gardener`) | `pages/CommunicationPage.jsx` | 1-to-1 conversation inbox and message threads. |
| `/notifications` | Protected (`client`, `gardener`, `clerk`, `administrator`) | `pages/CommunicationPage.jsx` | Compact activity notifications feed with `All`/`Unread` filters and role-aware deep-link routing. |
| `/assistant` | Protected (All roles) | `pages/AssistantPage.jsx` | Standalone AI Garden Planning Assistant with quota display and safety disclaimer. |

---

## 6. Installation & Local Setup Instructions

### 6.1 Prerequisites
- **Node.js** (v20+ LTS recommended) and **npm**
- **XAMPP** (MariaDB 10.4.32 / MySQL on port `3306`)
- **Git** and **Visual Studio Code**

### 6.2 Clone and Install Dependencies
```powershell
git clone <repository-url>
cd HugaTiera

# Install backend dependencies
npm --prefix backend install

# Install frontend dependencies
npm --prefix frontend install
```

### 6.3 Environment Configuration

Create `backend/.env` (using [backend/.env.example](file:///c:/xampp/htdocs/HugaTiera/backend/.env.example) as a template):
```env
PORT=5000
FRONTEND_URL=http://localhost:5173
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=hugatiera_db
JWT_SECRET=replace_with_a_long_random_secret_key
JWT_EXPIRES_IN=1d
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
GEMINI_THINKING_LEVEL=low
AI_HOURLY_LIMIT=10
PAYMONGO_SECRET_KEY=
```

Create `frontend/.env` (using [frontend/.env.example](file:///c:/xampp/htdocs/HugaTiera/frontend/.env.example) as a template):
```env
VITE_API_URL=http://localhost:5000/api
```

> [!WARNING]
> Never commit `backend/.env` or `frontend/.env` to Git, and never expose `GEMINI_API_KEY`, `PAYMONGO_SECRET_KEY`, `JWT_SECRET`, or database credentials in frontend variables.

---

## 7. Database Setup & Migrations `001`–`013` Status

### 7.1 Fresh Database Installation
If setting up HugaTiera on a new machine without an existing `hugatiera_db` database, start MySQL in XAMPP and import [database/schema/hugatiera_schema.sql](file:///c:/xampp/htdocs/HugaTiera/database/schema/hugatiera_schema.sql), which creates `hugatiera_db` with all **25 tables** and **59 foreign keys**:
```powershell
c:\xampp\mysql\bin\mysql.exe -u root < database/schema/hugatiera_schema.sql
```

### 7.2 Existing Database & Migration Record
- Incremental migrations `001` through `013` (each paired with a `_rollback.sql` script in `database/migrations/`) have been applied and verified on both `hugatiera_db_migration_test` and local `hugatiera_db` (`25` tables, `59` foreign keys), with pre-migration backups preserved in `database/backups/`.
- **Do NOT rerun already-applied migrations against `hugatiera_db`.**
- Full table-by-table documentation, the 25-table ERD, Level 0–2 DFDs, and migration history are in [database/README.md](file:///c:/xampp/htdocs/HugaTiera/database/README.md) and [docs/erd-and-dfd.md](file:///c:/xampp/htdocs/HugaTiera/docs/erd-and-dfd.md).

---

## 8. Running & Testing the Application

### 8.1 Start the Backend and Frontend Servers
```powershell
# Optional: seed role demo accounts (backend script)
npm --prefix backend run seed:demo

# Optional: import idempotent Zamboanga City showcase providers/services into local hugatiera_db
Get-Content -Raw database\seeds\zamboanga_demo_data.sql | c:\xampp\mysql\bin\mysql.exe -u root hugatiera_db

# Terminal 1 — Start the Express backend on http://localhost:5000
npm --prefix backend run dev

# Terminal 2 — Start the Vite React frontend on http://localhost:5173
npm --prefix frontend run dev
```

Verify backend and database health at `http://localhost:5000/api/health`.

### 8.2 Frontend Lint & Production Build
```powershell
npm --prefix frontend run lint
npm --prefix frontend run build
```

### 8.3 Automated Backend Test Suites (15 Suites / `80` Tests)
All automated backend test suites run sequentially against the dedicated test database **`hugatiera_db_migration_test`** (`DB_NAME=hugatiera_db_migration_test`) so `hugatiera_db` is never modified:
```powershell
$env:DB_NAME="hugatiera_db_migration_test"
node --test --test-concurrency=1 `
  backend/tests/integration.test.js `
  backend/tests/avatarsServicesAdmin.test.js `
  backend/tests/registrationBasicInfo.test.js `
  backend/tests/inquiryPriceEstimator.test.js `
  backend/tests/schedulingAvailability.test.js `
  backend/tests/reservationPayments.test.js `
  backend/tests/cancellationReschedule.test.js `
  backend/tests/smartAiRecommendations.test.js `
  backend/tests/dualRoleAndClerk.test.js `
  backend/tests/paymentGateway.test.js `
  backend/tests/r2.requestImages.test.js `
  backend/tests/r3.agreements.test.js `
  backend/tests/r4.directInquiry.test.js `
  backend/tests/r5.generalRequest.test.js `
  backend/tests/r6.aiAssistance.test.js
```

---

## 9. Security, Privacy & Scope Notes

- **Photo Privacy:** Client garden photos, avatars, service cover photos, portfolios, and payment receipts are validated with magic-byte checks and `sharp` EXIF/GPS stripping before disk storage and are never served from an unrestricted public static directory. The Open Service Requests Board exposes only area-level location and client first name; exact street addresses are shared inside the mutual agreement.
- **SQL Injection, Rate Limiting & Access Control:** Every database query uses parameterized `mysql2` placeholders (`?`), auth endpoints enforce rate limits, and every protected endpoint verifies authentication, live `users.is_active = TRUE`, role permissions (`client`, `gardener`, `clerk`, `administrator`), and resource ownership.
- **Payments & Postponed Scope:** Reservation deposit gating, manual payment proofs, and PayMongo Checkout (with automatic Sandbox/Demo fallback when `PAYMONGO_SECRET_KEY` is blank) are implemented on `main`. Physical gardening product e-commerce, live GPS tracking, payroll, native mobile apps, and paid AI image generation (`501 IMAGE_GENERATION_POSTPONED`) remain out of scope.

---

## 10. Documentation Index

| Document | Description |
|---|---|
| [README.md](file:///c:/xampp/htdocs/HugaTiera/README.md) | Main project overview, setup, testing, and quick reference (this file). |
| [docs/system-functionalities.md](file:///c:/xampp/htdocs/HugaTiera/docs/system-functionalities.md) | Complete role-by-role catalog of every implemented feature across Public, Client, Gardener (including **My Clerks**), Assigned Clerk, Administrator, and AI modules. |
| [TEAM_SYNC_GUIDE.md](file:///c:/xampp/htdocs/HugaTiera/TEAM_SYNC_GUIDE.md) | Teammate & AI agent sync checklist (branch rules, DB migration checks, `.env` sync, and common error fixes). |
| [database/README.md](file:///c:/xampp/htdocs/HugaTiera/database/README.md) | Authoritative 25-table schema reference, 59 FKs, and Migrations `001`–`013` record. |
| [docs/erd-and-dfd.md](file:///c:/xampp/htdocs/HugaTiera/docs/erd-and-dfd.md) | Full 25-table Mermaid ERD and Level 0 / Level 1 / Level 2 DFDs. |
| [docs/architecture-and-workflows.md](file:///c:/xampp/htdocs/HugaTiera/docs/architecture-and-workflows.md) | System architecture, Client/Gardener/Clerk/Admin workflows, Case 1 vs Case 2 + Agreement/Payment flows, and Gemini AI fallback design. |
| [docs/api-reference.md](file:///c:/xampp/htdocs/HugaTiera/docs/api-reference.md) | Complete REST API endpoint documentation across all 16 route modules. |
| [docs/implementation/implementation-plan.md](file:///c:/xampp/htdocs/HugaTiera/docs/implementation/implementation-plan.md) | Revision Track R0–R7 technical specification and state machine rules. |
| [project_progress.md](file:///c:/xampp/htdocs/HugaTiera/project_progress.md) | Chronological project progress tracker, completed phases/revisions, and verification records. |
| [system_bug_and_missing_features.md](file:///c:/xampp/htdocs/HugaTiera/system_bug_and_missing_features.md) | Resolved Phase 15 bugs, audit items, and verified scope boundaries. |
| [folder_structure.md](file:///c:/xampp/htdocs/HugaTiera/folder_structure.md) | Verified directory and file tree of the repository. |
| [backend/readme.md](file:///c:/xampp/htdocs/HugaTiera/backend/readme.md) | Backend-specific setup, scripts, and module summary. |
| [frontend/README.md](file:///c:/xampp/htdocs/HugaTiera/frontend/README.md) | Frontend-specific setup, scripts, and structure summary. |
