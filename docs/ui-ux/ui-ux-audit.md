# HugaTiera — Comprehensive UI/UX Audit Report

**Audit Date:** November 25, 2026  
**Method:** Complete line-by-line inspection of all React pages, shared components, routing guards, auth context, service helpers, and CSS rules (`index.css` + `App.css`, 5,439 lines).  
**Important Distinction:** Every issue below is explicitly classified as either a **Confirmed Bug / Defect** (verified directly in source code/CSS/routes) or a **UI/UX Improvement Recommendation**.

---

## 1. Cross-Cutting & Shared Shell Audit (`AppSidebar`, `App.css`, `ProtectedRoute`, `AiAssistantWidget`)

### Confirmed Functional, CSS & Accessibility Defects

1. **CRITICAL — Near-Invisible Dual-Role Switcher Button in Sidebar (`App.css:5069-5088`, `AppSidebar.jsx:190-205`):**
   - `.app-sidebar` has a light ivory background (`background: var(--ivory)`, `#F7F5EC` at `App.css:1412`), yet `.app-sidebar-switch-role` applies `color: #FCE8B8` (pale cream-yellow) on `background: rgba(247, 211, 136, .14)` (`App.css:5078-5079`).
   - Effective contrast ratio is approximately **1.12:1** against WCAG AA's required **4.5:1** — making **"Switch to Client / Switch to Gardener"** virtually unreadable for every Gardener and Dual-Role user. (Contrast this with `.dual-role-switch-btn` 20 lines below at `App.css:5103`, which properly uses `color: #7A4F0B` on `#FFFBF0`.)
   - Additionally, `.app-sidebar-switch-role` is omitted from **all** `.app-sidebar.is-collapsed` rules (`App.css:995, 1090, 1563, 1694`), so collapsing the sidebar fails to center the icon button or normalize its padding/width like `.app-sidebar-logout`.

2. **HIGH — Stale Unread Notification Badges in Sidebar (`AppSidebar.jsx:39-59`):**
   - `communicationApi.notifications()` runs only when `[user]` changes — never on `location.pathname` navigation or after marking notifications/messages read in `CommunicationPage.jsx`.
   - After a user clicks **"Mark all notifications read"** or opens an unread message thread, the amber badge numbers in the sidebar remain stale until a full browser reload.

3. **HIGH — Unstyled / Missing CSS Classes Across Active Views (`ClerkDashboard.jsx`, `DashboardPage.jsx`):**
   - Verified via grep across all 5,439 lines of `App.css` — the following JSX class names have **zero CSS definitions**:
     - `.dashboard-stats` (`ClerkDashboard.jsx:333`) — Clerk's 4 KPI summary cards render without the `.stat-grid` / `.stat-card` grid, border, or typography styling.
     - `.weekday-picker` & `.weekday-chip` (`ClerkDashboard.jsx:493, 500`) — Clerk's working-day toggles render as plain unstyled browser buttons instead of Gardener Profile's `.weekday-toggle-grid` / `.weekday-pill`.
     - `.manage-list` & `.manage-item` (`DashboardPage.jsx:2324, 2326, 2401, 2403`) — Typo missing the `d` (`.managed-list` / `.managed-item` exist in `App.css:58`), leaving Admin → Pricing's category labor rate list and pricing add-on list completely unstyled.
     - `.status-badge` (`DashboardPage.jsx:1968`) — Used on Admin → Overview pending gardener rows instead of `.inquiry-status` (`getStatusBadgeClass`), removing pill padding/shape.

4. **HIGH — Broken Tablet Grid Spanning on Even Card Counts (`App.css:59`):**
   - At `@media (max-width: 900px)`, `.marketplace-grid` switches to 2 columns (`1fr 1fr`), and `.marketplace-card:last-child` applies `grid-column: span 2` unconditionally. Whenever there is an **even** number of cards (2, 4, 6, 8, 12 — including the 12 Zamboanga demo services!), the last card stretches across a full orphaned row, leaving a blank gap beside the second-to-last card.

