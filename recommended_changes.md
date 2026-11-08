# HugaTiera System and UI Audit

Date: 2026-11-08

## Audit scope

This review compared the implemented application with:

- `prompt/masterprompt.md`
- the numbered phases in `prompt/prompts.md`
- `project_progress.md`
- the current React routes and pages
- the Express routes and MySQL schema

The workspace did not include shared browser pages or administrator credentials during this review. Therefore, the UI findings below are based on source inspection and previously executed API/build checks. A complete visual acceptance test still requires the user to provide the running frontend and test accounts.

## Important finding: gardener services are hidden until approval

The database creates new gardener profiles with `is_approved = FALSE`. Public service searches require all of the following:

- the service is active;
- the user is active;
- the gardener profile is approved;
- the category is active.

This behavior is implemented in [service.controller.js](backend/controllers/service.controller.js), and the default approval state is defined in [hugatiera_schema.sql](database/schema/hugatiera_schema.sql).

As a result, a gardener can successfully create a service, but clients will not see it on the homepage or `/services` until an administrator approves the gardener. The current administrator dashboard displays a pending-gardener count but does not provide an approval/deapproval control. The gardener dashboard also does not clearly show that the listing is pending approval.

### Recommended fix

1. Add administrator endpoints to list pending gardeners and update `gardener_profiles.is_approved`.
2. Add pending-gardener approval controls to the administrator dashboard.
3. Show the approval state in the gardener profile/dashboard:
   - `Pending administrator approval`
   - `Approved and visible`
   - `Account inactive`
4. Explain in the service-listing UI that active listings remain hidden until the gardener is approved.
5. Add a notification when an administrator approves or rejects a gardener.
6. Add an integration test proving:
   - an unapproved gardener's service is absent from public search;
   - the same service appears after approval.

Do not remove the approval filter merely to make listings visible. The filter supports the administrator moderation requirement.

## Live UI verification

The local servers were started successfully:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

The public `/services` page loaded successfully and displayed the approved Phase 15 test service returned by `GET /api/services`. The page initially showed an empty state while the request was loading, then rendered the service after the API response arrived.

The homepage does not currently load marketplace services from the backend. Its “Ideas and services” section contains static category cards, so a gardener-created service will not appear there even after approval. The real marketplace is currently `/services`.

With a logged-in client account, the following protected pages also loaded successfully:

- `/dashboard`: profile form, counts, and navigation links displayed.
- `/inquiries`: empty-state message displayed.
- `/messages`: conversation and notification empty states displayed.
- `/bookings`: booking empty-state message displayed.
- `/assistant`: authenticated assistant form and safety disclaimer displayed.

This confirms the pages are reachable, but also confirms the client dashboard is primarily a profile surface rather than a consolidated activity dashboard.

## Live gardener UI verification

An existing gardener account was tested in the shared browser:

- Gardener dashboard loaded successfully.
- The account showed 2 active service listings.
- Profile editing, service creation/editing/deactivation controls, and portfolio upload controls were visible.
- Inquiries, bookings, and messages pages loaded with their empty states.

The gardener account's database record has `is_approved = FALSE`. Its active services therefore do not appear in the public `/services` marketplace, which displayed `0 services available` during this test. This confirms the approval finding is reproducible with a real gardener account.

The gardener dashboard currently labels the services as `Active`, but does not explain that they are not publicly visible because the gardener is awaiting administrator approval. This is a high-priority UX issue.

Recommended homepage change:

- either change the homepage section to link clearly to `/services`;
- or add a small backend-backed “Featured services” section with loading, empty, and error states.

## Live homepage interaction findings

The homepage was tested at `http://localhost:5173/`.

### Non-functional message icon

The floating `Contact HugaTiera` message icon is rendered as a `<button>` but has no click handler, link, modal, or route. Clicking it produces no visible change.

Recommended implementation:

