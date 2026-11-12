# HugaTiera Current Project Structure

This document describes the current implementation, not a proposed future
architecture. Update it when the actual structure changes.

## Root

```text
HugaTiera/
├── frontend/                         React + Vite application
├── backend/                          Node.js + Express REST API
├── database/                         MySQL schema and database documentation
├── docs/
│   └── implementation/
│       └── implementation-plan.md    Approved Revision Track (R0–R7) technical reference
├── prompt/                           Master prompt and phase instructions
├── project_documentation_and_requirements/
├── .gitignore
├── AGENTS.md                         Repository contribution instructions
├── README.md                         Project overview and setup
├── project_progress.md               Confirmed development progress
├── recommended_changes.md            Current audit and improvement recommendations
├── system_bug_and_missing_features.md Phase 15 bug and feature audit tracker
├── to_ask.md                         Initial review task
└── .memory/                          Local project context
```

## Frontend

```text
frontend/
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   │   └── ProtectedRoute.jsx
│   ├── context/
│   │   ├── AuthContext.jsx
│   │   └── auth-context.js
│   ├── hooks/
│   │   └── useAuth.js
│   ├── pages/
│   │   ├── AssistantPage.jsx
│   │   ├── AuthPage.jsx
│   │   ├── BookingPage.jsx
│   │   ├── CommunicationPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── GardenerPage.jsx
│   │   ├── InquiryPage.jsx
│   │   ├── ServiceDetailPage.jsx
│   │   └── ServicesPage.jsx
│   ├── services/
│   │   ├── agreements.js
│   │   ├── ai.js
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── bookings.js
│   │   ├── communication.js
│   │   ├── inquiries.js
│   │   ├── profiles.js
│   │   ├── requestImages.js
│   │   ├── reviews.js
│   │   └── services.js
│   ├── App.css
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── .env.example
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
└── vite.config.js
```

Frontend responsibilities include routing, role-specific pages, forms,
loading/error/empty states, responsive presentation, and REST API calls. The
frontend never connects directly to MySQL or the AI provider.

## Backend

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
├── app.js
├── server.js
├── .env.example
├── package.json
└── package-lock.json
```

The backend owns authentication, authorization, validation, business rules,
database access, file-upload validation, notifications, and provider
integration.

## Database

```text
database/
├── backups/                          Local SQL dumps (git-ignored)
├── migrations/
│   ├── 001_unified_requests_and_agreements.sql
│   └── 001_unified_requests_and_agreements_rollback.sql
├── schema/
│   └── hugatiera_schema.sql
└── README.md
```

The schema and additive migration define 19 tables: `users`, `client_profiles`,
`gardener_profiles`, `service_categories`, `services`, `portfolios`, `inquiries`,
`request_images`, `quotations`, `quotation_revisions`, `agreements`,
`conversations`, `messages`, `bookings`, `reviews`, `request_events`,
`ai_usage_log`, `notifications`, and `reports`.

## Current structural recommendations

- Split the large dashboard and application route components when making the
  next UI improvement pass.
- Add automated integration/browser test files in a dedicated test structure
  before Phase 15 is completed.
- Add an administrator audit table only after confirming the requirement and
  schema change with the project group.