5. **MEDIUM — Print Stylesheet Selector Mismatch (`App.css:5413-5414` vs `AiAssistantWidget.jsx:52, 126`):**
   - `@media print` attempts to hide `.ai-widget-launcher, .ai-widget-panel`, neither of which exist in the DOM; the actual classes in `AiAssistantWidget.jsx` are `.ai-chat-dock`, `.ai-chat-window`, and `.ai-chat-fab`. As a result, the fixed floating AI button can overlay printed/PDF booking receipts.

6. **MEDIUM — Monolithic CSS Specificity Debt & Fragmented Breakpoints (`App.css`, 5,439 lines):**
   - `App.css` layers minified legacy rules (lines 1–76) underneath multiple sequential polish passes, duplicating `.app-sidebar.is-collapsed + .container` **5 times** (lines 1025, 1052, 1491, 1506, 1717, 2439), `.user-table-wrap` 3 times, `.auth-form textarea` twice (lines 2909 & 4864), and scattering **51 `@media` blocks** across 15 different pixel breakpoints.

### UI/UX Improvement Recommendations (Shell & Navigation)
- **Role Navigation Inconsistency (`profiles.js:173-205`):** Admin and Clerk sub-tabs are duplicated in BOTH the left sidebar AND `.dashboard-tabs-top`, while Gardener's key operational tabs (`My services`, `Portfolio`, `My Clerks`) are **absent** from the left sidebar and only appear in `.dashboard-tabs-top`, and Gardeners have no `Marketplace` sidebar link.
- **Currency Formatting Inconsistency:** `BookingPage.jsx`, `ServicesPage.jsx`, and `InquiryPage.jsx` mix `₱` (with and without `.toLocaleString()`), `PHP` (`ClerkDashboard.jsx:421, 737, 790`, `DashboardPage.jsx:620`), and inconsistent decimal places (`₱1500` vs `₱1,500.00`).
- **Missing Shared Confirmation Modal Component:** Styled modals exist for 4 destructive/gateway flows (copy-pasted `.gateway-demo-backdrop`), while Gardener Service deactivation, Portfolio deletion, and Admin Gardener Approval have either zero confirmation or native `window.confirm`/`window.prompt`.

---

## 2. Role-by-Role & Page-by-Page Audit

### 2.1 Guest / Public Visitor (`/`, `/services`, `/services/:serviceId`, `/gardeners/:gardenerId`, `/login`, `/register`)