- If it is intended to open platform messaging, change it to a link that requires authentication and navigates to `/messages`.
- If it is intended for general contact, connect it to a real contact form or an approved support route.
- Add a visible tooltip and a keyboard-accessible label.
- Add a success/error state if it submits a message.
- Do not leave an interactive-looking button without behavior.

### Static homepage modules

The homepage currently contains static:

- category cards;
- avatar initials;
- process steps;
- decorative garden illustration;
- “I need a gardener” and “I offer services” buttons.

Several links only change the URL fragment:

- `Explore local services` points to `#services`, not `/services`;
- `View all services` points to `#services`, not `/services`;
- each category card's `Explore` link points to `#join`, not a filtered marketplace result;
- both join buttons point to `#services`, regardless of the user's role or authentication state;
- the footer Services link points to `#services`.

Recommended corrections:

1. Use React Router `Link` for application routes instead of plain anchors for `/services`, `/login`, `/assistant`, and dashboard pages.
2. Link each category card to `/services?categoryId=<id>` using real category IDs from the API.
3. Make “I need a gardener” link to `/services` or `/register?role=client`.
4. Make “I offer services” link to `/register?role=gardener`.
5. Replace hardcoded avatar initials with real approved provider data, or remove the claim that they represent platform users.
6. Add loading, empty, and error states to any backend-backed homepage content.
7. Keep decorative content static only when it is clearly presentation and not presented as live platform data.

## Approval-filter recommendation

Do **not** remove the approval filter. It is required by the administrator moderation workflow and prevents unapproved gardener listings from becoming public.

Instead, make the state visible:

- gardener dashboard: “Active, pending approval”;
- administrator dashboard: pending gardener approval queue;
- client marketplace empty state: explain that only approved gardeners are shown;
- service detail and profile: show only approved public records;
- notification: tell gardeners when approval changes;
- tests: verify hidden-before-approval and visible-after-approval behavior.

If the project intentionally wants immediate publication instead, that is a business-rule change requiring explicit approval and a corresponding update to the master prompt, database workflow, UI copy, and tests.

## Changes implemented from this audit

- Replaced the obsolete PHP/XAMPP 13-phase roadmap with the approved 16-phase roadmap.
- Replaced the proposed folder structure with the current actual structure.
- Corrected stale Gemini environment documentation.
- Corrected the backend README database-name typo.
- Updated the main README roadmap to reflect Phase 15 in progress.
- Changed homepage service and registration actions to real application links.
- Made the floating homepage message icon open messages for authenticated users
  and login for unauthenticated users.
- Updated marketplace empty-state text to explain approval filtering.
- Added gardener dashboard messaging for approval and public visibility status.
- Added pending-approval labels to gardener service listings.
- Added administrator endpoints and dashboard controls for reviewing pending gardener profiles.
- Added approval-change notifications for gardeners.
- Added client and gardener dashboard inquiry and booking activity panels.
- Added role-specific dashboard quick actions for exploring services and viewing inquiries.
- Added unread notification badges to dashboard navigation.
- Split unread dashboard badges by destination so inquiry, booking, and message notifications appear beside their corresponding navigation links.
- Dashboard badges now count unique unread workflow records, preventing multiple status notifications for one booking or inquiry from inflating the badge.
- Reorganized the Messages page into a wider conversation workspace with a separate full-width notifications section and improved responsive spacing.
- Added an optional direct-booking request path for approved, active services with indicative pricing; gardeners still accept every request before confirmation.
- Added clickable notification links to related inquiries, bookings, and conversations.
- Fixed service-detail inquiry navigation and invalid service-ID handling.
- Added a live homepage section showing recently added approved services.
- Made inquiry, quotation, booking, booking-status, and review notifications transactional.
- Hardened authenticated inquiry list/detail rendering so API failures show explicit errors instead of a blank page.
- Fixed the inquiry-detail React effect crash that caused a blank page when gardeners opened an inquiry.

## Recommended dashboard redesign

