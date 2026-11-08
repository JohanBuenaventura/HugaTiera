# HugaTiera Development Roadmap

This is the high-level roadmap for HugaTiera. Detailed requirements are in
[`prompts.md`](./prompts.md), and the approved project direction is in
[`masterprompt.md`](./masterprompt.md).

## Approved technology direction

- Frontend: React, Vite, JavaScript, HTML5, and CSS3
- Backend: Node.js, Express.js, and JavaScript
- Database: MySQL using `mysql2`
- Architecture: React frontend communicating with an Express REST API
- AI: Backend-mediated text assistant with provider keys stored only in backend environment variables

MySQL is intentional. Do not replace it with MongoDB. XAMPP may be used to
run local MySQL, but PHP is not part of the application backend.

## Development phases

1. **Requirements and System Architecture** — finalize scope, roles, workflows, architecture, and requirements.
2. **MySQL Database Design** — design tables, relationships, constraints, indexes, and initialization scripts.
3. **Development Environment Setup** — configure React, Vite, Node.js, Express, MySQL, environment variables, and health checks.
4. **Frontend Foundation and UI Design** — build the visual foundation, reusable UI, landing page, and responsive layouts.
5. **Authentication and Authorization** — implement registration, login, logout, password hashing, cookies, protected routes, and role checks.
6. **User Profiles and Dashboards** — implement role-specific profiles and dashboard foundations using real data.
7. **Gardening Services and Portfolios** — implement gardener service CRUD, categories, portfolio uploads, and public provider views.
8. **Marketplace and Search** — implement service discovery, search, filters, sorting, pagination, and empty states.
9. **Service Inquiry and Quotation** — implement the separate inquiry and quotation workflow without automatic bookings.
10. **Messaging and Notifications** — implement conversations, messages, read tracking, and relevant notifications.
11. **Booking and Scheduling** — implement booking requests, approval, scheduling, status transitions, and conflict checks.
12. **Ratings and Reviews** — implement reviews only for eligible completed bookings, including duplicate prevention.
13. **AI Garden Planning Assistant** — implement secure backend-mediated text assistance, validation, limits, and provider error handling.
14. **Administrator Functions** — implement account, gardener approval, category, service, report, activity, and statistics management.
15. **System Integration and Testing** — test all modules, workflows, roles, validation, security, database integrity, and responsive behavior.
16. **Deployment and Documentation** — prepare deployment configuration, setup instructions, user documentation, demonstrations, and limitations.

## Cross-phase rules

1. Work on one approved phase or task at a time.
2. Inspect the existing source and documentation before editing.
3. Preserve working functionality and avoid unrelated rewrites.
4. Keep frontend, backend, and database responsibilities separate.
5. Use parameterized SQL, password hashing, server-side validation, and role-based authorization.
6. Keep secrets in environment variables and never expose them in frontend code or Git.
7. Keep inquiries, quotations, bookings, and reviews as separate workflow entities.
8. Do not add payments, wallets, e-commerce products, GPS dispatch, payroll, CAD, native mobile apps, or other excluded scope without explicit approval.
9. Test changed behavior and report only results that were actually verified.
10. Update `project_progress.md` with confirmed progress and known limitations.
11. Do not mark a phase complete until its requirements are tested and the user confirms completion.

## Source-of-truth order

When project documents disagree, use this order:

1. The user's current explicit decision.
2. The latest approved decision in `project_progress.md`.
3. `masterprompt.md`.
4. The matching numbered phase in `prompts.md`.
5. This roadmap.
6. README and structure documentation as descriptions of the implementation.
