# HugaTiera – Folder Structure

This document reflects the **actual current repository structure** of HugaTiera (verified November 25, 2026 on `mobile-res`).

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
│   │   ├── clerk.controller.js
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
│   │   ├── rateLimit.middleware.js
│   │   └── upload.middleware.js
│   ├── routes/
│   │   ├── admin.routes.js
│   │   ├── agreement.routes.js
│   │   ├── ai.routes.js
│   │   ├── auth.routes.js
│   │   ├── booking.routes.js
│   │   ├── clerk.routes.js
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
│   ├── scripts/
│   │   └── seedDemo.js
│   ├── services/
│   │   ├── ai.service.js
│   │   ├── notification.service.js
│   │   └── paymentGateway.service.js
│   ├── utils/
│   │   ├── priceEstimator.js
│   │   ├── scheduling.js
│   │   ├── smartMatching.js
│   │   └── userProfile.js
│   ├── tests/
│   │   ├── avatarsServicesAdmin.test.js
│   │   ├── cancellationReschedule.test.js
│   │   ├── dualRoleAndClerk.test.js
│   │   ├── inquiryPriceEstimator.test.js
│   │   ├── integration.test.js
│   │   ├── paymentGateway.test.js
│   │   ├── r2.requestImages.test.js
│   │   ├── r3.agreements.test.js
│   │   ├── r4.directInquiry.test.js
│   │   ├── r5.generalRequest.test.js
│   │   ├── r6.aiAssistance.test.js
│   │   ├── registrationBasicInfo.test.js
│   │   ├── reservationPayments.test.js
│   │   ├── schedulingAvailability.test.js
│   │   └── smartAiRecommendations.test.js
│   ├── uploads/
│   │   ├── avatars/
│   │   ├── payment-receipts/
│   │   ├── portfolios/
│   │   ├── request-images/
│   │   │   ├── originals/
│   │   │   └── generated/
│   │   └── services/
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
│   │   ├── 001_unified_requests_and_agreements_rollback.sql
│   │   ├── 002_avatars_service_images.sql
│   │   ├── 002_avatars_service_images_rollback.sql
│   │   ├── 003_user_basic_info.sql
│   │   ├── 003_user_basic_info_rollback.sql
│   │   ├── 004_inquiry_price_estimator.sql
│   │   ├── 004_inquiry_price_estimator_rollback.sql
│   │   ├── 005_scheduling_availability_capacity.sql
│   │   ├── 005_scheduling_availability_capacity_rollback.sql
│   │   ├── 006_itemized_pricing_settings.sql
│   │   ├── 006_itemized_pricing_settings_rollback.sql
│   │   ├── 007_reservation_payment_workflow.sql
│   │   ├── 007_reservation_payment_workflow_rollback.sql
│   │   ├── 008_transaction_completion_agreement.sql
│   │   ├── 008_transaction_completion_agreement_rollback.sql
│   │   ├── 009_event_cancellation_and_reschedule.sql
│   │   ├── 009_event_cancellation_and_reschedule_rollback.sql
│   │   ├── 010_inquiry_category_specs.sql
│   │   ├── 010_inquiry_category_specs_rollback.sql
│   │   ├── 011_crew_capacity_workers.sql
│   │   ├── 011_crew_capacity_workers_rollback.sql
│   │   ├── 012_dual_role_and_assigned_clerk.sql
│   │   ├── 012_dual_role_and_assigned_clerk_rollback.sql
│   │   ├── 013_payment_gateway_sessions.sql
│   │   └── 013_payment_gateway_sessions_rollback.sql
│   ├── schema/
│   │   └── hugatiera_schema.sql
│   ├── seeds/
│   │   └── zamboanga_demo_data.sql
│   └── README.md
│
├── docs/
│   ├── diagrams/
│   │   ├── 01-data-model-erd-25-tables.drawio
│   │   ├── 01-data-model-erd-25-tables.png
│   │   ├── 01a-erd-domain-identity-and-clerks.png
│   │   ├── 01b-erd-domain-marketplace-and-pricing.png
│   │   ├── 01c-erd-domain-requests-and-quotations.png
│   │   ├── 01d-erd-domain-agreements-bookings-payments.png
│   │   ├── 01e-erd-domain-communication-ai-governance.png
│   │   ├── 02-data-model-erd-grouped-overview.png
│   │   ├── 03-dfd-level-0-context.drawio
│   │   ├── 03-dfd-level-0-context.png
│   │   ├── 04-dfd-level-1-system.png
│   │   ├── 05-dfd-level-2-agreement-payment-closure.png
│   │   ├── 06-system-architecture-diagram.png
│   │   ├── 07-network-topology-diagram.png
│   │   ├── 08-workflow-case1-case2-agreement-payment.png
│   │   ├── 09-workflow-unified-overview.png
│   │   ├── 10-user-hierarchy-diagram.drawio
│   │   ├── 10-user-hierarchy-diagram.png
│   │   ├── 11-user-hierarchy-only.drawio
│   │   ├── 11-user-hierarchy-only.png
│   │   └── README.md
│   ├── implementation/
│   │   └── implementation-plan.md
│   ├── screenshots/
│   │   ├── mobile/          (38 responsive mobile module PNGs)
│   │   ├── web/             (38 desktop web module PNGs)
│   │   └── README.md
│   ├── ui-ux/
│   │   ├── implementation-roadmap.md
│   │   ├── mobbin-research.md
│   │   ├── project-inventory.md
│   │   ├── recommended-changes.md
│   │   └── ui-ux-audit.md
│   ├── api-reference.md
│   ├── architecture-and-workflows.md
│   ├── erd-and-dfd.md
│   └── system-functionalities.md
│
├── frontend/
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── AiAssistantWidget.jsx
│   │   │   ├── AppSidebar.jsx
│   │   │   ├── ClerkDashboard.jsx
│   │   │   ├── ErrorBoundary.jsx
│   │   │   ├── GardenerClerksPanel.jsx
│   │   │   ├── GardenerScheduleCalendar.jsx
│   │   │   ├── Modal.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   ├── StarRating.jsx
│   │   │   ├── StructuredAddressFields.jsx
│   │   │   └── TransientSuccess.jsx
│   │   ├── context/
│   │   │   ├── AuthContext.jsx
│   │   │   └── auth-context.js
│   │   ├── hooks/
│   │   │   └── useAuth.js
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
│   │   │   ├── categorySpecs.js
│   │   │   ├── clerk.js
│   │   │   ├── communication.js
│   │   │   ├── inquiries.js
│   │   │   ├── profiles.js
│   │   │   ├── requestImages.js
│   │   │   ├── reviews.js
│   │   │   └── services.js
│   │   ├── utils/
│   │   │   ├── currency.js
│   │   │   └── zamboangaAddress.js
│   │   ├── App.css
│   │   ├── App.jsx
│   │   ├── ClientGardener.css
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
├── system_bug_and_missing_features.md
└── TEAM_SYNC_GUIDE.md
```

## Notes
- `node_modules/`, `frontend/dist/`, `backend/.env`, `frontend/.env`, `backend/uploads/*`, and `database/backups/*.sql` are excluded by `.gitignore`.
- Every path documented in the tree above exists in the repository.