### Shared dashboard shell

- Add a clear dashboard navigation with active-route styling.
- Add an account menu and notification badge.
- Add a persistent “Explore services” action for clients.
- Add role-specific navigation labels instead of the same links for every role.
- Ensure mobile navigation remains usable; the current dashboard header has no mobile menu.

### Client dashboard

- Overview cards: inquiries, quotations awaiting decision, upcoming bookings, unread notifications.
- Recent inquiry list with status and “View details”.
- Upcoming bookings with date, location, and status.
- Quick actions: Explore services, Messages, Bookings, Garden Assistant.
- Empty states with direct next-step buttons.

### Gardener dashboard

- Approval status banner.
- Service visibility badges: Public, Pending approval, Inactive.
- New inquiry queue with “Respond with quotation”.
- Booking request queue with accept/decline actions.
- Unread message and notification counts.
- Recent reviews and average rating.
- Quick actions: Add service, Upload portfolio, View inquiries, View bookings, Messages.

### Administrator dashboard

- Pending gardener approval queue with approve and request-changes actions.
- Account moderation with confirmation dialogs.
- Category and service moderation.
- Activity and report review.
- Dedicated audit log for important changes.
- Clear success/error feedback after every administrative action.

The current request-changes action keeps the profile unapproved and hidden, then
sends optional administrator feedback to the gardener. A separate persisted
rejection status can be added later if the database workflow needs to distinguish
rejected profiles from profiles awaiting their first review.

## Recommended functional improvements

### Marketplace

- Use real category data on the homepage and marketplace.
- Explain approval filtering in empty states.
- Add “approved provider” or “verified” status only if the approval meaning is clearly documented.
- Add service-card loading skeletons.
- Preserve search, category, area, sorting, and pagination.

### Inquiry and quotation workflow

- Add dashboard shortcuts to pending inquiries and quotations.
- Show quotation status and expiration clearly.
- Prevent duplicate or stale actions with disabled buttons and server responses.
- Keep inquiry-to-booking separation unchanged.

### Messaging and notifications

- Fix the homepage message icon.
- Show unread counts in navigation.
- Add links from notifications to the related inquiry, booking, or conversation.
- Add notification loading, empty, read, and error states.

### Booking and reviews

- Show upcoming schedule summaries on dashboards.
- Display the next allowed booking action based on status.
- Explain why review submission is unavailable before completion.
- Show review status and public visibility after submission.

### AI assistant

- Keep the API key backend-only.
- Add visible loading, timeout, quota, and configuration messages.
- Show the authenticated request-limit status without exposing provider details.
- Keep the safety disclaimer and professional-verification guidance.

## Recommended quality and engineering improvements

1. Add automated backend integration tests for authentication, approval visibility, inquiry-to-booking workflow, authorization, and validation.
2. Add frontend component or browser tests for dashboard navigation and the floating message action.
3. Add a reusable API loading/error/empty-state pattern.
4. Split the large `DashboardPage.jsx` and `App.jsx` files into role-specific components.
5. Replace repeated inline JSX handlers with reusable components where it improves maintainability.
6. Add audit logging for administrator actions.
7. Add database cleanup scripts for temporary integration records.
8. Add accessibility checks for keyboard navigation, focus states, form labels, and color contrast.
9. Test mobile widths around 430px, 560px, 760px, and desktop widths.
10. Add API documentation examples for each protected workflow.
11. Add rate limiting and request-size limits at the Express boundary if approved for the project scope.
12. Avoid exposing detailed database/provider errors in production responses.

## Priority implementation order

### P0: broken or misleading behavior

- Fix the floating message icon.
- Fix homepage links that pretend to open services but only scroll.
- Show gardener approval and public visibility status.
- Add administrator gardener approval controls.

### P1: workflow usability

- Add client and gardener activity summaries to dashboards.
- Add role-specific quick actions and unread badges.
- Add real category links and marketplace empty-state explanations.
- Add loading/error/empty states consistently.

