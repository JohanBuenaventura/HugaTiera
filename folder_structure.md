# HugaTiera Current Project Structure

This document describes the current implementation, not a proposed future
architecture. Update it when the actual structure changes.

## Root

```text
HugaTiera/
├── frontend/                         React + Vite application
├── backend/                          Node.js + Express REST API
├── database/                         MySQL schema and database documentation
├── prompt/                           Master prompt and phase instructions
├── project_documentation_and_requirements/
├── .gitignore
├── AGENTS.md                         Repository contribution instructions
├── README.md                         Project overview and setup
├── project_progress.md               Confirmed development progress
├── recommended_changes.md            Current audit and improvement recommendations
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
│   │   ├── ai.js
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── bookings.js
│   │   ├── communication.js
│   │   ├── inquiries.js
│   │   ├── profiles.js
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
│   ├── ai.controller.js
│   ├── auth.controller.js
│   ├── booking.controller.js
│   ├── conversation.controller.js
│   ├── inquiry.controller.js
│   ├── notification.controller.js
│   ├── portfolio.controller.js
│   ├── profile.controller.js
│   ├── review.controller.js
│   └── service.controller.js
├── middleware/
│   ├── auth.middleware.js
│   └── upload.middleware.js
├── routes/
│   ├── admin.routes.js
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
│   ├── review.routes.js
│   └── service.routes.js
├── services/
│   ├── ai.service.js
│   └── notification.service.js
├── uploads/
│   └── portfolios/
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
├── schema/
│   └── hugatiera_schema.sql
└── README.md
```

The schema currently defines users, role profiles, service categories,
services, portfolios, inquiries, quotations, conversations, messages,
bookings, reviews, notifications, and reports.

## Current structural recommendations

- Split the large dashboard and application route components when making the
  next UI improvement pass.
- Add automated integration/browser test files in a dedicated test structure
  before Phase 15 is completed.
- Add an administrator audit table only after confirming the requirement and
  schema change with the project group.

