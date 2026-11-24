# HugaTiera — Backend API (`backend/`)

The Node.js + Express 5 REST API backend for **HugaTiera** (`main`), providing 18+ registration & dual-role/provider-managed clerk RBAC, unified Case 1 / Case 2 service requests with per-sq.m price estimation and category specs, gardener scheduling & crew capacity validation, versioned mutual agreements, reservation vs. paid booking with PayMongo/Sandbox checkout and mutual Transaction Completion Agreements, `sharp`-sanitized image uploads, Gemini AI + category-filtered smart recommendations, and MySQL persistence (`25` tables, `59` FKs).

---

## 1. Technology Stack

- **Node.js & Express.js (`^5.3.0`):** REST API server (`CommonJS`) with security headers and auth rate limiting
- **MySQL2 (`^3.24.6`):** `mysql2/promise` connection pool, parameterized SQL, and ACID transactions
- **Authentication:** `jsonwebtoken` (`^9.0.2`), `bcryptjs` (`^3.0.2`), `cookie-parser` (`^1.4.7`) (`auth_token` `HttpOnly` cookie)
- **Image Processing:** `multer` (`^2.5.0`) + `sharp` (`^0.35.5`) for image decoding, resizing, and complete EXIF/GPS metadata removal across avatars, service covers, portfolios, receipts, and request photos
- **AI Integration:** Google Gemini REST API (`gemini-3.8-flash` primary, `gemini-3.5-flash-lite` automatic fallback) + hybrid proximity/conduct ranking (`utils/smartMatching.js`)
- **Payment Gateway:** PayMongo Checkout REST integration + built-in Sandbox/Demo mode (`services/paymentGateway.service.js`)

---

## 2. Environment Configuration (`backend/.env`)

