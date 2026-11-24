# HugaTiera — Complete System Functionalities Guide

This document is the complete, human-readable catalog of **every implemented functionality in HugaTiera** (verified against the `main` branch codebase: React 19 + Vite 8 frontend, Node.js + Express 5 REST API with 16 route modules, and MySQL `hugatiera_db` with 25 tables and 59 foreign keys).

Use this guide for onboarding teammates, QA walkthroughs, user manuals, and Software Engineering project defense presentations.

---

## Quick Role Summary

| Role | How Account Is Created | Core Purpose |
|---|---|---|
| **Guest / Public Visitor** | No account needed | Browse landing page, public marketplace services, categories, approved gardener profiles, portfolios, reviews, and live availability previews. |
| **Client** (`role = 'client'`) | Public 3-step `/register` wizard (**Find a gardener**) | Discover nearby gardeners, post Case 1 open requests or Case 2 direct inquiries with garden photos & AI help, compare offers, approve mutual agreements, pay deposits/balances, track bookings, message gardeners, and leave verified 1–5 star reviews. |
| **Gardener / Service Provider** (`role = 'gardener'`) | Public 3-step `/register` wizard (**Offer services**) — requires Admin approval (`is_approved = TRUE`) for public visibility | Automatically includes **Client Mode** (1-click sidebar switch). Manage professional profile, service listings & cover photos, portfolio gallery, working schedule & daily crew capacity, calendar alerts, open leads & quotations, mutual agreements, payment verification, service execution, and **My Clerks** staff accounts. |
| **Assigned Clerk** (`role = 'clerk'`) | **Provider-managed only** — created inside **Gardener Dashboard → My Clerks** (or assigned by Admin); public Clerk self-registration is blocked | Strictly scoped operations assistant for assigned gardener(s): manages working days/hours, crew size, blocked dates, service listings, and manual payment proof verification without accessing unassigned gardeners or admin tools. |
| **Administrator** (`role = 'administrator'`) | Seeded / promoted internally (public self-registration blocked) | Platform governance: KPI overview & analytics, gardener approval queue, category & itemized pricing/add-on configuration, service moderation, user account CRUD & activation toggles, clerk assignments, platform-wide activity monitoring, and user report resolution. |

---

## 1. Public Discovery & Authentication

### 1.1 Editorial Landing Page (`/`)
- Displays HugaTiera's Zamboanga City focus, live active service categories (deep-linking directly to `/services?categoryId=<id>`), recently added approved services from the database, interactive testimonial switcher, 4-step workflow guide, and auth-aware navigation CTA (**Get started** vs **Dashboard**).
- Displays a floating quick-access message button for authenticated Clients and Gardeners (hidden on `/messages` and hidden for guests/administrators).

### 1.2 Public Marketplace & Search (`/services`, `/services/:serviceId`, `/gardeners/:gardenerId`)
- **Service Search & Filtering:** Search by keyword (matches title, description, business name, or gardener full name), filter by active service category, filter by Zamboanga City service area/barangay, sort by `newest`, `price_low`, or `price_high`, and paginate results.
- **Approval & Visibility Gating:** Only listings where `services.is_active = TRUE`, `users.is_active = TRUE`, `gardener_profiles.is_approved = TRUE`, and `service_categories.is_active = TRUE` appear publicly.
- **Automatic Display Name Fallback:** If a gardener leaves `business_name` blank, the platform automatically displays their full name (`first_name + last_name`).
- **Service Detail Page (`/services/:serviceId`):** Shows cover photo, indicative price & unit, required worker count (`workers_required`), gardener rating summary, live availability/crew-size/fully-booked date preview, **Send Direct Inquiry** button, **Propose Service Agreement** modal (for priced services), and **Report Service** form.
- **Public Gardener Profile (`/gardeners/:gardenerId`):** Shows avatar, bio, experience, service area, working schedule & upcoming blocked/fully-booked dates, active service listings, full portfolio photo gallery, verified client reviews + star average, direct inquiry button, and user report form.