### P2: reliability and maintainability

- Add automated integration/browser tests.
- Add audit logging.
- Split oversized page components.
- Add accessibility and responsive regression checks.

### P3: documentation and cleanup

- Reconcile the outdated `prompt/phase.md`.
- Remove temporary Phase 15 records after approval.
- Update README/API documentation with the final workflow and approval policy.

## Production-readiness roadmap for real clients

The current system is a strong academic MVP, but it should not yet be
described as production-ready for real clients and gardeners. The following
work is recommended before a public launch.

### Required before a pilot

- Complete gardener approval and rejection controls.
- Add provider verification, suspension, and service moderation.
- Improve client and gardener dashboards with real workflow activity.
- Fix all non-functional navigation and interactive controls.
- Add security headers, API rate limiting, strict production CORS, request-size
  limits, and brute-force protection.
- Add password reset and account-recovery flows.
- Publish privacy, terms-of-service, and provider-service disclaimers.
- Add automated tests for authentication, authorization, ownership, approval
  visibility, inquiry-to-booking flow, booking transitions, reviews, uploads,
  and AI limits.
- Configure database backups and test restoration.
- Add structured logs, request IDs, health checks, and error monitoring.

### Required for broader launch

- Define cancellation, rescheduling, no-show, complaint, and dispute rules.
- Add reporting/blocking for abusive users and messages.
- Add administrator audit logging.
- Add persistent production file storage and secure upload handling.
- Add accessibility, performance, and responsive regression testing.
- Define data retention, account deletion, and privacy-consent procedures.
- Document rollback and incident-response procedures.

### Production security and privacy

- Use HTTPS and separate development/production environments.
- Store secrets in a deployment secret manager.
- Never log passwords, tokens, API keys, or private message contents.
- Keep personal contact data and conversations private.
- Validate MIME types, filenames, file sizes, and upload destinations.
- Keep provider API keys backend-only.
- Audit dependencies and apply security updates.

### Business rules that should be documented

- Whether quotations are indicative or binding.
- Who is responsible for service quality.
- Cancellation and rescheduling policies.
- Complaint and dispute handling.
- Provider verification requirements.
- Supported geographic area.
- Minimum account-age requirements.
- Whether payments remain outside the platform.

### Recommended release stages

1. **Pilot:** approved and verified providers, tested core workflows, secure
   configuration, backups, monitoring, and clear legal/user notices.
2. **Broader launch:** disputes, password recovery, audit logs, accessibility,
   performance testing, and operational procedures.
3. **Future enhancements:** real-time messaging, calendar integrations,
   optional payments only with explicit approval, mobile applications, and
   advanced analytics.

The system should be presented as an academic MVP until the pilot and
production-readiness requirements above are completed.

## Recommended AI design feature

Clients can use the Generative AI assistant to describe their desired garden
before contacting a gardener. The recommended first implementation is a
**Garden Design Brief Generator**, not automatic professional design or
construction documentation.

### Suggested client inputs

- available space dimensions;
- indoor, balcony, front yard, backyard, or terrace;
- sunlight and shade conditions;
- preferred garden style;
- preferred plants or colors;
- maintenance level;
- budget range, if the client wants to share one;
- location and climate;
- pets, children, accessibility, or other constraints;
- desired features such as seating, herbs, privacy plants, or pathways.

### Suggested generated output

- short design concept;
- recommended layout zones;
- suggested plant categories and examples;
- materials or features to discuss with a gardener;
- maintenance expectations;
- questions the gardener should confirm during an inquiry;
- assumptions and missing information;
- clear disclaimer that the result is an initial concept, not a final
  architectural, horticultural, structural, or safety plan.

### Recommended workflow

1. Client enters garden requirements.
2. Assistant asks for missing information or allows the client to continue.
3. Backend generates a structured design brief.
4. Client reviews and edits the brief.
5. Client copies or attaches the brief to a service inquiry.
6. Gardener uses it as a starting point for discussion, quotation, and site
   assessment.
