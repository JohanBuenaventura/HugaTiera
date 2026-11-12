# HugaTiera — Backend API (`backend/`)

The Node.js + Express 5 REST API backend for **HugaTiera**, providing authentication, role-based access control, unified Case 1 / Case 2 service requests, versioned mutual agreements, `sharp`-sanitized image uploads, Gemini AI text & photo assistance, and MySQL persistence.

---

## 1. Technology Stack

- **Node.js & Express.js (`^5.3.0`):** REST API server (`CommonJS`)
- **MySQL2 (`^3.24.6`):** `mysql2/promise` connection pool, parameterized SQL, and ACID transactions
- **Authentication:** `jsonwebtoken` (`^9.0.2`), `bcryptjs` (`^3.0.2`), `cookie-parser` (`^1.4.7`)
- **Image Processing:** `multer` (`^2.5.0`) + `sharp` (`^0.35.5`) for image decoding, `1920×1920` resizing, and complete EXIF/GPS metadata removal
- **AI Integration:** Google Gemini REST API (`gemini-3.8-flash` primary, `gemini-3.5-flash-lite` automatic fallback)

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
JWT_SECRET=replace_with_a_long_random_secret_key
GEMINI_API_KEY=replace_with_your_gemini_api_key
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
GEMINI_THINKING_LEVEL=low
AI_HOURLY_LIMIT=10
```

---

## 3. Available npm Scripts

| Command | Description |
|---|---|
| `npm install` | Install backend dependencies |
| `npm run dev` | Start development server with Nodemon (`http://localhost:5000`) |
| `npm start` | Start Express server (`node server.js`) |
| `npm test` | Run core integration test suite (`tests/integration.test.js`) |
| `npm run test:r2` | Run Step R2 garden photo upload & access control tests |
| `npm run test:r3` | Run Step R3 mutual agreement engine & concurrency tests |
| `npm run test:r4` | Run Step R4 Case 2 direct inquiry tests |
| `npm run test:r5` | Run Step R5 Case 1 general service request tests |
| `npm run test:r6` | Run Step R6/R7 Gemini AI assistance, fallback, & rate-limit tests |

> **Important:** Always set `DB_NAME=hugatiera_db_migration_test` when running automated tests so the production database (`hugatiera_db`) is not modified.

---

## 4. Registered API Route Modules (`backend/app.js`)

For full request/response schemas and authorization rules, see [docs/api-reference.md](file:///c:/xampp/htdocs/HugaTiera/docs/api-reference.md).

- `GET /api/health` — Server and MySQL connectivity check (`health.routes.js`)
- `/api/auth` — `register`, `login`, `logout`, `me`, `administrator-check` (`auth.routes.js`)
- `/api/profiles` — `GET/PUT /me`, `POST /reports` (`profile.routes.js`)
- `/api/services` — Public search, categories, service detail, and gardener service CRUD (`service.routes.js`)
- `/api/gardeners` — `GET /:gardenerId` public gardener profile, portfolio, and rating summary (`gardener.routes.js`)
- `/api/portfolios` — Portfolio photo upload, public image delivery, edit, and delete (`portfolio.routes.js`)
- `/api/request-images` — `sharp` EXIF-stripped garden photo upload, authenticated delivery, description update, and draft deletion (`requestImage.routes.js`)
- `/api/inquiries` — Case 1 & Case 2 requests, Open Requests Board (`/open`), request renewal, quotations, revisions, withdrawal, and acceptance (`inquiry.routes.js`)
- `/api/agreements` — Versioned mutual agreements, priced-service direct agreement proposal (`/direct-service`), edits, two-party approval, and cancellation (`agreement.routes.js`)
- `/api/bookings` — Confirmed booking list, detail (with Mutual Agreement Summary), and status progression (`booking.routes.js`; direct `POST /api/bookings` returns `409 MUTUAL_AGREEMENT_REQUIRED`)
- `/api/reviews` — Public gardener reviews and completed-booking client review creation (`review.routes.js`)
- `/api/conversations` — 1-to-1 conversations (with Case 1 active-offer gating) and messages (`conversation.routes.js`)
- `/api/notifications` — In-app notification list and mark-read endpoints (`notification.routes.js`)
- `/api/ai` — `GET /usage`, `POST /garden-plan`, `POST /requirements`, `POST /photo-analysis` (`ai.routes.js`)
- `/api/admin` — Platform summary metrics, user activation, pending gardener approval queue, category/service moderation, activity monitor, and report resolution (`admin.routes.js`)

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
│   └── upload.middleware.js
├── routes/
│   ├── admin.routes.js
│   ├── agreement.routes.js
│   ├── ai.routes.js
│   ├── auth.routes.js
│   ├── booking.routes.js
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
├── services/
│   ├── ai.service.js
│   └── notification.service.js
├── tests/
│   ├── integration.test.js
│   ├── r2.requestImages.test.js
│   ├── r3.agreements.test.js
│   ├── r4.directInquiry.test.js
│   ├── r5.generalRequest.test.js
│   └── r6.aiAssistance.test.js
├── uploads/
│   ├── portfolios/
│   └── request-images/
│       ├── originals/
│       └── generated/
├── .env.example
├── app.js
├── package.json
├── package-lock.json
├── readme.md
└── server.js
```
