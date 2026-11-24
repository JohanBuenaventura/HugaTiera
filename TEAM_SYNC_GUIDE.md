# HugaTiera — Teammate & AI Agent Sync Guide (`mergedbranchv1`)

Use this guide whenever you pull **`mergedbranchv1`** (or future updates) onto a teammate's machine so your local MySQL database, `.env` configuration, dependencies, and running servers stay in sync—preventing `500 Internal Server Error` (`Unknown column ...`), stale-route JSON errors, and Git merge conflicts.

---

## 1. Quick Copy-Paste Prompt for Your AI Coding Agent

If you are using an AI coding agent (Antigravity, Cursor, Copilot, Claude Code, etc.), paste this prompt right after switching to `mergedbranchv1`:

```text
Read TEAM_SYNC_GUIDE.md and AGENTS.md, then sync my local environment for branch mergedbranchv1:
1. Verify I am on mergedbranchv1 and check git status without discarding any of my uncommitted work.
2. Inspect my local hugatiera_db and hugatiera_db_migration_test table/column counts (read-only) to determine which migrations from database/migrations/001..013 are missing.
3. Ask my approval first, then back up hugatiera_db to database/backups/ and apply ONLY the missing migrations in numerical order (do NOT rerun already-applied migrations).
4. Sync backend/.env keys against backend/.env.example without overwriting my existing secrets, and run npm install in backend and frontend if needed.
5. Restart the backend/frontend dev servers if stale, verify GET http://localhost:5000/api/health, and run frontend lint/build + backend tests against hugatiera_db_migration_test.
```

---

## 2. Branch & Anti-Conflict Rules

- **Active integrated branch:** Work from **`mergedbranchv1`** (created from `hugatierav2` with role-switch error feedback, Option 3 automatic Client mode for Gardeners, and updated documentation).
- **Do NOT merge `feature/registration-profile-details` into `mergedbranchv1`:**
  - All user-facing features from `feature/registration-profile-details` (optional middle name, 18+ birthday, mobile number, dual-role switching) are already integrated in `mergedbranchv1`.
  - Merging it directly causes **20 file conflicts** and **duplicate `003` / `004` migration numbering**.
- **Adding new migrations in the future:**
  - Migrations **`001` through `013`** are already used in `database/migrations/`.
  - Any new database change **must** start at **`014_<descriptive_name>.sql`** with a matching **`014_<descriptive_name>_rollback.sql`**, and must also update `database/schema/hugatiera_schema.sql`.
  - Always commit your `.sql` migration file in the **same branch/PR** as the backend code that queries the new columns.

---

## 3. Check Your Local Database Schema Before Logging In

The most common error after pulling `mergedbranchv1` is a **`500 Internal Server Error`** on login:

```text
Error: Unknown column 'can_act_as_client' in 'field list'
```

This happens because the backend expects the **25-table, 59-foreign-key** schema (Migrations `001`–`013`), while your local `hugatiera_db` is still at an older migration (for example, `19` tables at Migration `002`).

### Step 3.1 — Inspect Your Current Local Schema (Read-Only)
Start MySQL in XAMPP, then run:

```powershell
c:\xampp\mysql\bin\mysql.exe -u root -e "
SELECT TABLE_SCHEMA, COUNT(*) AS table_count
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA IN ('hugatiera_db', 'hugatiera_db_migration_test')
GROUP BY TABLE_SCHEMA;

SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'hugatiera_db'
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME IN ('avatar_path', 'middle_name', 'date_of_birth', 'can_act_as_client', 'can_act_as_gardener');
"
```

- **Target state (`mergedbranchv1`):** `25` tables, `59` foreign keys, and all 5 `users` columns above exist.
- If `table_count` is **`25`** and all 5 columns exist, your database is already up to date—skip to Section 4.