7. The gardener confirms real measurements, plant suitability, drainage,
   sunlight, safety, availability, and final scope.

The brief should not automatically create an inquiry, quotation, or booking.
The client must explicitly choose to use it when submitting an inquiry.

### Recommended implementation stages

#### Stage 1: structured text brief

- Extend the existing backend-only AI assistant with a design-brief prompt.
- Return predictable sections such as `designConcept`, `zones`,
  `plantSuggestions`, `materials`, `maintenance`, `questionsForGardener`,
  and `disclaimer`.
- Validate input and output on the backend.
- Allow the client to copy, edit, and include the result in an inquiry.
- Do not store the brief permanently unless the client explicitly saves it.

#### Stage 2: saved design briefs

- Add a user-owned design-brief table only if clients need to return to drafts.
- Allow clients to rename, edit, archive, and delete their own briefs.
- Add ownership checks and retention rules.
- Avoid storing unnecessary personal data in AI prompts or generated results.

#### Stage 3: optional visual concept

Image generation may be considered later only if the group and adviser
approve the cost, provider, privacy implications, quotas, and output quality.
If implemented, label every image as an AI concept and never present it as a
measurement-accurate plan. Do not silently add a paid image provider.

### AI safety and quality requirements

- Keep all provider keys in backend environment variables.
- Do not send passwords, private messages, or unnecessary personal data to the
  provider.
- Display the informational disclaimer on every generated brief.
- Add timeout, quota, invalid-credential, and provider-failure handling.
- Rate-limit generation per authenticated user.
- Allow users to report unsuitable generated content.
- Treat plant, chemical, structural, electrical, drainage, and accessibility
  suggestions as requiring professional verification.
- Log usage metadata without logging prompts that contain sensitive data.

This feature strengthens the connection between the Generative AI requirement
and the gardening-services marketplace: AI helps the client communicate a
clearer goal, while the gardener remains responsible for professional
assessment, feasibility, quotation, and execution.

## Dashboard usability findings

### Client dashboard

The client dashboard currently contains:

- profile editing;
- inquiry, booking, and notification count cards;
- links in the shared dashboard header to inquiries, messages, and bookings.

The dashboard does not display the client's actual recent inquiries, quotations, bookings, notifications, or recommended next actions. This explains why the page may appear to contain only a profile.

### Recommended client improvements

- Add recent inquiries with links to inquiry details.
- Show quotation decisions requiring attention.
- Add upcoming and recent bookings.
- Show unread notification count with a link to messages.
- Add clear actions:
  - Explore services
  - View inquiries
  - View messages
  - View bookings
  - Open Garden Planning Assistant
- Add empty states explaining what the client should do next.

### Gardener dashboard

The gardener dashboard currently contains:

- profile editing;
- service listing CRUD;
- portfolio upload and removal;
- service, inquiry, and booking counts.

It does not show recent inquiries, quotation tasks, messages, booking requests, approval state, or reviews. These functions exist on separate pages or backend endpoints, but they are not discoverable from the main dashboard.

### Recommended gardener improvements

- Add pending approval status.
- Add links and summaries for:
  - new inquiries;
  - quotations awaiting response;
  - booking requests;
  - messages;
  - completed-service reviews.
- Display whether each service is public, inactive, or waiting for approval.
- Add an explicit “View public listing” action when the service is visible.

## Pages and modules reviewed

### Frontend routes

The application currently defines these pages in [App.jsx](frontend/src/App.jsx):

- `/` landing page
- `/services` marketplace
- `/services/:serviceId` service detail
- `/gardeners/:gardenerId` gardener profile
- `/login`
- `/register`
- `/assistant`
- `/dashboard`
- `/inquiries`
- `/inquiries/new`
- `/inquiries/:inquiryId`
- `/messages`
- `/bookings`
- `/bookings/new`
- `/bookings/:bookingId`