### 1.3 3-Step Public Registration Wizard (`/register`)
- **2 Clean Public Role Cards Only:**
  - **Find a gardener** (`client`) — Hire & book gardening services.
  - **Offer services** (`gardener`) — Automatically grants **both** Gardener capabilities and Client mode (`can_act_as_client = TRUE`, `can_act_as_gardener = TRUE`, plus `client_profiles` and `gardener_profiles` rows) and lets the provider manage Clerks inside **Dashboard → My Clerks**.
  - Public registration strictly blocks `administrator` and `clerk` accounts (`400` on `POST /api/auth/register`).
- **Step-by-Step Flow with Progress Stepper & Per-Step Validation:**
  - **Step 1 (`About you`):** Choose role card, enter First name, optional Middle name, Last name, and Birthday with **live auto-calculated Age** (18+ required).
  - **Step 2 (`Details`):** Enter Mobile number (10–15 digits) + either **Client structured billing-style address** (`StructuredAddressFields.jsx`: House/Unit/Purok & Street, Zamboanga City Barangay dropdown synced with `smartMatching.js` + manual `Other` option, optional Subdivision/Landmark, City/Municipality defaulting to `Zamboanga City`, optional Province defaulting to `Zamboanga del Sur`, optional 4-digit ZIP defaulting to `7000`, with live formatted preview) OR Gardener Business Name (optional), Years of Experience (optional), Service Area (`Zamboanga City` default), and Short Bio (optional).
  - **Step 3 (`Account`):** Compact review summary strip (with quick **Edit info** link), Email address, Password (8–72 chars with show/hide eye toggle), and Confirm Password (with live mismatch indicator).
- Clicking completed steps or **Back** preserves all entered inputs; submitting calls `POST /api/auth/register` once.