Copy [backend/.env.example](file:///c:/xampp/htdocs/HugaTiera/backend/.env.example) to `backend/.env`:

```env
PORT=5000
FRONTEND_URL=http://localhost:5173
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=hugatiera_db
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=1d
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
GEMINI_THINKING_LEVEL=low
AI_HOURLY_LIMIT=10
PAYMONGO_SECRET_KEY=
```

---

## 3. Available npm Scripts

| Command | Description |
|---|---|
| `npm install` | Install backend dependencies |
| `npm run dev` | Start development server with Nodemon (`http://localhost:5000`) |
| `npm start` | Start Express server (`node server.js`) |
| `npm run seed:demo` | Run idempotent demo data seeder (`scripts/seedDemo.js`) |
| `npm test` | Run core integration test suite (`tests/integration.test.js`) |
| `npm run test:r2` | Run Step R2 garden photo upload & access control tests |
| `npm run test:r3` | Run Step R3 mutual agreement engine & concurrency tests |
| `npm run test:r4` | Run Step R4 Case 2 direct inquiry tests |
| `npm run test:r5` | Run Step R5 Case 1 general service request tests |
| `npm run test:r6` | Run Step R6/R7 Gemini AI assistance, fallback, & rate-limit tests |

Additional feature test suites in `backend/tests/` (run via `node --test --test-concurrency=1 ...` with `DB_NAME=hugatiera_db_migration_test`):
- `avatarsServicesAdmin.test.js`
- `registrationBasicInfo.test.js`
- `inquiryPriceEstimator.test.js`
- `schedulingAvailability.test.js`
- `reservationPayments.test.js`
- `cancellationReschedule.test.js`
- `smartAiRecommendations.test.js`
- `dualRoleAndClerk.test.js`
- `paymentGateway.test.js`

> **Important:** Always set `DB_NAME=hugatiera_db_migration_test` when running automated tests so the production database (`hugatiera_db`) is not modified.

---

## 4. Registered API Route Modules (`backend/app.js` — 16 Modules)

For full request/response schemas and authorization rules, see [docs/api-reference.md](file:///c:/xampp/htdocs/HugaTiera/docs/api-reference.md).

- `GET /api/health` — Server and MySQL connectivity check (`health.routes.js`)
- `/api/auth` — `register` (18+, mobile, Client/Gardener with automatic dual-role for Gardeners; blocks public `administrator` & `clerk`), `login`, `logout`, `me`, `switch-role`, `enable-dual-role`, `administrator-check` (`auth.routes.js`)
- `/api/profiles` — `GET/PUT /me`, avatars (`/:userId/avatar`, `/me/avatar`), unavailable dates (`/me/unavailable-dates`), gardener My Clerks (`/me/clerks`), `POST /reports` (`profile.routes.js`)
- `/api/services` — Public search, categories with per-sq.m rates, `/pricing-addons`, service cover images (`/:serviceId/image`), and gardener service CRUD (`service.routes.js`)
- `/api/gardeners` — `GET /:gardenerId` public profile, `GET /:gardenerId/availability`, `POST /:gardenerId/availability/check` (`gardener.routes.js`)
- `/api/portfolios` — `sharp`-validated portfolio photo upload, public image delivery, edit, and delete (`portfolio.routes.js`)
- `/api/request-images` — `sharp` EXIF-stripped garden photo upload, authenticated delivery, description update, and draft deletion (`requestImage.routes.js`)
- `/api/inquiries` — Case 1 & Case 2 requests, Open Requests Board (`/open`), `/estimate` price predictor, request renewal, itemized quotations, revisions, withdrawal, and acceptance (`inquiry.routes.js`)
- `/api/agreements` — Versioned mutual agreements (with `required_deposit_amount` and `estimated_working_days`), priced-service direct agreement (`/direct-service`), edits, two-party approval, and cancellation (`agreement.routes.js`)
- `/api/bookings` — Reservation vs. Confirmed Paid Booking lifecycle, PayMongo/Sandbox checkout, manual payment proofs & verification, `TXN-...` codes, event cancellation & mutual reschedule requests, mutual Transaction Completion Agreement (`booking.routes.js`)
- `/api/clerk` — Assigned Clerk workspace, assigned gardener schedule/blocked dates, service toggles, and manual payment verification (`clerk.routes.js`)
- `/api/reviews` — `/recent` discovery reviews, gardener reviews, and completion-gated client review creation (`review.routes.js`)
- `/api/conversations` — 1-to-1 conversations (with Case 1 active-offer gating) and messages (`conversation.routes.js`)
- `/api/notifications` — In-app notification list and mark-read endpoints (`notification.routes.js`)
- `/api/ai` — `GET /usage`, `GET /recommendations`, `POST /recommendations/summary`, `POST /garden-plan`, `POST /requirements`, `POST /photo-analysis` (`ai.routes.js`)
- `/api/admin` — Platform summary metrics, user CRUD/role/delete, clerk assignments, pending gardener approvals, category & pricing-addon management, service moderation, activity monitor, and report resolution (`admin.routes.js`)

---

## 5. Directory Structure

```text
backend/
├── config/
│   └── database.js
├── controllers/
│   ├── admin.controller.js
│   ├── agreement.controller.js
│   ├── ai.controller.js
│   ├── auth.controller.js
│   ├── booking.controller.js
│   ├── clerk.controller.js
│   ├── conversation.controller.js
│   ├── inquiry.controller.js
│   ├── notification.controller.js
│   ├── portfolio.controller.js
│   ├── profile.controller.js
│   ├── requestImage.controller.js
│   ├── review.controller.js
│   └── service.controller.js
├── middleware/
│   ├── auth.middleware.js
│   ├── rateLimit.middleware.js
│   └── upload.middleware.js
├── routes/
│   ├── admin.routes.js
│   ├── agreement.routes.js
│   ├── ai.routes.js
│   ├── auth.routes.js
│   ├── booking.routes.js
│   ├── clerk.routes.js
│   ├── conversation.routes.js
│   ├── gardener.routes.js
│   ├── health.routes.js
│   ├── inquiry.routes.js
│   ├── notification.routes.js
│   ├── portfolio.routes.js
│   ├── profile.routes.js
│   ├── requestImage.routes.js
│   ├── review.routes.js
│   └── service.routes.js
├── scripts/
│   └── seedDemo.js
├── services/
│   ├── ai.service.js
│   ├── notification.service.js
│   └── paymentGateway.service.js
├── tests/
│   ├── avatarsServicesAdmin.test.js
│   ├── cancellationReschedule.test.js
│   ├── dualRoleAndClerk.test.js
│   ├── inquiryPriceEstimator.test.js
│   ├── integration.test.js
│   ├── paymentGateway.test.js
│   ├── r2.requestImages.test.js
│   ├── r3.agreements.test.js
│   ├── r4.directInquiry.test.js
│   ├── r5.generalRequest.test.js
│   ├── r6.aiAssistance.test.js
│   ├── registrationBasicInfo.test.js
│   ├── reservationPayments.test.js
│   ├── schedulingAvailability.test.js
│   └── smartAiRecommendations.test.js
├── uploads/
│   ├── avatars/
│   ├── payment-receipts/
│   ├── portfolios/
│   ├── request-images/
│   │   ├── originals/
│   │   └── generated/
│   └── services/
├── utils/
│   ├── priceEstimator.js
│   ├── scheduling.js
│   ├── smartMatching.js
│   └── userProfile.js
├── .env.example
├── app.js
├── package.json
├── package-lock.json
├── readme.md
└── server.js
```