### Backend modules

The application currently registers APIs for:

- health
- authentication
- AI assistant
- profiles
- administrator functions
- services
- gardeners
- portfolios
- inquiries and quotations
- bookings
- reviews
- conversations and messages
- notifications

### Functional coverage

| Area | Implementation status | Main observation |
|---|---|---|
| Registration and authentication | Implemented | Public roles are client and gardener; administrator self-registration is blocked. |
| Role authorization | Implemented | Protected routes use authentication and role middleware. |
| Client profile | Implemented | Dashboard is too minimal for practical workflow visibility. |
| Gardener profile | Implemented | Approval state is not sufficiently visible to the gardener. |
| Service CRUD | Implemented | Gardener-created services can be hidden by approval filtering. |
| Portfolio uploads | Implemented | Requires manual UI testing with valid and invalid files. |
| Marketplace search | Implemented | Correctly filters to active approved gardeners, but empty-state explanation should mention approval. |
| Inquiries | Implemented | Separate from bookings as required. |
| Quotations | Implemented | Acceptance is required before booking. |
| Messaging | Implemented | Conversation and notification pages exist. |
| Bookings | Implemented | Lifecycle and ownership checks exist. |
| Reviews | Implemented | Restricted to completed bookings and one review per booking. |
| AI assistant | Implemented | Backend-mediated, authenticated, rate-limited, and requires manual live verification. |
| Administrator functions | Partially complete | Moderation exists, but gardener approval controls and dedicated audit logging are missing. |

## Master prompt and phase prompt compliance

### Confirmed alignment

The implementation follows the approved direction in `prompt/masterprompt.md`:

- React + Vite frontend.
- Node.js + Express.js backend.
- MySQL database.
- REST API separation.
- Backend-only AI provider access.
- HttpOnly authentication cookies.
- Password hashing.
- Parameterized SQL queries.
- Role-based authorization.
- Separate inquiry, quotation, and booking workflow.
- No payment, wallet, e-commerce, GPS dispatch, or native mobile scope.

The numbered phases in `prompt/prompts.md` were checked. Implemented modules correspond to Phases 1–14, and Phase 15 is currently in progress.

### Documentation issue

The repository instructions correctly identify that `prompt/phase.md` is an older PHP/XAMPP roadmap and conflicts with the approved React/Express/MySQL 16-phase direction. It should be reconciled before Phase 16 documentation is finalized.

The phase headings in `prompt/prompts.md` also contain older separator labels in some sections. The numbered phase headings and the master prompt should remain the authoritative interpretation.

## Priority recommendations

### High priority

1. Implement gardener approval management in the administrator dashboard.
2. Show approval and visibility status in the gardener dashboard.
3. Add client and gardener workflow summaries and action links to their dashboards.
4. Add an integration test for service visibility before and after gardener approval.

### Medium priority

5. Add a small administrator audit table for account, gardener, category, service, and report actions.
6. Improve marketplace empty states so users understand that only approved gardeners are publicly visible.
7. Add explicit loading, empty, and error states to every dashboard panel.
8. Perform manual responsive checks at mobile, tablet, and desktop widths.

### Lower priority

9. Add automated backend integration tests instead of relying only on smoke-test scripts.
10. Remove temporary Phase 15 database records after confirming they are no longer needed.
11. Reconcile `prompt/phase.md` with the approved 16-phase roadmap.

## Verification status

Previously verified:

- frontend lint;
- frontend production build;
- backend syntax;
- backend health and MySQL connectivity;
- unauthenticated and non-administrator access denial;
- core API workflow from registration through review;
- database orphan-record checks;
- no tracked environment files;
- no Gemini API key references in frontend source.

Still requiring real UI access:

- client dashboard usability;
- gardener approval and service visibility;
- portfolio upload behavior;
- live Gemini assistant behavior;
- administrator success-path operations;
- responsive layout behavior.