### 1.4 Login, Session Security & Role Switching (`/login`)
- **Login UX:** Email & password sign-in with show/hide password toggle and browser-local **Recent Emails Quick Fill** chips (with individual forget buttons).
- **Security Controls:** `bcryptjs` password hashing, `HttpOnly` `SameSite=Lax` JWT cookie (`auth_token`), sliding-window rate limiting on `/api/auth/login` and `/api/auth/register`, HTTP security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`), and live `users.is_active = TRUE` enforcement on every protected API request.
- **Dual-Role Mode Switching (`AppSidebar.jsx`):**
  - Every Gardener automatically has dual-role access (`Client Mode` ⇄ `Gardener Mode`) via a **1-click sidebar switcher** (`POST /api/auth/switch-role`), with inline error feedback if switching fails.
  - Existing single-role Clients can opt into Gardener mode (`POST /api/auth/enable-dual-role`); their new gardener profile starts with `is_approved = FALSE` until approved by an Administrator.
  - **Self-Dealing Protection:** Dual-role accounts are blocked (`409`) from inquiring on, offering on, agreeing with, or booking their own listings/requests, and their own open requests are hidden from their Gardener Open Leads feed.

---

## 2. Client Functionalities

### 2.1 Client Dashboard & Smart AI Recommendations (`/dashboard`, `/profile`)
- **Overview Metrics:** Live counts of Inquiries, Bookings, and Unread Notifications.
- **AI Smart Recommendations (`ClientDiscoveryShowcase`):**
  - Ranks approved gardening services using hybrid Zamboanga City barangay proximity, verified review scores, and clean conduct metrics (`GET /api/ai/recommendations`).
  - Filter by **Your barangay / area**, **What do you need?** (**live Service Category dropdown** backed by `categoryId`), sort modes (**AI Smart Match**, **Nearest First**, **Highest Rated**, **Best Service Conduct**), and quick toggles (**Nearby only**, **4.0★+ rated**, **Clean conduct only**).
  - Optional **AI Explain Top Picks** button (`POST /api/ai/recommendations/summary`) generates a Gemini advisory summary.
- **Recent Verified Reviews Feed:** Showcases recent completed-booking reviews across local gardeners (`GET /api/reviews/recent`).
- **Profile & Settings (`/profile` or Dashboard tab):** Edit name (including optional middle name), 18+ birthday, mobile number, independent billing-style address details (House/Unit/Purok & Street, Zamboanga City Barangay dropdown + manual fallback, Subdivision/Landmark, City/Municipality, Province, and 4-digit ZIP code with automatic parsing of existing addresses), bio, and upload/delete a `sharp`-sanitized profile avatar (`/api/profiles/me/avatar`).

### 2.2 Service Requests: Case 1 (General) & Case 2 (Direct) (`/inquiries/new`, `/inquiries`, `/inquiries/:inquiryId`)
- **Case 1 — General Service Request (`request_type = 'general'`):**
  - Client posts an open request visible on the **Open Service Requests Board** to all approved gardeners, with an optional validity window (`7`, `14`, or `30` days; renewable via `POST /api/inquiries/:inquiryId/renew`).
  - **Area-Level Privacy:** Open board shows only client first name and area/barangay; exact street addresses are shared later in the Mutual Agreement.
- **Case 2 — Direct Service Provider Inquiry (`request_type = 'direct'`):**
  - Client targets a specific approved gardener (or specific service listing) directly.
- **Secure Garden Photo Uploads (`POST /api/request-images`):**
  - Upload up to **5 garden photos** (`JPEG`, `PNG`, `WebP`, max 5 MB each). Every photo is validated, auto-oriented, resized within `1920×1920`, and re-encoded via `sharp` with **all EXIF/GPS metadata stripped**.
  - Unattached draft photos are automatically cleaned up after 24 hours. Photos are streamed only through authenticated endpoints (`GET /api/request-images/:imageId`).
- **Dynamic Category Specs & Itemized Price Estimator (`POST /api/inquiries/estimate`):**
  - Dynamic category-specific form fields (`inquiries.category_specs` JSON) tailored to each gardening category (Landscaping, Lawn Care, Tree & Plant Care, Potted & Terrace Gardens, Garden Maintenance, Garden Improvement).
  - Live **Amount Predictor** calculates indicative labor + materials price ranges and estimated duration based on category per-sq.m rates, garden `areaSqm`, `workComplexity`, `materialsOption`, and optional itemized `pricing_addons` (plants, materials, equipment, disposal).
  - Supports client budget/price comments and an **On-Site Ocular Inspection** flag (`requires_site_visit`).
- **AI Requirement & Photo Assistance (Advisory Only):**
  - Run Gemini photo analysis (`POST /api/ai/photo-analysis`) on uploaded photos to generate editable `ai_description` notes.
  - Run Gemini requirement structuring (`POST /api/ai/requirements`) to draft a clean summary, description, category suggestion, and follow-up questions that the client reviews and edits before submitting.
- **Comparing & Accepting Offers:**
  - On Case 1 requests, clients compare competing gardener offers side by side with ratings, review counts, completed bookings, years of experience, service area, and portfolio thumbnails.
  - Clients can accept or decline offers (`PATCH /api/inquiries/quotations/:quotationId/status`). Accepting locks the offer (`locked_at = NOW()`) and moves the inquiry to `provider_selected` — **never creating a booking automatically**.

### 2.3 Versioned Mutual Agreement (`/inquiries/:inquiryId` & `/services/:serviceId`)
- **Mandatory Gate Before Booking:** Direct booking creation (`POST /api/bookings`) is retired (`409 MUTUAL_AGREEMENT_REQUIRED`). Even priced services start an inquiry + Version 1 Mutual Agreement (`POST /api/agreements/direct-service`).
- **Agreement Negotiation & Versioning (`/api/agreements`):**
  - Either client or gardener proposes Version 1 specifying `scope_of_work`, final `amount`, `price_basis`, `required_deposit_amount`, `estimated_working_days`, `scheduled_start`, `scheduled_end`, exact `location`, and `conditions`.
  - Editing a proposed agreement marks Version $N$ as `superseded`, creates Version $N+1$ (`previous_agreement_id`), and clears the other party's approval.
  - **Atomic Confirmation:** Only when **both** client and gardener approve the **exact same version** does the backend validate schedule & crew capacity, set `agreement.status = 'agreed'`, create the booking (`status = 'accepted'`, `booking_stage = 'reserved'`), mark `inquiry.status = 'confirmed'`, and auto-decline competing offers.

### 2.4 Reservations, Payments, Rescheduling, Completion & Reviews (`/bookings`, `/bookings/:bookingId`)
- **4-Step Booking Progress Stepper:** Guides the user visually across `Reserved` → `Confirmed Paid Booking` → `Service Completed` → `Closed & Review Ready`, alongside a read-only **Mutual Agreement Summary** panel and **Print / Save PDF** receipt summary (`@media print`).
- **Reservation Deposit & Balance Payments:**
  - **Online Checkout (`POST /api/bookings/:bookingId/payments/checkout`):** Supports **PayMongo Checkout** (when `PAYMONGO_SECRET_KEY` is configured) or built-in **Sandbox/Demo Checkout** (`GCash`, `Maya`, `GrabPay`, `Card`), with overpayment caps and idempotent confirmation (`confirm-gateway`).
  - **Manual Payment Proof (`POST /api/bookings/:bookingId/payments`):** Submit cash/bank/GCash/Maya deposit or balance proofs with `TXN-YYYYMMDD-XXXXXX` codes and optional `sharp`-sanitized receipt photo uploads (`GET .../receipt`).
  - Once verified payments meet `required_deposit_amount`, the booking upgrades from `reserved` to `booked`.
- **Event-Based Cancellation & Mutual Rescheduling:**
  - Cancel with structured reason types (including typhoon/severe weather & emergencies — weather cancellations do not penalize provider conduct scores).
  - Propose or respond to mutual reschedule requests (`POST` / `PATCH /api/bookings/:bookingId/reschedule-requests`) with automatic re-validation of gardener schedule/crew capacity while preserving payments.
- **Mutual Transaction Completion Agreement & Strict Review Gate:**
  - Once the gardener marks work `completed` and `payment_status = 'fully_paid'`, **both** client and gardener confirm completion (`POST /api/bookings/:bookingId/complete-transaction`), setting `transaction_status = 'closed'`.
  - Only when `completed` + `fully_paid` + `closed` can the client submit a one-time **1–5 star verified review** (`POST /api/reviews`).

---

## 3. Gardener / Service Provider Functionalities

### 3.1 Built-In Dual-Role Access & Professional Profile (`/dashboard`, `/profile`)
- **Automatic Client Mode:** Every Gardener account automatically includes Client mode (`can_act_as_client = TRUE`), allowing gardeners to hire other gardeners with one click in the sidebar while preventing self-dealing.
- **Profile & Approval Status:** Manage business/display name, service area, years of experience, bio/specialties, avatar photo, and view live Administrator approval status (`Pending Approval` vs `Approved`).

### 3.2 Service Listings & Portfolio Management (`/dashboard`)
- **Service CRUD (`/api/services`):** Create, edit, activate/deactivate service listings with category, title, description, indicative price, price unit, service area, and **`workers_required`** (for daily crew capacity math).
- **Service Cover / Design Photos (`/api/services/:serviceId/image`):** Upload or remove `sharp`-sanitized cover images displayed on Marketplace cards.
- **Portfolio Gallery (`/api/portfolios`):** Upload project photos (validated with `sharp` magic-byte checks & EXIF stripping), edit titles/descriptions, and delete entries.

### 3.3 Schedule, Daily Crew Capacity & Planning Calendar (`GardenerScheduleCalendar.jsx`)
- **Working Schedule Settings (`PUT /api/profiles/me`):** Configure working days (Mon–Sun), working hours (`work_start_time` – `work_end_time`), simultaneous job cap (`max_concurrent_jobs`), daily **crew size** (`crew_size`), and availability notes.
- **Blocked / Unavailable Dates (`/api/profiles/me/unavailable-dates`):** Add and remove vacation, maintenance, or personal unavailable date ranges.
- **Worker-Weighted Capacity & "Fully Booked" Detection:** Automatically blocks overlapping bookings exceeding `crew_size` (`CREW_CAPACITY_EXCEEDED`) or `max_concurrent_jobs`, and marks saturated days as **"Fully Booked — No Service Available"** publicly.
- **Calendar & Urgency Alerts:** Collapsible interactive monthly schedule calendar with urgency badges (**Overdue**, **Urgent Today**, **Due Tomorrow**, **To Do**) and idempotent `booking_reminder` notifications.

### 3.4 Open Requests Board, AI Lead Matching & Offers (`/inquiries`, `/inquiries/:inquiryId`)
- **Open Service Requests Board (`GET /api/inquiries/open`):** Approved gardeners browse non-expired Case 1 open requests (excluding their own if dual-role), plus AI-ranked nearby leads on the Gardener Dashboard (`GET /api/ai/recommendations?mode=leads`, supporting category filtering).
- **Provider Decision-Support View:** Displays client-reviewed garden photos, editable AI photo descriptions, structured category specs, price predictor breakdowns, and ocular inspection flags.
- **Submitting, Revising & Withdrawing Offers:**
  - Submit Case 1 offers (`offer`, `interest`) or Case 2 feasibility responses (`offer`, `feasible`, `modifications` with proposed changes, or `cannot_do`) with itemized labor/materials breakdowns and estimated working days/hours.
  - Revise (`PUT /api/inquiries/quotations/:quotationId`) or withdraw (`POST .../withdraw`) while `status = 'sent'` and unlocked; every revision is archived in `quotation_revisions`.
  - Offer privacy: on Case 1 requests, gardeners only see their own offers — never competitors' quotes.

### 3.5 Booking Execution, Payment Verification & Closure (`/bookings/:bookingId`)
- **Manual Payment Verification (`PATCH /api/bookings/:bookingId/payments/:paymentId`):** Inspect client receipt images and approve (`verified`) or reject (`rejected` with styled modal reason) deposit and balance proofs.
- **Service Execution:** Transition confirmed paid bookings from `accepted` (`booked`) → `in_progress` → `completed`, propose/approve reschedules, handle event cancellations, and sign off on the **Transaction Completion Agreement**.

### 3.6 Managing Assigned Staff — "My Clerks" (`GardenerClerksPanel.jsx`, `/dashboard?tab=clerks`)
Gardeners can delegate day-to-day operational monitoring to trusted staff clerks directly from their dashboard without waiting for an Administrator:
- **List Assigned Clerks (`GET /api/profiles/me/clerks`):** View all clerks currently authorized to manage the gardener's operations, including assignment notes and dates.
- **Create New Clerk Account (`POST /api/profiles/me/clerks`):** Atomically creates a new `role = 'clerk'` account (first name, last name, email, phone, password, optional role note) and exclusively links them to the gardener in `clerk_gardener_assignments`. The clerk immediately signs in at `/login`.
- **Link Existing Clerk (`POST /api/profiles/me/clerks/assign`):** Links an already-existing `clerk` account by email (strictly guarded by `400 TARGET_NOT_CLERK` so non-clerk client/gardener/admin emails cannot be hijacked).
- **Revoke Clerk Access (`DELETE /api/profiles/me/clerks/:assignmentId`):** Instantly revokes a clerk's access via an accessible confirmation modal (`Escape`-key / backdrop close).

---

## 4. Assigned Clerk Functionalities (`ClerkDashboard.jsx`, `/api/clerk/*`)

- **No Public Self-Registration:** Clerks cannot self-register on `/register`; accounts are created by a Gardener (under **My Clerks**) or assigned by an Administrator, and Clerks sign in directly at `/login`.
- **Strict Multi-Gardener Scoping (`assertAssignedGardener`):** Every `/api/clerk/gardeners/:gardenerId/*` endpoint verifies an active row in `clerk_gardener_assignments` and returns `403 NOT_ASSIGNED_TO_GARDENER` for any unassigned gardener. Unassigned clerks see an empty workspace (`0` gardeners).
- **Assigned Clerk Operations Workspace (`/dashboard`):**
  - **Schedule & Crew Capacity Management:** Update assigned gardeners' working days, working hours, `max_concurrent_jobs`, `crew_size`, and availability notes (`PUT /api/clerk/gardeners/:gardenerId/schedule`).
  - **Blocked Dates Management:** Add and delete unavailable date ranges (`POST` / `DELETE /api/clerk/gardeners/:gardenerId/unavailable-dates`).
  - **Service Listing Operations:** Create new service listings and toggle active/inactive status on behalf of assigned gardeners (`POST` / `PATCH /api/clerk/gardeners/:gardenerId/services`).
  - **Payment Proof Verification:** Review manual receipt uploads and online `gateway_provider` badges, and verify or reject pending manual payments (`PATCH /api/clerk/gardeners/:gardenerId/bookings/:bookingId/payments/:paymentId`).
  - **Notifications (`/notifications`):** Receive in-app alerts (including online checkout confirmations and payment submissions for assigned gardeners) with sidebar unread badge.

---

## 5. Administrator Functionalities (`/dashboard`, `/api/admin/*`)

Administrators have a dedicated multi-tab governance workspace (and are intentionally blocked `403` from client/gardener-only routes like `/bookings` and `GET /api/inquiries`):

- **Overview & Analytics Tabs (`GET /api/admin/summary`):**
  - Live KPI cards: total users by role, pending gardener approvals, active services, `open / total` inquiries, `completed / total` bookings, and open moderation reports.
  - Platform health meters and operational analytics breakdowns.
- **Approvals & Services Tab:**
  - **Pending Gardener Approval Queue (`GET /api/admin/gardeners/pending`, `PATCH /api/admin/gardeners/:userId/approval`):** Approve new gardeners (`is_approved = TRUE`) or request profile changes with feedback and automatic in-app notification.
  - **Service Moderation (`GET /api/admin/services`, `PATCH /api/admin/services/:serviceId/status`):** Activate or deactivate any service listing across the platform.
- **Categories & Pricing Tab:**
  - **Service Categories (`GET` / `POST` / `PATCH /api/admin/categories`):** Create, edit, activate/deactivate gardening categories and configure baseline per-sq.m labor rates (`rate_per_sqm_min`, `rate_per_sqm_max`, `min_base_fee`).
  - **Itemized Pricing Add-Ons (`GET` / `POST` / `PATCH /api/admin/pricing-addons`):** Manage configurable plant, material, equipment, and disposal add-on items used by the Client Price Estimator.
- **Accounts & Clerk Assignments Tab:**
  - **User Directory & CRUD (`PATCH` / `DELETE /api/admin/users/:userId`):** Edit user names, middle name, birthday, phone, role (`client`, `gardener`, `clerk`, `administrator`), dual-role flags, and active status.
  - **Activation Toggle (`PATCH /api/admin/users/:userId/status`):** Immediately suspend or reactivate accounts (deactivated users lose access on their very next API call; self-deactivation/self-demotion/self-deletion are blocked).
  - **Safe Account Deletion:** Deletes unreferenced users and cleans up avatars while returning `409 Conflict` for users referenced by inquiries/bookings (`ON DELETE RESTRICT`).
  - **Global Clerk Assignments (`GET` / `POST` / `DELETE /api/admin/clerk-assignments`):** Inspect, assign, or unlink clerks across gardeners platform-wide.
- **Activity Tab (`GET /api/admin/activity`):**
  - Monitors all recent platform inquiries (including unassigned Case 1 `'Open General Request'` rows via `LEFT JOIN`) and bookings.
- **Reports Tab (`GET /api/admin/reports`, `PATCH /api/admin/reports/:reportId`):**
  - Reviews user-submitted reports concerning users, services, or messages and updates status (`open` → `reviewing` → `resolved` / `dismissed`) with resolution notes.

---

## 6. AI Garden Planning Assistant (`/assistant` & `<AiAssistantWidget />`, `/api/ai/*`)

- **Backend-Mediated Google Gemini Integration:** Uses `GEMINI_API_KEY` exclusively on the backend (`gemini-3.8-flash` primary with automatic 1-time fallback to `gemini-3.5-flash-lite` on transient `429`/`5xx`/timeout/network errors).
- **Three Advisory Capabilities:**
  1. **Standalone Tropical Garden Planner (`POST /api/ai/garden-plan`):** Interactive prompt-based planning tailored to Zamboanga City's climate (accessible via `/assistant` and the floating bottom-right `<AiAssistantWidget />`).
  2. **Inquiry Requirement Structurer (`POST /api/ai/requirements`):** Turns rough client notes into structured scope summaries, suggested categories, gardening ideas, and clarifying questions.
  3. **Multimodal Garden Photo Understanding (`POST /api/ai/photo-analysis`):** Analyzes sanitized client garden photos to produce editable space observations saved to `request_images.ai_description`.
- **Smart Hybrid Matching (`GET /api/ai/recommendations`, `POST /api/ai/recommendations/summary`):** Ranks nearby services or open leads by Zamboanga City barangay proximity, category (`categoryId`), verified reviews, and service conduct.
- **Strict Guardrails:**
  - Concurrency-safe rolling 60-minute per-user quota (`AI_HOURLY_LIMIT`, default `10`/hr) backed by `SELECT ... FOR UPDATE` and `ai_usage_log` (`GET /api/ai/usage`).
  - Paid AI image generation is intentionally disabled (`501 IMAGE_GENERATION_POSTPONED`).
  - AI **never** approves requests, selects providers, confirms bookings, sets final prices, or guarantees outcomes.

---

## 7. Cross-Cutting Platform Features

- **In-App 1-to-1 Messaging (`/messages`, `/api/conversations`):** Real-time inbox with unread counters, auto-read tracking on thread open, and Case 1 anti-spam gating (gardeners can only message on a general request while holding an active `sent` or `accepted` offer).
- **In-App Notifications (`/notifications`, `/api/notifications`):** Dedicated notification feed with `All` / `Unread` filters, single-item and mark-all-read actions, sidebar unread badges, and deep-link routing to inquiries, bookings, conversations, reviews, or profiles.
- **User Reporting (`POST /api/profiles/reports`):** Any authenticated user can report abusive users, inaccurate services, or messages (with self-report prevention) for Administrator review.
- **Responsive Design & Accessibility:** Consistent Three-Color Editorial Design System (`#244B36` Forest, `#F7F5EC` Ivory, `#D99A36` Amber), collapsible desktop sidebar + mobile navigation drawer, accessible modal dialogs, skeleton loaders, and print/PDF receipt styles.
- **Local Demo Seeding:**
  - `npm --prefix backend run seed:demo` (`backend/scripts/seedDemo.js`) for quick role-account seeding.
  - `database/seeds/zamboanga_demo_data.sql` for idempotent Zamboanga City showcase data (`6` approved gardeners across Canelar Moret, Pasonanca, Tetuan, Sta. Maria, Guiwan, and Putik; `12` services covering all `6` categories; `2` demo clients; `6` completed/paid/closed bookings with 4–5 star reviews; `3` open general requests; demo password `DemoPass123!`).