### Step 3.2 — Back Up Your Local `hugatiera_db` First (Mandatory)
Always create a backup before applying migrations:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
c:\xampp\mysql\bin\mysqldump.exe -u root --routines --triggers hugatiera_db > "database/backups/hugatiera_db_backup_$stamp.sql"
```

### Step 3.3 — Apply Missing Migrations (Choose Path A or Path B)

#### Path A: Existing `hugatiera_db` With Data You Want to Keep
Use this checklist to see which migrations you still need, and apply **only** the missing ones in strict numerical order:

| Migration File | Already Applied If This Exists in `hugatiera_db` |
|---|---|
| `001_unified_requests_and_agreements.sql` | Table `agreements` exists |
| `002_avatars_service_images.sql` | Column `users.avatar_path` exists |
| `003_user_basic_info.sql` | Column `users.middle_name` exists |
| `004_inquiry_price_estimator.sql` | Column `inquiries.area_sqm` exists |
| `005_scheduling_availability_capacity.sql` | Table `gardener_unavailable_dates` exists |
| `006_itemized_pricing_settings.sql` | Table `pricing_addons` exists |
| `007_reservation_payment_workflow.sql` | Table `booking_payments` exists |
| `008_transaction_completion_agreement.sql` | Column `bookings.transaction_status` exists |
| `009_event_cancellation_and_reschedule.sql` | Table `booking_reschedule_requests` exists |
| `010_inquiry_category_specs.sql` | Column `inquiries.category_specs` exists |
| `011_crew_capacity_workers.sql` | Column `gardener_profiles.crew_size` exists |
| `012_dual_role_and_assigned_clerk.sql` | Table `clerk_gardener_assignments` exists |
| `013_payment_gateway_sessions.sql` | Column `booking_payments.gateway_provider` exists |

Example (upgrading a database currently at Migration `002` with `19` tables):

```powershell
$ErrorActionPreference = 'Stop'
$migs = @(
  'database/migrations/003_user_basic_info.sql',
  'database/migrations/004_inquiry_price_estimator.sql',
  'database/migrations/005_scheduling_availability_capacity.sql',
  'database/migrations/006_itemized_pricing_settings.sql',
  'database/migrations/007_reservation_payment_workflow.sql',
  'database/migrations/008_transaction_completion_agreement.sql',
  'database/migrations/009_event_cancellation_and_reschedule.sql',
  'database/migrations/010_inquiry_category_specs.sql',
  'database/migrations/011_crew_capacity_workers.sql',
  'database/migrations/012_dual_role_and_assigned_clerk.sql',
  'database/migrations/013_payment_gateway_sessions.sql'
)
foreach ($m in $migs) {
  c:\xampp\mysql\bin\mysql.exe -u root hugatiera_db -e "SOURCE $m;"
}
```

Apply the same missing migrations to `hugatiera_db_migration_test` if you run automated backend tests locally.

#### Path B: Brand-New Local Setup (No Existing Data to Keep)
Import the complete 25-table schema directly (do **not** run `001`–`013` afterward):

```powershell
c:\xampp\mysql\bin\mysql.exe -u root < database/schema/hugatiera_schema.sql
# Optional: seed demo accounts, categories, and approved services
npm --prefix backend run seed:demo
```

---

## 4. Sync Dependencies, `.env`, and Dev Servers

1. **Install any updated packages:**
   ```powershell
   npm --prefix backend install
   npm --prefix frontend install
   ```
2. **Check `backend/.env` against `backend/.env.example`:**
   - Ensure `DB_NAME=hugatiera_db`, `JWT_SECRET` is set, and `FRONTEND_URL=http://localhost:5173`.
   - `PAYMONGO_SECRET_KEY=` is **optional** (leaving it blank automatically enables built-in Sandbox/Demo Checkout mode).
   - `GEMINI_API_KEY=` is optional for local non-AI testing; keep `GEMINI_MODEL=gemini-3.8-flash` and `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite`.
3. **Restart both servers** so Express loads all new routes and Vite picks up all updated components:
   ```powershell
   # Terminal 1
   npm --prefix backend run dev

   # Terminal 2
   npm --prefix frontend run dev
   ```

---

## 5. Post-Sync Verification

1. **Health Check:** Open `http://localhost:5000/api/health` → expect `{"status":"ok","database":"connected"}`.
2. **Frontend Lint & Build:**
   ```powershell
   npm --prefix frontend run lint
   npm --prefix frontend run build
   ```
3. **Automated Backend Tests (against `hugatiera_db_migration_test`):**
   - Run feature & core suites with `$env:DB_NAME="hugatiera_db_migration_test"` (`integration.test.js`, `avatarsServicesAdmin.test.js`, `registrationBasicInfo.test.js`, `inquiryPriceEstimator.test.js`, `schedulingAvailability.test.js`, `reservationPayments.test.js`, `cancellationReschedule.test.js`, `smartAiRecommendations.test.js`, `dualRoleAndClerk.test.js`, `paymentGateway.test.js`).
   - Run Revision Track suites `r2`–`r6` **with `DB_NAME` unset** (`Remove-Item Env:DB_NAME -ErrorAction SilentlyContinue`), because they switch to `hugatiera_db_migration_test` automatically and assert `ORIGINAL_DB !== 'hugatiera_db_migration_test'`.

---

## 6. Common Sync Errors & Instant Fixes

| Error | Cause | Fix |
|---|---|---|
| `Unknown column 'can_act_as_client'` or `'middle_name'` on login (`500`) | Local `hugatiera_db` is missing Migrations `003`–`013`. | Back up `hugatiera_db` and run the missing migrations (Section 3.3). |
| `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` | Stale backend `node server.js` process is running without newly added routes. | Stop the old backend process on port `5000` and restart `npm --prefix backend run dev`. |
| `ER_DUP_FIELDNAME` or `ER_TABLE_EXISTS_ERROR` | Attempted to rerun a migration already applied to `hugatiera_db`. | Check Section 3.3's table and run only migrations not yet present. |
| `Must never run against original database` in `r2`–`r6` tests | `$env:DB_NAME` was set to `hugatiera_db_migration_test` before running `r2`–`r6`. | Run `Remove-Item Env:DB_NAME -ErrorAction SilentlyContinue` before running `r2`–`r6`. |
| `R2-02` fails with file-count mismatch (`0 !== 2`) | Leftover test files in `backend/uploads/request-images/originals/`. | Re-run `node --test backend/tests/r2.requestImages.test.js` standalone after the orphan sweep clears them. |