| Page / Route | Finding Type | Verified Observation |
|---|---|---|
| `/` (`HomePage` in `App.jsx`) | **UX Improvement** | Clicking **"Garden assistant"** in the public header (`App.jsx:156`) or footer (`App.jsx:274`) routes guests directly to `/assistant`, which `<ProtectedRoute>` immediately bounces to `/login` with no explanation or `?redirect=/assistant` return path. |
| `/services` (`ServicesPage.jsx`) | **Confirmed Defect + UX** | (1) Filter changes trigger immediate un-debounced API calls AND an **N+1 fan-out** (`lines 57-59`), firing up to 9 `GET /api/gardeners/:id` requests per keystroke just for fallback cover images. (2) Plain text `Loading services...` instead of skeleton cards. (3) No **"Clear filters"** button when filters return 0 results. (4) Service Area is a raw text input instead of a Zamboanga City barangay selector. (5) Gardener avatar returned by API (`gardener_avatar_path`) is never displayed on service cards. |
| `/services/:serviceId` (`ServiceDetailPage.jsx`) | **Confirmed Defect + UX** | (1) Never renders the service's uploaded cover photo (`service.image_path`), even though `ServicesPage` shows it and gardeners upload it specifically for their listing. (2) Uses `<ArrowLeft size={15} />` rotated `180deg` via CSS (`App.css:61`) on the forward **"View gardener profile"** link (`line 100`) instead of `<ArrowRight />`. (3) Indicative price (`line 82`) lacks `.toLocaleString()` formatting (`₱1500` instead of `₱1,500`). (4) No rating summary shown in the right-hand Gardener Summary sidebar. |
| `/gardeners/:gardenerId` (`GardenerPage.jsx`) | **Visual / UX Gap** | (1) `gardener-profile-hero` does not display the gardener's uploaded profile picture (`avatar_path`, already returned by `GET /api/gardeners/:id`). (2) **"Services offered"** grid (`lines 150-161`) still renders old text-only `.marketplace-card` cards without cover photos, category pills, or `.toLocaleString()` price formatting — visually inconsistent with `/services`. (3) Report form renders inline inside the hero card rather than in a modal/collapsible drawer. |
| `/login` (`AuthPage.jsx`) | **Mostly Strong (Minor UX)** | Clean split layout, eye toggle, recent-email quick-fill chips. Minor: does not read a post-login redirect param (`?next=`), so guests sent from `/assistant` or `/services/:id` always land on `/dashboard` instead of returning where they came from. |
| `/register` (`AuthPage.jsx`) | **Strong (Maintain!)** | Newly upgraded 2-card role selector + 3-step wizard (`About you` → `Details` → `Account`) + 6-field `StructuredAddressFields` + live 18+ age validation. Minor UX polish: Step 2 Gardener `Service area` could optionally provide a Zamboanga barangay datalist helper while keeping multi-barangay text flexibility. |

---

### 2.2 Customer / Client (`UserDashboard`, `/profile`, `/inquiries`, `/inquiries/new`, `/inquiries/:inquiryId`, `/bookings`, `/bookings/new`, `/bookings/:bookingId`, `/messages`, `/notifications`, `/assistant`)

