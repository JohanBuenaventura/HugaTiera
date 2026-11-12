# HugaTiera – Folder Structure

This document reflects the **actual current repository structure** of HugaTiera (verified November 12, 2026).

```text
HugaTiera/
├── backend/
│   ├── config/
│   │   └── database.js
│   ├── controllers/
│   │   ├── admin.controller.js
│   │   ├── agreement.controller.js
│   │   ├── ai.controller.js
│   │   ├── auth.controller.js
│   │   ├── booking.controller.js
│   │   ├── conversation.controller.js
│   │   ├── inquiry.controller.js
│   │   ├── notification.controller.js
│   │   ├── portfolio.controller.js
│   │   ├── profile.controller.js
│   │   ├── requestImage.controller.js
│   │   ├── review.controller.js
│   │   └── service.controller.js
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   └── upload.middleware.js
│   ├── routes/
│   │   ├── admin.routes.js
│   │   ├── agreement.routes.js
│   │   ├── ai.routes.js
│   │   ├── auth.routes.js
│   │   ├── booking.routes.js
│   │   ├── conversation.routes.js
│   │   ├── gardener.routes.js
│   │   ├── health.routes.js
│   │   ├── inquiry.routes.js
│   │   ├── notification.routes.js
│   │   ├── portfolio.routes.js
│   │   ├── profile.routes.js
│   │   ├── requestImage.routes.js
│   │   ├── review.routes.js
│   │   └── service.routes.js
│   ├── services/
│   │   ├── ai.service.js
│   │   └── notification.service.js
│   ├── tests/
│   │   ├── integration.test.js
│   │   ├── r2.requestImages.test.js
│   │   ├── r3.agreements.test.js
│   │   ├── r4.directInquiry.test.js
│   │   ├── r5.generalRequest.test.js
│   │   └── r6.aiAssistance.test.js
│   ├── uploads/
│   │   ├── portfolios/
│   │   └── request-images/
│   │       ├── originals/
│   │       └── generated/
│   ├── .env.example
│   ├── app.js
│   ├── package.json
│   ├── package-lock.json
│   ├── readme.md
│   └── server.js
│
├── database/
│   ├── backups/
│   ├── migrations/
│   │   ├── 001_unified_requests_and_agreements.sql
│   │   └── 001_unified_requests_and_agreements_rollback.sql
│   ├── schema/
│   │   └── hugatiera_schema.sql
│   └── README.md
│
├── docs/
│   ├── implementation/
│   │   └── implementation-plan.md
│   ├── api-reference.md
│   └── architecture-and-workflows.md
│
├── frontend/
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── assets/
│   │   │   ├── hero.png
│   │   │   ├── react.svg
│   │   │   └── vite.svg
│   │   ├── components/
│   │   │   └── ProtectedRoute.jsx
│   │   ├── context/
│   │   │   ├── AuthContext.jsx
│   │   │   └── auth-context.js
│   │   ├── pages/
│   │   │   ├── AssistantPage.jsx
│   │   │   ├── AuthPage.jsx
│   │   │   ├── BookingPage.jsx
│   │   │   ├── CommunicationPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── GardenerPage.jsx
│   │   │   ├── InquiryPage.jsx
│   │   │   ├── ServiceDetailPage.jsx
│   │   │   └── ServicesPage.jsx
│   │   ├── services/
│   │   │   ├── agreements.js
│   │   │   ├── ai.js
│   │   │   ├── api.js
│   │   │   ├── auth.js
│   │   │   ├── bookings.js
│   │   │   ├── communication.js
│   │   │   ├── inquiries.js
│   │   │   ├── profiles.js
│   │   │   ├── requestImages.js
│   │   │   └── services.js
│   │   ├── App.css
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── .env.example
│   ├── eslint.config.js
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── README.md
│   └── vite.config.js
│
├── prompt/
│   ├── masterprompt.md
│   ├── phase.md
│   ├── prompts.md
│   └── reusable_prompt.md
│
├── .gitignore
├── AGENTS.md
├── folder_structure.md
├── project_progress.md
├── README.md
├── recommended_changes.md
└── system_bug_and_missing_features.md
```

## Notes
- `node_modules/`, `frontend/dist/`, `backend/.env`, `frontend/.env`, `backend/uploads/portfolios/*`, `backend/uploads/request-images/*`, and `database/backups/*.sql` are excluded by `.gitignore`.
- Every path documented in the tree above exists in the repository.
