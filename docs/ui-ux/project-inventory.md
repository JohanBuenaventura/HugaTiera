# HugaTiera — Frontend Project Inventory

**Audit Date:** November 25, 2026  
**Branch Inspected:** `main` (`bca13b1`)  
**Inspection Scope:** Read-only audit of all frontend architecture, routes, roles, pages, components, services, styling, and responsive conventions directly from source code.

---

## 1. Frontend Architecture Overview

| Area | Implementation Discovered in Source |
|---|---|
| **Framework & Bundler** | React `^19.3.1` + Vite `^8.3.6` (`frontend/package.json`) |
| **Routing** | `react-router-dom` `^7.18.5` (`BrowserRouter`, nested `<ProtectedRoute>` guards in [App.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/App.jsx#L295-L328)) |
| **Icons & Fonts** | `lucide-react` `^1.69.0`; Google Fonts `DM Sans` (UI/body) + `Playfair Display` (editorial headings) in [index.css](file:///c:/xampp/htdocs/HugaTiera/frontend/src/index.css#L1-L4) |
| **State & Auth Context** | [AuthContext.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/context/AuthContext.jsx) + [useAuth.js](file:///c:/xampp/htdocs/HugaTiera/frontend/src/hooks/useAuth.js); `HttpOnly` JWT cookie (`auth_token`) with `401` vs `503`/offline differentiation |
| **API Layer** | 13 service modules under `frontend/src/services/` (`agreements.js`, `ai.js`, `api.js`, `auth.js`, `bookings.js`, `categorySpecs.js`, `clerk.js`, `communication.js`, `inquiries.js`, `profiles.js`, `requestImages.js`, `reviews.js`, `services.js`) |
| **Utilities** | [zamboangaAddress.js](file:///c:/xampp/htdocs/HugaTiera/frontend/src/utils/zamboangaAddress.js) (70 Zamboanga City barangays, compose/parse/validate/preview) |
| **Design System & CSS** | Global design tokens in [index.css](file:///c:/xampp/htdocs/HugaTiera/frontend/src/index.css) (44 lines) + single monolithic stylesheet [App.css](file:///c:/xampp/htdocs/HugaTiera/frontend/src/App.css) (**5,439 lines**, 51 `@media` blocks) |
| **Three-Color System** | Forest `#244B36` (`--forest`), Deep Forest `#1B3A29` (`--forest-deep`), Ivory `#F7F5EC` (`--ivory`), Warm Amber `#D99A36` (`--amber`), Ink `#1E2A22` (`--ink`) |

---

## 2. Discovered User Roles & Capabilities

Derived directly from `backend/controllers/auth.controller.js`, `frontend/src/App.jsx`, `frontend/src/services/profiles.js`, `frontend/src/components/AppSidebar.jsx`, and `frontend/src/pages/DashboardPage.jsx`:

| # | Role (`users.role`) | Entry Point | Dual-Role Support | Primary Workspace |
|---|---|---|---|---|
| 1 | **Guest (Unauthenticated)** | `/`, `/services`, `/services/:serviceId`, `/gardeners/:gardenerId`, `/login`, `/register` | N/A | Public editorial landing & marketplace discovery |
| 2 | **Client** (`client`) | Public 3-step `/register` (**Find a gardener**) | Optional opt-in via **Profile & Settings → Enable Dual Role** (`POST /api/auth/enable-dual-role`; new gardener profile starts `is_approved = FALSE`) | `UserDashboard` (`role='client'`), Marketplace, Inquiries, Bookings, Messages, Notifications, AI Assistant |
| 3 | **Gardener / Service Provider** (`gardener`) | Public 3-step `/register` (**Offer services**) | **Enabled by default** (`can_act_as_client = TRUE`, `can_act_as_gardener = TRUE`, 1-click sidebar & dashboard switcher) | `UserDashboard` (`role='gardener'`, tabs: `Overview`, `My services`, `Portfolio`, `My Clerks`, `Profile & settings`), Schedule Calendar, Inquiries + Open Board, Bookings, Messages, Notifications, AI Assistant |
| 4 | **Assigned Clerk** (`clerk`) | **Provider-managed only** (created inside **Gardener Dashboard → My Clerks** or assigned by Admin; public `/register` blocks `role='clerk'` with HTTP `400`) | None (`isDualRole = false`) | `ClerkDashboard` (tabs: `Overview`, `Schedules & Crew`, `Payments`, `Services`), Notifications, Marketplace |
| 5 | **Administrator** (`administrator`) | Seeded / promoted internally (public `/register` blocks `role='administrator'` with HTTP `400`) | None (`isDualRole = false`) | `AdminDashboard` (tabs: `Overview`, `Analytics`, `Approvals`, `Pricing`, `Activity`, `Reports`, `Accounts`), Inquiry Detail inspection, Marketplace, AI Assistant |

---

## 3. Complete Route & Screen Inventory

All 16 route definitions discovered in [App.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/App.jsx#L299-L324) plus query-parameter tab views:

| Route | Auth Guard (`App.jsx`) | Component / File | Layout Shell | Roles Allowed | Functional Scope |
|---|---|---|---|---|---|
| `/` | Public | `HomePage` ([App.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/App.jsx#L98-L288)) | Sticky editorial top header + full-width sections + floating message button (Client/Gardener only) | All | Hero, About, live 4 category cards + recently added services, Why HugaTiera, testimonial carousel, 4-step process, CTA, footer |
| `/services` | Public | [ServicesPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/ServicesPage.jsx) | `AppSidebar` (if logged in) or `PublicHeader` (if guest) | All | Keyword, category, service-area filter, sort (`newest`, `price_low`, `price_high`), 3-col visual cards, pagination |
| `/services/:serviceId` | Public | [ServiceDetailPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/ServiceDetailPage.jsx) | `AppSidebar` or local `PageHeader` | All | Service info, indicative price, Client CTAs (Ask / Propose Agreement), Gardener summary sidebar, live schedule/crew/fully-booked preview, Report listing form, portfolio gallery |
| `/gardeners/:gardenerId` | Public | [GardenerPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/GardenerPage.jsx) | `AppSidebar` or inline public header | All | Gardener hero, ratings, direct inquiry CTA (Client), report gardener form, working schedule/crew/unavailable/fully-booked preview, services offered, portfolio gallery, verified reviews |
| `/login` | Public | `LoginPage` ([AuthPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/AuthPage.jsx#L57-L158)) | Split-screen `AuthLayout` (editorial photo left, form right) | All | Email input with `localStorage` recent-email quick-fill chips, password with visibility toggle |
| `/register` | Public | `RegisterPage` ([AuthPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/AuthPage.jsx#L175-L645)) | Wide split-screen `AuthLayout` | All | 2 public role cards (`Find a gardener`, `Offer services`) + 3-step wizard (`1. About you`, `2. Details` with `StructuredAddressFields` for Client, `3. Account` with review summary) |
| `/dashboard` | `ProtectedRoute` (any role) | [DashboardPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/DashboardPage.jsx) | `AppSidebar` + `.dashboard-content` | All authenticated | Dispatches to `UserDashboard` (Client/Gardener), `ClerkDashboard`, or `AdminDashboard`; sub-tabs controlled by `?tab=` or `#admin-*` |
| `/dashboard?tab=services` | Protected | `GardenerTools` (`DashboardPage.jsx`) / `ClerkDashboard` | `AppSidebar` | `gardener`, `clerk` | Gardener service CRUD + cover photo upload; Clerk service create & active/inactive toggle |
| `/dashboard?tab=portfolio` | Protected | `GardenerTools` (`DashboardPage.jsx`) | `AppSidebar` | `gardener` | Gardener portfolio photo upload, title/description edit, delete |
| `/dashboard?tab=clerks` | Protected | [GardenerClerksPanel.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/components/GardenerClerksPanel.jsx) | `AppSidebar` | `gardener` | Create new Clerk account, link existing Clerk by email, view active clerks, revoke via modal |
| `/dashboard?tab=schedules` | Protected | [ClerkDashboard.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/components/ClerkDashboard.jsx) | `AppSidebar` | `clerk` | Edit assigned gardener working days, hours, crew size, concurrent jobs, and blocked dates |
| `/dashboard?tab=payments` | Protected | [ClerkDashboard.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/components/ClerkDashboard.jsx) | `AppSidebar` | `clerk` | Inspect receipts, online gateway badges, verify or reject pending manual payments |
| `/dashboard?tab=analytics\|approvals\|pricing\|activity\|reports\|accounts` | Protected | `AdminDashboard` (`DashboardPage.jsx`) | `AppSidebar` | `administrator` | 6 specialized governance sub-views (KPI meters, gardener approvals, category/addon pricing, activity monitor, report resolution, account CRUD + global clerk assignments) |
| `/profile` (and `/dashboard?tab=profile`) | `ProtectedRoute roles={['client', 'gardener']}` | `DashboardPage` (`profileView=true`) | `AppSidebar` | `client`, `gardener` | Dual-Role card + `ProfileForm` (avatar upload/remove, name, 18+ DOB/age, phone, `StructuredAddressFields` for Client OR business/schedule/crew/blocked dates for Gardener) |
| `/inquiries` (and `?tab=open`) | `ProtectedRoute roles={['client', 'gardener']}` | `InquiryList` ([InquiryPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/InquiryPage.jsx#L1618-L1858)) | `AppSidebar` | `client`, `gardener` | Visual card grid of inquiries/offers; Gardener also gets Open Requests Board tab with category + area filters |
| `/inquiries/new` | `ProtectedRoute roles={['client', 'gardener']}` *(Client workflow)* | `InquiryForm` ([InquiryPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/InquiryPage.jsx#L42-L776)) | `AppSidebar` | `client` *(Note: route guard also allows `gardener`!)* | Case 1 general request or Case 2 direct inquiry form: dynamic category specs, per-sq.m price predictor, add-on picker, AI requirement organizer, up to 5 EXIF-stripped garden photos + AI photo analysis |
| `/inquiries/:inquiryId` | `ProtectedRoute` (any role) | `InquiryDetails` ([InquiryPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/InquiryPage.jsx#L802-L1611)) | `AppSidebar` | `client`, `gardener`, `administrator` | Project details, estimate card, photo gallery + space notes, AI offer ranking/filters, offer cards + revision history, Gardener response/revision form, Mutual Agreement v1..vN approval/edit workspace |
| `/bookings` | `ProtectedRoute roles={['client', 'gardener']}` | `BookingList` ([BookingPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/BookingPage.jsx#L1702-L1859)) | `AppSidebar` | `client`, `gardener` | Stage-filtered (`All`, `Reservations & Payments`, `Active Bookings`, `Completed & Closed`, `Cancelled`) visual card grid |
| `/bookings/new` | `ProtectedRoute roles={['client', 'gardener']}` | `BookingForm` ([BookingPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/BookingPage.jsx#L24-L275)) | `AppSidebar` | `client`, `gardener` | Propose Mutual Agreement (v1) from priced service (`?serviceId=`) or accepted quotation (`?inquiryId=&quotationId=`), live availability & crew check, auto-calculate end time |
| `/bookings/:bookingId` | `ProtectedRoute roles={['client', 'gardener']}` | `BookingDetails` ([BookingPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/BookingPage.jsx#L277-L1700)) | `AppSidebar` | `client`, `gardener` | 4-step progress stepper, next-step guidance banner, Online Checkout (PayMongo / Sandbox Demo modal) + Manual receipt upload, payment history & verify/reject modal, Mutual Agreement summary, Print/PDF button, Reschedule & Event-Cancellation panels, Transaction Completion Agreement, 1–5 star review form |
| `/messages` | `ProtectedRoute roles={['client', 'gardener']}` | [CommunicationPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/CommunicationPage.jsx) (`mode='messages'`) | `AppSidebar` | `client`, `gardener` | Two-column inbox (`is-inbox-only` when none selected) + chat thread with unread counters |
| `/notifications` | `ProtectedRoute roles={['client', 'gardener', 'clerk']}` | [CommunicationPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/CommunicationPage.jsx) (`mode='notifications'`) | `AppSidebar` | `client`, `gardener`, `clerk` | Activity feed with `All` / `Unread` filter, mark-all-read, pagination (`Show more`), deep-link navigation |
| `/assistant` | `ProtectedRoute` (any role) | [AssistantPage.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/pages/AssistantPage.jsx) | `AppSidebar` | All authenticated | Standalone Gemini garden planner with hourly quota indicator, sample prompts, disclaimer |
| `*` (fallback) | Public | `PublicRedirect` (`App.jsx`) | — | All | Redirects authenticated users to `/dashboard`, guests to `/` |

---

## 4. Shared Components & Reusable Building Blocks

| Component | File Path | Used By | Purpose & Reusability |
|---|---|---|---|
| `AppSidebar` | [AppSidebar.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/components/AppSidebar.jsx) | All protected pages + authenticated public pages | Persistent collapsible left sidebar (210px → 64px), mobile top drawer (`<= 760px`), role badges, unread counters, Dual-Role switch button, logout, mounts `AiAssistantWidget` |
| `ProtectedRoute` | [ProtectedRoute.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/components/ProtectedRoute.jsx) | `App.jsx` | Session check, `503`/offline recovery screen, role guard redirect to `/dashboard` |
| `StructuredAddressFields` | [StructuredAddressFields.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/components/StructuredAddressFields.jsx) | `AuthPage.jsx`, `DashboardPage.jsx` | Reusable 6-field billing-style Philippine/Zamboanga City address form + live formatted preview |
| `AiAssistantWidget` | [AiAssistantWidget.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/components/AiAssistantWidget.jsx) | Mounted inside `AppSidebar` (Client & Gardener only) | Bottom-right floating chat dock with quick prompts, hourly quota, and `/assistant` deep link |
| `GardenerScheduleCalendar` | [GardenerScheduleCalendar.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/components/GardenerScheduleCalendar.jsx) | `DashboardPage.jsx` (Gardener Overview) | Collapsible monthly calendar, urgency queue (`Overdue`, `Urgent Today`, `Due Tomorrow`, `Action`), selected-day agenda, quick date block/unblock |
| `GardenerClerksPanel` | [GardenerClerksPanel.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/components/GardenerClerksPanel.jsx) | `DashboardPage.jsx` (Gardener `My Clerks` tab) | Create new clerk, link existing clerk, active clerk list, accessible revoke modal |
| `ClerkDashboard` | [ClerkDashboard.jsx](file:///c:/xampp/htdocs/HugaTiera/frontend/src/components/ClerkDashboard.jsx) | `DashboardPage.jsx` (when `user.role === 'clerk'`) | Multi-gardener pill selector, payment verification queue, schedule & blocked-date forms, service create/toggle, recent bookings table |

---

## 5. Styling & Responsive Breakpoint Inventory

- **Token layer:** [index.css](file:///c:/xampp/htdocs/HugaTiera/frontend/src/index.css) defines `:root` tokens (`--forest`, `--ivory`, `--amber`, `--ink`, `--muted`, `--line`, `--surface`, `--shadow-sm`, `--shadow-md`) and global `:focus-visible` outline (`3px solid rgba(36, 75, 54, .32)`).
- **Stylesheet architecture:** [App.css](file:///c:/xampp/htdocs/HugaTiera/frontend/src/App.css) has grown organically across phases from minified baseline blocks (lines 1–76) to multi-line thematic overrides (lines 78–5,439), resulting in **51 separate `@media` queries** using **12 inconsistent breakpoint thresholds**: `1280px`, `1100px`, `1024px`, `980px`, `900px`, `820px`, `800px`, `760px`, `700px`, `680px`, `640px`, `620px`, `560px`, `480px`, `430px`.
- **Modal pattern:** Styled accessible modals (`.gateway-demo-backdrop`, `.gateway-demo-modal`, Escape-key and backdrop dismiss) exist for Sandbox Checkout, Payment Rejection, Account Deletion, and Clerk Revocation — but are duplicated inline across 3 files rather than extracted into a shared `<ConfirmModal />` component, while Admin Gardener Approval still uses native `window.confirm()` / `window.prompt()`.