| Page / Route | Finding Type | Verified Observation |
|---|---|---|
| `/dashboard` (`Client` Overview) | **Confirmed Defect + UX** | (1) **Initial Load Flash (`DashboardPage.jsx:2727-2753`):** No `loading` state while `profileApi.get()` resolves — briefly displays `0` Inquiries / `0` Bookings before real counts arrive. (2) **Duplicated CTA Sections:** The top hero actions (`Explore services`, `Post general request`, `AI Garden Assistant`, `lines 1462-1464`) are repeated almost identically in the bottom `.dashboard-next` panel (`lines 1568-1570`) AND inside `ClientDiscoveryShowcase`'s `.showcase-cta-strip` (`lines 908-913`), making the Overview excessively tall. (3) Client `Your barangay / area` filter input in `ClientDiscoveryShowcase` is raw text while Profile/Register uses Zamboanga barangay dropdowns (`datalist` or dropdown would reduce typos). |
| `/profile` (`ProfileForm`) | **Strong (Minor UX)** | Now uses `StructuredAddressFields`, avatar upload/remove, optional middle name, live 18+ age box, and Dual Role opt-in card. Minor: saving profile does not refresh `AuthContext`'s `user.firstName` in the sidebar until page reload (`AppSidebar` reads `user.firstName` from `AuthContext`, while `ProfileForm` only updates `DashboardPage` local `profileData`). |
| `/inquiries` (`InquiryList`) | **Confirmed Defect + UX** | (1) Fires N+1 `fetchInquiryImages(inqId)` requests (`lines 1653-1655`) for every inquiry card on mount. (2) Plain `<p>Loading requests...</p>` text instead of card skeletons. (3) No status filter pills (`All / Open / In Agreement / Confirmed / Closed`) — unlike `BookingList`, which has stage filter pills. |
| `/inquiries/new` (`InquiryForm`) | **High UX Overload** | Packs **7 heavy form blocks** into one unbroken 730-line vertical scroll (Subject/Category → Dynamic Category Specs → Per-sq.m Price Predictor → Itemized Add-on Checkboxes → Ocular Visit & Budget Comment → Description + AI Requirement Organizer + Editable AI Summary → Date/Location + Up to 5 Photo Uploads + Per-Photo AI Analysis). High form fatigue on laptop and mobile. Also `ProtectedRoute` (`App.jsx:313-316`) allows `gardener` role to visit `/inquiries/new` even though `POST /api/inquiries` is `client`-only (returns `403` on submit instead of guarding on page entry!). |
| `/inquiries/:inquiryId` (`InquiryDetails`) | **Confirmed Defect + UX** | (1) Plain `<p>Loading inquiry...</p>` without skeleton. (2) Unformatted `₱${quote.amount}` and `₱${activeAgreement.amount}` (missing `.toLocaleString()`). (3) Heavy inline `style={{ ... }}` across comparison boxes, AI summary cards, and revision history (`lines 1069, 1098, 1314-1344, 1415`), bypassing CSS tokens. (4) Offer comparison cards stack vertically one-by-one rather than offering a clean side-by-side comparison table/grid when 2+ offers arrive. |
| `/bookings` (`BookingList`) | **Confirmed Defect** | **Empty-State Flash (`BookingPage.jsx:1704-1731, 1787`):** Has **no `loading` state** at all! On every visit, clients briefly see `"You do not have any reservations or bookings yet."` before `bookingsApi.list()` resolves — followed by N+1 `fetchInquiryImages` calls. |
| `/bookings/new` (`BookingForm`) | **Good (Minor UX)** | Live schedule/crew availability preview, debounced slot check, and auto-calculate end time are strong. Minor: `Exact service location` is a plain text input rather than pre-filling from Client's saved structured address or offering `StructuredAddressFields`. |
| `/bookings/:bookingId` (`BookingDetails`) | **High UX Density** | The 4-step progress stepper, Next-Step guidance banner, Online/Manual payment tabs, and accessible Sandbox/Rejection modals are **very well built**. However, **~900 lines of UI** (payment totals, checkout form, payment history, schedule facts, mutual agreement summary, notes, status controls, reschedule/cancel drawers, closing checklist, and review form) are stacked inside one single `max-width: 760px` column (`App.css:69`), forcing heavy vertical scrolling to reach actions, mutual agreement terms, or review forms. |
| `/messages` (`CommunicationPage`) | **UX Improvement** | Clean inbox + thread view. Missing: loading skeleton for conversation list, keyboard `Enter` hint / auto-scroll-to-bottom on new message, and search/filter by name or inquiry subject. |
| `/notifications` (`CommunicationPage`) | **Confirmed Defect (Clerk) + UX** | Clean compact feed with `All / Unread` filter. Bugs: (1) Marking read does not update `AppSidebar` badges live; (2) **"Open messages"** header button (`line 141`) is shown to `clerk` users even though `/messages` redirects clerks back to `/dashboard`; (3) Booking notifications route clerks to `/bookings/:id` (blocked by `ProtectedRoute`), bouncing them to `/dashboard`. |
| `/assistant` (`AssistantPage.jsx`) | **Confirmed Defect + UX** | (1) Back link (`line 50`) goes to `/` (`Back home`) instead of `/dashboard`, sending authenticated users back to the public marketing page. (2) No link to `/assistant` in `AppSidebar` (only reachable via the floating widget's tiny external-link icon or dashboard CTA). (3) `answer` renders as raw `white-space: pre-wrap` plain text (`line 103`), so Gemini markdown (`**bold**`, bullet lists, headings) displays raw asterisks/hashes instead of formatted text. |

---

### 2.3 Gardener / Service Provider (`UserDashboard`, `GardenerTools`, `GardenerScheduleCalendar`, `GardenerClerksPanel`, `InquiryPage`, `BookingPage`)

| Page / Route | Finding Type | Verified Observation |
|---|---|---|
| `/dashboard` (`Gardener` Overview) | **Confirmed Defects** | (1) **False Red Error Flash (`DashboardPage.jsx:1479-1485`):** Because `initialProfile` has `is_approved: undefined` and `DashboardPage` has no initial `loading` gate, **every approved gardener sees a red error box** (`"Your gardener profile is waiting for administrator approval..."`) flash on screen every time they load `/dashboard` until `profileApi.get()` finishes. (2) **Missing Category Dropdown (`DashboardPage.jsx:1054-1098`):** `GardenerOpportunityShowcase` lacks the live category dropdown even though `GET /api/ai/recommendations?mode=leads` now supports `categoryId`. (3) **Sidebar Navigation Omission:** `My services`, `Portfolio`, `My Clerks`, and `Marketplace` are missing from the Gardener left sidebar (`profiles.js:196-205`). (4) **Earnings & Transactions Visibility Gap:** Gardeners have no earnings summary widget (total verified payments received, pending deposits, completed jobs value) on their Overview — they must click into each booking individually. |
| `/dashboard?tab=services` (`GardenerTools`) | **Confirmed Functional Gaps** | (1) **No Re-Activate Button (`DashboardPage.jsx:584`):** Deactivated services (`is_active = 0`) hide all action buttons — a gardener **cannot re-activate their own paused service** (only a Clerk or Admin can!). (2) **No Confirmation Before Deactivation (`line 590`):** Clicking the Trash icon immediately deactivates a live service with zero modal confirmation. (3) **No Form Reset Scroll/Highlight on Edit:** Clicking Edit populates the top form silently without scrolling to it when the service list is long. |
| `/dashboard?tab=portfolio` (`GardenerTools`) | **Confirmed UX Gap** | Clicking Trash (`line 514`) immediately deletes a portfolio photo permanently with zero confirmation modal; no image preview before upload. |
| `/dashboard?tab=clerks` (`GardenerClerksPanel`) | **Strong (Maintain!)** | Clean 2-tab Create / Link Existing flow, password visibility toggle, skeleton loading, empty state, and accessible Escape/backdrop revoke modal. Minor: "Create New Clerk Account" uses a plain password field without a quick "Copy credentials" helper after creation. |
| `GardenerScheduleCalendar` (inside Overview) | **Strong (Minor Mobile UX)** | Excellent urgency strip (`Overdue`, `Urgent Today`, `Due Tomorrow`, `Action`), crew/capacity indicators, day agenda, and quick date blocking. Minor: (1) Starts collapsed (`isOpen = false`) even when `overdue` or `urgentToday` jobs exist; (2) 7-column month grid pills (`cal-pill-booked`, `cal-pill-reserved`, `cal-pill-full`) become tight/clipped on narrow mobile screens (`<= 430px`). |
| `/inquiries/:inquiryId` (`InquiryDetails` Mobile) | **Confirmed Mobile Defect** | `App.css:65` applies `.inquiry-detail-grid .dashboard-panel:last-child { order: -1; }` at `<= 760px`, pushing the Gardener's **Send Offer form ABOVE the client's Project Details & Garden Photos** on mobile! Gardeners must scroll past the form to read the request. |
| `/bookings/:bookingId` (`BookingDetails`) | **Good (See Client Notes)** | Clear `Start service` / `Mark completed` / `Verify payment` / `Reject` (styled modal) actions and dual-role mismatch banner (`roleModeMismatch`). Shares the single-column vertical density issue noted in Section 2.2. |

---

### 2.4 Assigned Clerk (`ClerkDashboard`, `/notifications`, `/services`)

| Page / Route | Finding Type | Verified Observation |
|---|---|---|
| `/dashboard` (`ClerkDashboard.jsx`) | **Confirmed Critical/High Defects** | (1) **Missing CSS Classes:** `.dashboard-stats` (`line 333`), `.weekday-picker` & `.weekday-chip` (`lines 493, 500`), and `.clerk-gardener-bar` (`line 368`) do **not** exist in `App.css` — breaking KPI cards and working-day selector buttons visually. (2) **Outdated Empty-State Copy (`line 363`):** Still tells unassigned clerks *"so they can link you during sign-up"* even though signup-time clerk assignment was removed. (3) **Inline Reject Input vs Modal (`lines 461-476`):** Uses a cramped inline text box next to each payment instead of the clean accessible rejection modal used in `BookingPage.jsx`. (4) **No Booking Detail Drill-Down:** Recent bookings table (`lines 770-800`) displays static rows without clicking through (since `/bookings/:id` is blocked for clerks) and lacks mobile responsive stacking. (5) **No Account/Profile Settings:** Clerks cannot access `/profile` (`App.jsx:313` redirects them to `/dashboard`) and have no way to update their own phone number or avatar. |
| `/notifications` (`CommunicationPage.jsx`) | **Confirmed Critical Functional Bug** | (1) **"Open messages"** button (`line 141`) routes Clerks to `/messages` → blocked by `ProtectedRoute` → silently bounces back to `/dashboard`. (2) Clicking any **`booking` / payment notification** routes Clerks to `/bookings/:id` → blocked by `ProtectedRoute` → silently bounces back to `/dashboard` instead of `/dashboard?tab=payments`. |

---

### 2.5 Administrator (`AdminDashboard`: 7 Tabs + `/inquiries/:inquiryId` + `/services` + `/assistant`)

| Page / Route | Finding Type | Verified Observation |
|---|---|---|
| Navigation (`AppSidebar` + `AdminDashboard`) | **Confirmed Defects + UX** | (1) **`Pricing` Missing Icon (`AppSidebar.jsx:80-96`):** Falls back to `ClipboardList`, duplicating `Reports`. (2) **Duplicated 7-Tab Navigation:** All 7 Admin tabs appear simultaneously in the left sidebar AND in `.dashboard-tabs-top` (`DashboardPage.jsx:1906-1914`), causing crowded wrapping on laptop/tablet. (3) **No Admin Notifications Page (`App.jsx:310`):** Backend `/api/notifications` supports `administrator`, yet frontend blocks `/notifications` for admins and omits it from Admin sidebar. |
| `Overview` (`?tab=overview`) | **Confirmed CSS Defect** | Pending gardener badge (`line 1968`) uses undefined `.status-badge` instead of `.inquiry-status`, losing badge pill styling. Also no initial loading skeleton (`0` flash while `adminSummary` loads). |
| `Analytics` (`?tab=analytics`) | **Confirmed Functional Data Bug** | Line 2010 filters active bookings with `b.status === 'confirmed' || b.status === 'in_progress' || b.status === 'pending'`. Because MySQL `bookings.status` uses **`'accepted'`** (not `'confirmed'`), **every newly confirmed agreement booking is excluded from the `Upcoming / active bookings` metric!** Also `activity` returns `LIMIT` slices (recent rows) rather than full DB totals, while displaying them as `"across all bookings"`. |
| `Approvals` (`?tab=approvals`) | **Confirmed UX Defect** | `updateGardenerApproval` (`lines 1856-1857`) still triggers blocking native `window.confirm()` and `window.prompt()` dialogs instead of an accessible styled modal. Also `Services` & `Categories` moderation lists have no search/filter bar. |
| `Pricing` (`?tab=pricing`) | **Confirmed CSS Defect** | Uses undefined `.manage-list` and `.manage-item` (`lines 2324, 2326, 2401, 2403`) instead of `.managed-list` / `.managed-item`, causing both Category Labor Rates and Pricing Add-Ons lists to render unstyled without borders, flex row spacing, or visual separation. |
| `Activity` (`?tab=activity`) | **UX Improvement** | Inquiries link cleanly to `/inquiries/:id`, while Bookings (`lines 2464-2470`) are non-clickable static rows with no status filter, date filter, or search box, and hard-capped at `slice(0, 20)` without pagination. |
| `Reports` (`?tab=reports`) | **UX Improvement** | Raw `<select>` changes report status immediately without saving indicator or `resolutionNotes` input — even though backend `PATCH /api/admin/reports/:reportId` accepts `resolutionNotes`! |
| `Accounts` (`?tab=accounts`) | **High Usability Gap** | Flat `<table>` (`lines 2538-2593`) has **no search input** (by name/email), **no role filter** (`All / Client / Gardener / Clerk / Admin`), **no active/inactive filter**, and **no pagination**. On mobile (`<= 640px`), the 4-column table with 3 inline action buttons requires awkward horizontal scrolling. Good: styled delete confirmation modal (`lines 2689-2713`) is already well implemented. |

---

## 3. What Should NOT Be Changed (Preserve These Strengths)

Not everything needs redesigning. The following existing elements already deliver strong UX, clear visual identity, or solid engineering and **should be preserved and reused**:

1. **Three-Color Editorial Visual Identity (`index.css`):** The Forest (`#244B36`), Ivory (`#F7F5EC`), and Warm Amber (`#D99A36`) palette paired with `Playfair Display` headings and `DM Sans` UI typography feels authentic to a Zamboanga City gardening marketplace and gives HugaTiera a distinct brand identity. Keep these tokens.
2. **Editorial Public Landing Page (`HomePage` in `App.jsx`):** Strong hero composition, clear 4-step process walkthrough, live category cards, recently added services strip, and responsive mobile header menu. Only fix the guest `/assistant` link behavior (no visual overhaul needed).
3. **2-Card, 3-Step Registration Wizard & Login Page (`AuthPage.jsx`):** The new split-screen login (with recent-email quick fill and password eye toggle) and the 2-card (`Find a gardener` / `Offer services`) 3-step registration wizard (`1. About you` → `2. Details` → `3. Account`) with live 18+ age validation are clean, focused, and already aligned with modern onboarding standards.
4. **Reusable `StructuredAddressFields` Component & `zamboangaAddress.js` Utility:** Clean 6-field Philippine/Zamboanga City billing-style address input with 70 barangays, manual fallback, live preview, and round-trip parsing. Preserve and reuse (e.g., optionally offer on `/bookings/new` exact location).
5. **Booking 4-Step Progress Stepper & Next-Step Guidance Banner (`BookingPage.jsx:677-864`):** The dynamic state-aware `nextStepGuidance` banner and 4-step progress tracker (`Reserved` → `Paid & Confirmed` → `Service Completed` → `Closed & Rated`) make a complex multi-stage workflow immediately understandable. Keep this core UX pattern while reorganizing the page into cleaner 2-column/tabbed sections.
6. **Online Checkout + Manual Receipt Tabs & Sandbox Demo Modal (`BookingPage.jsx:887-1079`):** The 2-tab payment channel switcher, quick-fill deposit/balance buttons, and accessible Escape/backdrop modal design are solid — reuse that modal pattern as a shared `<Modal />` component across the app.
7. **`GardenerClerksPanel.jsx` (`My Clerks`):** Clean Create/Link tabbed flow, empty state, and accessible revocation modal — preserve as-is.
8. **AI Smart Recommendations Filter Bar (`ClientDiscoveryShowcase`):** The live category dropdown, sort pills (`AI Smart Match`, `Nearest First`, `Highest Rated`, `Best Service Conduct`), conduct/rating toggles, and AI match reason chips work well — extend the same category dropdown to `GardenerOpportunityShowcase`.
9. **`ProtectedRoute` Offline/503 Recovery Screen (`ProtectedRoute.jsx:8-22`):** Distinguishing `401` from backend/DB downtime (`503`) with a **Try again** button prevents false logouts and should be preserved untouched.
10. **Core Business Workflow Guardrails:** Keep mutual agreement version gating before booking creation, `sharp` EXIF/GPS stripping on uploads, provider-managed Clerk restriction, and advisory-only AI boundaries completely intact.
