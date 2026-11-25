# HugaTiera — Database Schema, ERD & Migration Documentation

This directory contains the authoritative relational schema, migration scripts, and database documentation for **HugaTiera**.

---

## 1. Database Overview

| Property | Value |
|---|---|
| **Production Database** | `hugatiera_db` |
| **Automated Test Database** | `hugatiera_db_migration_test` |
| **Database Engine** | MySQL 8.0.16+ / MariaDB 10.4.32 (XAMPP) — `InnoDB` |
| **Character Set & Collation** | `utf8mb4` / `utf8mb4_unicode_ci` |
| **Total Tables** | `25` |
| **Total Foreign Key Constraints** | `59` |
| **Fresh-Install Schema** | `database/schema/hugatiera_schema.sql` |
| **Migrations Directory** | `database/migrations/` (`001` through `013`, each with a `_rollback.sql` script) |
| **Optional Local Demo Seed** | `database/seeds/zamboanga_demo_data.sql` (idempotent Zamboanga City providers/services/bookings/reviews for `hugatiera_db` only; keep `hugatiera_db_migration_test` clean) |
| **Full 25-Table ERD & DFDs** | [docs/erd-and-dfd.md](../docs/erd-and-dfd.md) |
| **Local Backups Directory** | `database/backups/` (git-ignored) |

> [!CAUTION]
> **Database Migration Status (`main`):** Migrations `001`–`013` have been backed up (`hugatiera_db_pre_migrations003_013_20261124_1950.sql`), applied, and verified on both `hugatiera_db_migration_test` and local `hugatiera_db` (`25` tables, `59` foreign keys). **Do NOT rerun already-applied migrations.** For brand-new installations, import `database/schema/hugatiera_schema.sql` directly.

---

## 2. Entity Relationship Diagram (ERD)

The Mermaid Entity Relationship Diagram below represents all **25 tables** and **59 foreign keys** in the current `hugatiera_db` schema (Migrations `001`–`013`), including primary keys (`PK`), foreign keys (`FK`), unique keys (`UK`), and relationship cardinalities (`||` mandatory one, `|o` optional one, `o{` zero or many).

```mermaid
erDiagram
  users ||--o| client_profiles : "has client profile"
  users ||--o| gardener_profiles : "has gardener profile"
  users ||--o{ gardener_unavailable_dates : "blocks unavailable dates"
  users ||--o{ clerk_gardener_assignments : "assigned clerk"
  users ||--o{ clerk_gardener_assignments : "managed gardener"
  users |o--o{ clerk_gardener_assignments : "assigned by"
  users ||--o{ services : "gardener offers"
  service_categories ||--o{ services : "categorizes"
  users ||--o{ portfolios : "gardener uploads"

  users ||--o{ inquiries : "client submits"
  users |o--o{ inquiries : "direct target or selected gardener"
  services |o--o{ inquiries : "optional service"
  service_categories |o--o{ inquiries : "optional category"
  inquiries ||--o{ inquiry_estimate_items : "itemized estimate lines"
  pricing_addons |o--o{ inquiry_estimate_items : "catalog addon"

  inquiries |o--o{ request_images : "has attached photos"
  users ||--o{ request_images : "uploaded by"
  request_images |o--o{ request_images : "parent original image"

  inquiries ||--o{ quotations : "receives offers/responses"
  users ||--o{ quotations : "gardener submits"
  quotations ||--o{ quotation_revisions : "snapshots prior revisions"

  inquiries ||--o{ agreements : "negotiates agreement"
  quotations |o--o{ agreements : "derived from offer"
  users ||--o{ agreements : "client party"
  users ||--o{ agreements : "gardener party"
  users ||--o{ agreements : "proposed by"
  agreements |o--o| agreements : "supersedes previous version"

  agreements |o--o| bookings : "creates reservation"
  inquiries |o--o{ bookings : "originating request"
  quotations |o--o{ bookings : "originating offer"
  users ||--o{ bookings : "client books"
  users ||--o{ bookings : "gardener fulfills"
  users |o--o{ bookings : "cancelled by"
  services |o--o{ bookings : "booked service"

  bookings ||--o{ booking_payments : "records payments"
  users ||--o{ booking_payments : "submitted by"
  users |o--o{ booking_payments : "verified by"

  bookings ||--o{ booking_reschedule_requests : "requests date move"
  users ||--o{ booking_reschedule_requests : "requested by"
  users |o--o{ booking_reschedule_requests : "responded by"

  bookings ||--o| reviews : "reviewed once when closed"
  users ||--o{ reviews : "client writes"
  users ||--o{ reviews : "gardener receives"

  inquiries |o--o{ conversations : "per-provider inquiry thread"
  users ||--o{ conversations : "client participant"
  users ||--o{ conversations : "gardener participant"
  conversations ||--o{ messages : "contains"
  users ||--o{ messages : "sender"

  inquiries ||--o{ request_events : "audit trail"
  quotations |o--o{ request_events : "related offer"
  agreements |o--o{ request_events : "related agreement"
  users |o--o{ request_events : "actor"

  users ||--o{ ai_usage_log : "consumes AI quota"
  users ||--o{ notifications : "receives"

  users ||--o{ reports : "reporter submits"
  users |o--o{ reports : "reported user"
  services |o--o{ reports : "reported service"
  messages |o--o{ reports : "reported message"
  users |o--o{ reports : "resolved by admin"

  users {
    int_unsigned id PK
    varchar email UK
    varchar password_hash
    enum role "client | gardener | clerk | administrator"
    boolean can_act_as_client
    boolean can_act_as_gardener
    varchar first_name
    varchar middle_name
    varchar last_name
    varchar phone
    date date_of_birth
    varchar avatar_path
    boolean is_active
    timestamp created_at
    timestamp updated_at
  }

  client_profiles {
    int_unsigned user_id PK, FK
    varchar address
    varchar city
    text bio
  }

  gardener_profiles {
    int_unsigned user_id PK, FK
    varchar business_name
    text description
    varchar service_area
    tinyint_unsigned years_of_experience
    varchar working_days
    time work_start_time
    time work_end_time
    tinyint_unsigned max_concurrent_jobs
    tinyint_unsigned crew_size
    varchar availability_notes
    boolean is_approved
  }

  gardener_unavailable_dates {
    int_unsigned id PK
    int_unsigned gardener_id FK
    date start_date
    date end_date
    varchar reason
    timestamp created_at
  }

  clerk_gardener_assignments {
    int_unsigned id PK
    int_unsigned clerk_id FK
    int_unsigned gardener_id FK
    int_unsigned assigned_by FK
    varchar notes
    timestamp created_at
  }

  service_categories {
    int_unsigned id PK
    varchar name UK
    text description
    decimal rate_per_sqm_min
    decimal rate_per_sqm_max
    decimal min_base_fee
    boolean is_active
    timestamp created_at
  }

  pricing_addons {
    int_unsigned id PK
    varchar name UK
    enum item_type "plant | material | equipment | disposal"
    varchar unit
    decimal unit_price_min
    decimal unit_price_max
    varchar description
    boolean is_active
    timestamp created_at
    timestamp updated_at
  }

  services {
    int_unsigned id PK
    int_unsigned gardener_id FK
    int_unsigned category_id FK
    varchar title
    text description
    decimal indicative_price
    varchar price_unit
    varchar service_area
    tinyint_unsigned workers_required
    varchar image_path
    boolean is_active
    timestamp created_at
    timestamp updated_at
  }

  portfolios {
    int_unsigned id PK
    int_unsigned gardener_id FK
    varchar title
    text description
    varchar image_path
    timestamp created_at
  }

  inquiries {
    int_unsigned id PK
    enum request_type "direct | general"
    int_unsigned client_id FK
    int_unsigned gardener_id FK "NULL for unassigned general requests"
    int_unsigned service_id FK
    varchar subject
    text description
    date requested_date
    varchar location
    decimal area_sqm
    enum work_complexity "light | moderate | heavy"
    enum materials_option "client_provides | gardener_provides"
    boolean site_visit_requested
    decimal estimated_labor_min
    decimal estimated_labor_max
    decimal estimated_materials_min
    decimal estimated_materials_max
    decimal estimated_min_amount
    decimal estimated_max_amount
    text price_comment
    json category_specs
    enum status "open | responded | closed | cancelled | provider_selected | in_agreement | confirmed | expired"
    timestamp created_at
    timestamp updated_at
    int_unsigned category_id FK
    text ai_summary
    datetime expires_at
  }

  inquiry_estimate_items {
    int_unsigned id PK
    int_unsigned inquiry_id FK
    int_unsigned addon_id FK
    varchar item_name
    enum item_type "plant | material | equipment | disposal"
    varchar unit
    decimal quantity
    decimal unit_price_min
    decimal unit_price_max
    decimal subtotal_min
    decimal subtotal_max
    timestamp created_at
  }

  request_images {
    int_unsigned id PK
    int_unsigned inquiry_id FK "NULL while draft"
    int_unsigned uploaded_by FK
    enum kind "original | ai_generated"
    int_unsigned parent_image_id FK
    varchar file_path
    varchar mime_type
    int_unsigned file_size
    text ai_description
    timestamp created_at
  }

  quotations {
    int_unsigned id PK
    int_unsigned inquiry_id FK
    int_unsigned gardener_id FK
    decimal amount
    decimal labor_amount
    decimal materials_amount
    text materials_breakdown
    text details
    date availability_start
    date availability_end
    decimal estimated_working_days
    decimal estimated_hours
    enum status "draft | sent | accepted | declined | expired | withdrawn"
    date valid_until
    timestamp created_at
    timestamp updated_at
    enum response_type "interest | offer | feasible | modifications | cannot_do"
    text proposed_changes
    boolean requires_site_visit
    int_unsigned revision_number
    timestamp locked_at
    tinyint_unsigned active_flag "GENERATED STORED"
  }

  quotation_revisions {
    int_unsigned id PK
    int_unsigned quotation_id FK
    int_unsigned revision_number
    varchar response_type
    decimal amount
    decimal labor_amount
    decimal materials_amount
    text materials_breakdown
    text details
    text proposed_changes
    boolean requires_site_visit
    date availability_start
    date availability_end
    decimal estimated_working_days
    decimal estimated_hours
    date valid_until
    timestamp created_at
  }

  agreements {
    int_unsigned id PK
    int_unsigned inquiry_id FK
    int_unsigned quotation_id FK
    int_unsigned client_id FK
    int_unsigned gardener_id FK
    int_unsigned previous_agreement_id FK
    int_unsigned version
    text scope_of_work
    decimal amount
    decimal required_deposit_amount
    varchar price_basis
    datetime scheduled_start
    datetime scheduled_end
    decimal estimated_working_days
    varchar location
    text conditions
    int_unsigned proposed_by FK
    timestamp client_approved_at
    timestamp gardener_approved_at
    enum status "proposed | agreed | superseded | cancelled"
    int_unsigned active_key "GENERATED STORED UK"
    timestamp created_at
    timestamp updated_at
  }

  bookings {
    int_unsigned id PK
    int_unsigned inquiry_id FK
    int_unsigned quotation_id FK
    int_unsigned client_id FK
    int_unsigned gardener_id FK
    int_unsigned service_id FK
    datetime scheduled_start
    datetime scheduled_end
    varchar location
    text notes
    enum status "pending | accepted | declined | in_progress | completed | cancelled"
    enum booking_stage "reserved | booked"
    enum payment_status "unpaid | pending_verification | partially_paid | fully_paid"
    decimal required_deposit_amount
    decimal amount_paid
    timestamp paid_at
    enum transaction_status "open | pending_closure | closed"
    timestamp client_completion_confirmed_at
    timestamp gardener_completion_confirmed_at
    timestamp transaction_closed_at
    text completion_agreement_notes
    enum cancellation_reason_type "typhoon_weather | accident_emergency | schedule_conflict | scope_or_plan_change | property_access_issue | other"
    varchar cancellation_reason
    int_unsigned cancelled_by FK
    timestamp cancelled_at
    timestamp requested_at
    timestamp updated_at
    int_unsigned agreement_id FK, UK "NULL only on legacy rows"
  }

  booking_payments {
    int_unsigned id PK
    varchar transaction_code UK
    int_unsigned booking_id FK
    int_unsigned submitted_by FK
    enum payment_type "partial | full | balance"
    enum payment_method "gcash | maya | grab_pay | card | bank_transfer | cash | other"
    enum gateway_provider "manual | paymongo | sandbox_demo"
    varchar gateway_session_id
    varchar gateway_checkout_url
    enum gateway_status "none | awaiting_payment | paid | failed | cancelled"
    timestamp gateway_paid_at
    decimal amount
    varchar reference_number
    varchar receipt_path
    varchar notes
    enum status "pending | verified | rejected"
    int_unsigned verified_by FK
    timestamp verified_at
    varchar rejection_reason
    timestamp created_at
    timestamp updated_at
  }

  booking_reschedule_requests {
    int_unsigned id PK
    int_unsigned booking_id FK
    int_unsigned requested_by FK
    enum reason_type "typhoon_weather | accident_emergency | schedule_conflict | scope_or_plan_change | property_access_issue | other"
    varchar reason_details
    datetime previous_start
    datetime previous_end
    datetime proposed_start
    datetime proposed_end
    enum status "pending | approved | declined | cancelled"
    int_unsigned responded_by FK
    timestamp responded_at
    varchar response_note
    timestamp created_at
    timestamp updated_at
  }

  reviews {
    int_unsigned id PK
    int_unsigned booking_id FK, UK
    int_unsigned client_id FK
    int_unsigned gardener_id FK
    tinyint_unsigned rating
    text review_text
    boolean is_visible
    timestamp created_at
  }

  conversations {
    int_unsigned id PK
    int_unsigned client_id FK
    int_unsigned gardener_id FK
    int_unsigned inquiry_id FK
    timestamp created_at
  }

  messages {
    int_unsigned id PK
    int_unsigned conversation_id FK
    int_unsigned sender_id FK
    text message_text
    timestamp sent_at
    timestamp read_at
  }

  notifications {
    int_unsigned id PK
    int_unsigned user_id FK
    varchar notification_type
    varchar title
    text message
    varchar related_entity_type
    int_unsigned related_entity_id
    timestamp read_at
    timestamp created_at
  }

  reports {
    int_unsigned id PK
    int_unsigned reporter_id FK
    int_unsigned reported_user_id FK
    int_unsigned reported_service_id FK
    int_unsigned reported_message_id FK
    varchar reason
    text details
    enum status "open | reviewing | resolved | dismissed"
    int_unsigned resolved_by FK
    text resolution_notes
    timestamp created_at
    timestamp resolved_at
  }

  request_events {
    int_unsigned id PK
    int_unsigned inquiry_id FK
    int_unsigned quotation_id FK
    int_unsigned agreement_id FK
    int_unsigned actor_id FK
    varchar event_type
    varchar from_status
    varchar to_status
    varchar note
    timestamp created_at
  }

  ai_usage_log {
    int_unsigned id PK
    int_unsigned user_id FK
    enum feature "requirements | photo_analysis | garden_plan"
    int_unsigned inquiry_id
    int_unsigned request_image_id
    varchar model
    enum outcome "success | error | rate_limited"
    varchar error_code
    timestamp created_at
  }
```

---

## 3. Complete Table-by-Table Schema Reference (25 Tables)

### 3.1 `users`
- **Purpose:** Stores core authentication credentials, role assignment, dual-role capability flags, basic profile verification fields, avatar path, and activation state for all platform users.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Unique Constraints:** `email` (`UNIQUE`)
- **Indexes:** `idx_users_role_active (role, is_active)`
- **Business Rules:**
  - Public registration (`POST /api/auth/register`) permits `'client'` and `'gardener'` (which automatically enables Client mode via `can_act_as_client = TRUE`); `'administrator'` and `'clerk'` self-registration are rejected (`400`/`403`). Clerk accounts are provider-managed inside **My Clerks** or assigned by an Administrator.
  - `date_of_birth` enforces 18+ age verification on registration and profile updates.
  - `requireAuth` middleware checks `is_active = TRUE` on every authenticated API request so deactivated accounts immediately lose access (`403`).

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `email` | `VARCHAR(255)` | `NOT NULL` | — | Unique login identifier |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` | — | `bcryptjs` hash (`10` salt rounds) |
| `role` | `ENUM('client', 'gardener', 'clerk', 'administrator')` | `NOT NULL` | — | Active role (extended in Migration 012) |
| `can_act_as_client` | `BOOLEAN` (`TINYINT(1)`) | `NOT NULL` | `FALSE` (`0`) | Dual-role client capability (Migration 012) |
| `can_act_as_gardener` | `BOOLEAN` (`TINYINT(1)`) | `NOT NULL` | `FALSE` (`0`) | Dual-role gardener capability (Migration 012) |
| `first_name` | `VARCHAR(100)` | `NOT NULL` | — | User's given name |
| `middle_name` | `VARCHAR(100)` | `NULL` | `NULL` | Optional middle name (Migration 003) |
| `last_name` | `VARCHAR(100)` | `NOT NULL` | — | User's family name |
| `phone` | `VARCHAR(30)` | `NULL` | `NULL` | Contact mobile number |
| `date_of_birth` | `DATE` | `NULL` | `NULL` | 18+ age verification (Migration 003) |
| `avatar_path` | `VARCHAR(255)` | `NULL` | `NULL` | `sharp`-sanitized avatar filename (Migration 002) |
| `is_active` | `BOOLEAN` (`TINYINT(1)`) | `NOT NULL` | `TRUE` (`1`) | Account active flag |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | Last update timestamp |

---

### 3.2 `client_profiles`
- **Purpose:** Stores extended profile attributes specific to users with `role = 'client'`.
- **Primary Key:** `user_id` (`INT UNSIGNED`)
- **Foreign Keys:**
  - `user_id` → `users(id)` `ON DELETE CASCADE` (1:1 relationship with `users`)

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `user_id` | `INT UNSIGNED` | `NOT NULL` | — | PK & FK to `users.id` |
| `address` | `VARCHAR(255)` | `NULL` | `NULL` | Client street/barangay address |
| `city` | `VARCHAR(100)` | `NOT NULL` | `'Zamboanga City'` | Default city |
| `bio` | `TEXT` | `NULL` | `NULL` | Optional garden/client notes |

---

### 3.3 `gardener_profiles`
- **Purpose:** Stores professional details, service area, experience, and administrator approval state for users with `role = 'gardener'`.
- **Primary Key:** `user_id` (`INT UNSIGNED`)
- **Foreign Keys:**
  - `user_id` → `users(id)` `ON DELETE CASCADE` (1:1 relationship with `users`)
- **Indexes:** `idx_gardener_profiles_approved_area (is_approved, service_area)`
- **Business Rules:**
  - New gardeners default to `is_approved = FALSE`.
  - Unapproved gardeners cannot appear in public `/api/services` searches, cannot view the Open Service Requests Board (`GET /api/inquiries/open`), and cannot receive or respond to inquiries.
  - Because `business_name` is nullable, all backend queries and frontend views fall back to `CONCAT(u.first_name, ' ', u.last_name)` when `business_name` is `NULL` or blank (`COALESCE(NULLIF(TRIM(gp.business_name), ''), CONCAT(u.first_name, ' ', u.last_name))`).

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `user_id` | `INT UNSIGNED` | `NOT NULL` | — | PK & FK to `users.id` |
| `business_name` | `VARCHAR(150)` | `NULL` | `NULL` | Optional trade/business name |
| `description` | `TEXT` | `NULL` | `NULL` | Gardener bio and specialties |
| `service_area` | `VARCHAR(150)` | `NOT NULL` | `'Zamboanga City'` | Primary coverage area |
| `years_of_experience` | `TINYINT UNSIGNED` | `NULL` | `NULL` | `0`–`80` years validated by API |
| `working_days` | `VARCHAR(64)` | `NOT NULL` | `'mon,tue,wed,thu,fri,sat,sun'` | Comma-separated working weekdays (Migration 005) |
| `work_start_time` | `TIME` | `NOT NULL` | `'08:00:00'` | Daily start of operating hours (Migration 005) |
| `work_end_time` | `TIME` | `NOT NULL` | `'17:00:00'` | Daily end of operating hours (Migration 005) |
| `max_concurrent_jobs` | `TINYINT UNSIGNED` | `NOT NULL` | `1` | Simultaneous job capacity (Migration 005) |
| `crew_size` | `TINYINT UNSIGNED` | `NOT NULL` | `1` | Daily worker headcount (Migration 011) |
| `availability_notes` | `VARCHAR(255)` | `NULL` | `NULL` | Optional scheduling notes (Migration 005) |
| `is_approved` | `BOOLEAN` (`TINYINT(1)`) | `NOT NULL` | `FALSE` (`0`) | Set by administrator moderation |

---

### 3.4 `gardener_unavailable_dates` *(Added in Migration 005)*
- **Purpose:** Stores blocked/unavailable date ranges for gardeners (vacations, maintenance, or personal days).
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:** `gardener_id` → `users(id)` `ON DELETE CASCADE`
- **CHECK Constraints:** `chk_unavailable_dates_range` (`end_date >= start_date`)
- **Indexes:** `idx_gardener_unavailable_range (gardener_id, start_date, end_date)`

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `gardener_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to gardener (`users.id`) |
| `start_date` | `DATE` | `NOT NULL` | — | First blocked date |
| `end_date` | `DATE` | `NOT NULL` | — | Last blocked date (`>= start_date`) |
| `reason` | `VARCHAR(255)` | `NULL` | `NULL` | Optional reason |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |

---

### 3.5 `clerk_gardener_assignments` *(Added in Migration 012)*
- **Purpose:** Maps Assigned Clerks (`role = 'clerk'`) to the specific gardener(s) they are authorized to assist via `/api/clerk/*`.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `clerk_id` (`fk_cga_clerk`) → `users(id)` `ON DELETE CASCADE`
  - `gardener_id` (`fk_cga_gardener`) → `users(id)` `ON DELETE CASCADE`
  - `assigned_by` (`fk_cga_assigned_by`) → `users(id)` `ON DELETE SET NULL`
- **Unique Constraints:** `uq_clerk_gardener (clerk_id, gardener_id)`
- **Indexes:** `idx_cga_gardener (gardener_id)`

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `clerk_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to clerk (`users.id`) |
| `gardener_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to gardener (`users.id`) |
| `assigned_by` | `INT UNSIGNED` | `NULL` | `NULL` | FK to assigning gardener or admin |
| `notes` | `VARCHAR(255)` | `NULL` | `NULL` | Optional role/delegation notes |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |

---

### 3.6 `service_categories`
- **Purpose:** Lookup table of gardening and landscaping service categories and baseline per-sq.m labor rates managed by administrators.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Unique Constraints:** `name` (`UNIQUE`)
- **Business Rules:** Public service listings and request category selectors only expose categories where `is_active = TRUE`.

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `name` | `VARCHAR(100)` | `NOT NULL` | — | Unique category title |
| `description` | `TEXT` | `NULL` | `NULL` | Optional category description |
| `rate_per_sqm_min` | `DECIMAL(10, 2)` | `NOT NULL` | `60.00` | Minimum per-sq.m labor rate (Migration 004) |
| `rate_per_sqm_max` | `DECIMAL(10, 2)` | `NOT NULL` | `120.00` | Maximum per-sq.m labor rate (Migration 004) |
| `min_base_fee` | `DECIMAL(10, 2)` | `NOT NULL` | `450.00` | Minimum base fee floor (Migration 004) |
| `is_active` | `BOOLEAN` (`TINYINT(1)`) | `NOT NULL` | `TRUE` (`1`) | Active visibility toggle |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |

---

### 3.7 `pricing_addons` *(Added in Migration 006)*
- **Purpose:** Administrator-managed catalog of optional plant, material, equipment, and disposal add-on rates used by the itemized Price Estimator.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Unique Constraints:** `name` (`UNIQUE`)
- **CHECK Constraints:** `chk_pricing_addons_range` (`unit_price_max >= unit_price_min`)
- **Indexes:** `idx_pricing_addons_active_type (is_active, item_type)`

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `name` | `VARCHAR(120)` | `NOT NULL` | — | Unique add-on name |
| `item_type` | `ENUM('plant', 'material', 'equipment', 'disposal')` | `NOT NULL` | `'material'` | Add-on classification |
| `unit` | `VARCHAR(40)` | `NOT NULL` | `'per item'` | Pricing unit label |
| `unit_price_min` | `DECIMAL(10, 2)` | `NOT NULL` | — | Low unit price |
| `unit_price_max` | `DECIMAL(10, 2)` | `NOT NULL` | — | High unit price (`>= unit_price_min`) |
| `description` | `VARCHAR(255)` | `NULL` | `NULL` | Optional item description |
| `is_active` | `BOOLEAN` (`TINYINT(1)`) | `NOT NULL` | `TRUE` (`1`) | Active toggle |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | Last update timestamp |

---

### 3.8 `services`
- **Purpose:** Gardener-created gardening and landscaping service listings displayed in the public marketplace.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `gardener_id` → `users(id)` `ON DELETE CASCADE`
  - `category_id` → `service_categories(id)` `ON DELETE RESTRICT`
- **Indexes:**
  - `idx_services_search (category_id, service_area, is_active)`
  - `idx_services_gardener (gardener_id, is_active)`
- **Business Rules:**
  - Public visibility requires all four conditions: `services.is_active = TRUE`, `users.is_active = TRUE`, `gardener_profiles.is_approved = TRUE`, and `service_categories.is_active = TRUE`.
  - Services with a positive `indicative_price` support the priced-service direct agreement flow (`POST /api/agreements/direct-service`).

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `gardener_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to owning gardener (`users.id`) |
| `category_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to `service_categories.id` |
| `title` | `VARCHAR(150)` | `NOT NULL` | — | Service listing title |
| `description` | `TEXT` | `NOT NULL` | — | Scope and service details |
| `indicative_price` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Optional starting/reference price |
| `price_unit` | `VARCHAR(50)` | `NULL` | `NULL` | e.g., `per visit`, `per sq.m.` |
| `service_area` | `VARCHAR(150)` | `NOT NULL` | `'Zamboanga City'` | Area served |
| `workers_required` | `TINYINT UNSIGNED` | `NOT NULL` | `1` | Crew members required per booking (Migration 011) |
| `image_path` | `VARCHAR(255)` | `NULL` | `NULL` | Optional `sharp`-sanitized cover image (Migration 002) |
| `is_active` | `BOOLEAN` (`TINYINT(1)`) | `NOT NULL` | `TRUE` (`1`) | Soft-delete / moderation flag |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | Last update timestamp |

---

### 3.9 `portfolios`
- **Purpose:** Gardener portfolio project showcase entries with uploaded project photos.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `gardener_id` → `users(id)` `ON DELETE CASCADE`
- **Indexes:** `idx_portfolios_gardener (gardener_id, created_at)`
- **Business Rules:** Uploaded portfolio images are stored under `backend/uploads/portfolios/` and served publicly via `GET /api/portfolios/:portfolioId/image` with magic-byte validation (`JPEG`, `PNG`, `WebP`).

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `gardener_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to `users.id` |
| `title` | `VARCHAR(150)` | `NOT NULL` | — | Portfolio item title |
| `description` | `TEXT` | `NULL` | `NULL` | Project description |
| `image_path` | `VARCHAR(500)` | `NOT NULL` | — | Filename inside `uploads/portfolios/` |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Upload timestamp |

---

### 3.10 `inquiries`
- **Purpose:** Unified request engine table storing both **Case 1 General Service Requests** (`request_type = 'general'`) and **Case 2 Direct Service Provider Inquiries** (`request_type = 'direct'`), along with dynamic category specifications (`category_specs`) and per-sq.m price estimator data.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `client_id` → `users(id)` `ON DELETE RESTRICT`
  - `gardener_id` → `users(id)` `ON DELETE RESTRICT`
  - `service_id` → `services(id)` `ON DELETE SET NULL`
  - `category_id` (`fk_inquiries_category`) → `service_categories(id)` `ON DELETE SET NULL`
- **CHECK Constraints:**
  - `chk_inquiries_direct_has_provider`: `CHECK (request_type = 'general' OR gardener_id IS NOT NULL)`
- **Indexes:**
  - `idx_inquiries_client_status (client_id, status, created_at)`
  - `idx_inquiries_gardener_status (gardener_id, status, created_at)`
  - `idx_inquiries_open_board (request_type, status, category_id, expires_at)`
  - `idx_inquiries_expiry (status, expires_at)`
- **Business Rules:**
  - **Case 1 (`request_type = 'general'`):** Starts with `gardener_id = NULL` and `service_id = NULL`. Once a client accepts an offer, `gardener_id` is set to the selected gardener and `status` becomes `'provider_selected'`. If that offer is later declined before an agreement is active, `gardener_id` resets to `NULL` and `status` returns to `'responded'` or `'open'`.
  - **Case 2 (`request_type = 'direct'`):** Requires `gardener_id IS NOT NULL` at creation time (enforced by both API validation and `chk_inquiries_direct_has_provider`).
  - **Lazy Expiry:** Inquiries in `'open'` or `'responded'` status with `expires_at <= NOW()` automatically transition to `'expired'` when accessed. Inquiries in `'provider_selected'`, `'in_agreement'`, or `'confirmed'` never auto-expire.

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `request_type` | `ENUM('direct', 'general')` | `NOT NULL` | `'direct'` | Added in Migration 001 |
| `client_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to requesting client (`users.id`) |
| `gardener_id` | `INT UNSIGNED` | `NULL` | `NULL` | FK to provider (`NULL` for unassigned Case 1) |
| `service_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional FK to `services.id` (Case 2) |
| `subject` | `VARCHAR(200)` | `NOT NULL` | — | Request summary title |
| `description` | `TEXT` | `NOT NULL` | — | Detailed client requirements |
| `requested_date` | `DATE` | `NULL` | `NULL` | Preferred target date |
| `location` | `VARCHAR(255)` | `NULL` | `NULL` | Area/barangay location |
| `area_sqm` | `DECIMAL(8, 2)` | `NULL` | `NULL` | Estimated garden area in sq.m (Migration 004) |
| `work_complexity` | `ENUM('light', 'moderate', 'heavy')` | `NULL` | `NULL` | Work intensity level (Migration 004) |
| `materials_option` | `ENUM('client_provides', 'gardener_provides')` | `NULL` | `NULL` | Who supplies materials (Migration 004) |
| `site_visit_requested` | `BOOLEAN` (`TINYINT(1)`) | `NOT NULL` | `FALSE` (`0`) | Client requests ocular inspection (Migration 004) |
| `estimated_labor_min` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Estimated labor low bound (Migration 006) |
| `estimated_labor_max` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Estimated labor high bound (Migration 006) |
| `estimated_materials_min` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Estimated materials/add-ons low bound (Migration 006) |
| `estimated_materials_max` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Estimated materials/add-ons high bound (Migration 006) |
| `estimated_min_amount` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Total indicative estimate low bound (Migration 004) |
| `estimated_max_amount` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Total indicative estimate high bound (Migration 004) |
| `price_comment` | `TEXT` | `NULL` | `NULL` | Client budget/price notes (Migration 004) |
| `category_specs` | `JSON` | `NULL` | `NULL` | Dynamic category-specific request fields (Migration 010) |
| `status` | `ENUM('open', 'responded', 'closed', 'cancelled', 'provider_selected', 'in_agreement', 'confirmed', 'expired')` | `NOT NULL` | `'open'` | Extended in Migration 001 |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | Last update timestamp |
| `category_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional FK to `service_categories.id` |
| `ai_summary` | `TEXT` | `NULL` | `NULL` | Client-reviewed AI requirement summary |
| `expires_at` | `DATETIME` | `NULL` | `NULL` | Expiration timestamp (`NULL` = never expires) |

---

### 3.11 `inquiry_estimate_items` *(Added in Migration 006)*
- **Purpose:** Stores immutable snapshots of itemized plant/material/equipment/disposal add-ons selected during a client's inquiry price estimate.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `inquiry_id` → `inquiries(id)` `ON DELETE CASCADE`
  - `addon_id` → `pricing_addons(id)` `ON DELETE SET NULL`
- **Indexes:** `idx_inquiry_estimate_items_inquiry (inquiry_id)`

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `inquiry_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to `inquiries.id` |
| `addon_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional FK to `pricing_addons.id` |
| `item_name` | `VARCHAR(120)` | `NOT NULL` | — | Snapshot item title |
| `item_type` | `ENUM('plant', 'material', 'equipment', 'disposal')` | `NOT NULL` | `'material'` | Snapshot item type |
| `unit` | `VARCHAR(40)` | `NOT NULL` | — | Snapshot pricing unit |
| `quantity` | `DECIMAL(8, 2)` | `NOT NULL` | — | Requested quantity |
| `unit_price_min` | `DECIMAL(10, 2)` | `NOT NULL` | — | Snapshot min unit price |
| `unit_price_max` | `DECIMAL(10, 2)` | `NOT NULL` | — | Snapshot max unit price |
| `subtotal_min` | `DECIMAL(10, 2)` | `NOT NULL` | — | `quantity × unit_price_min` |
| `subtotal_max` | `DECIMAL(10, 2)` | `NOT NULL` | — | `quantity × unit_price_max` |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |

---

### 3.12 `request_images`
- **Purpose:** Stores metadata and file paths for client-uploaded garden photos (`kind = 'original'`) and future AI-generated concept images (`kind = 'ai_generated'`), plus client-reviewed AI photo descriptions.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `inquiry_id` → `inquiries(id)` `ON DELETE CASCADE`
  - `uploaded_by` → `users(id)` `ON DELETE RESTRICT`
  - `parent_image_id` → `request_images(id)` `ON DELETE SET NULL`
- **Indexes:**
  - `idx_request_images_inquiry (inquiry_id, kind)`
  - `idx_request_images_unattached (inquiry_id, created_at)`
- **Business Rules:**
  - Created in Migration 001 (Step R2).
  - Every upload is decoded and re-encoded via `sharp` (auto-oriented, fit within `1920×1920`, all EXIF/GPS/XMP/IPTC metadata stripped).
  - Uploaded draft photos start with `inquiry_id = NULL` and are attached transactionally when the client submits the inquiry (max `5` original photos per inquiry). Unattached drafts older than `24` hours are automatically purged by the scheduled cleanup job.
  - Files are never served statically; `GET /api/request-images/:imageId` enforces strict role and ownership checks.

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `inquiry_id` | `INT UNSIGNED` | `NULL` | `NULL` | FK to `inquiries.id` (`NULL` until attached) |
| `uploaded_by` | `INT UNSIGNED` | `NOT NULL` | — | FK to uploading client (`users.id`) |
| `kind` | `ENUM('original', 'ai_generated')` | `NOT NULL` | `'original'` | Separates originals from future generated images |
| `parent_image_id` | `INT UNSIGNED` | `NULL` | `NULL` | Self-FK for future generated images |
| `file_path` | `VARCHAR(500)` | `NOT NULL` | — | Relative path under `uploads/request-images/` |
| `mime_type` | `VARCHAR(50)` | `NOT NULL` | — | `image/jpeg`, `image/png`, or `image/webp` |
| `file_size` | `INT UNSIGNED` | `NOT NULL` | — | Sanitized byte size on disk |
| `ai_description` | `TEXT` | `NULL` | `NULL` | AI or client-edited garden space description |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Upload timestamp |

---

### 3.13 `quotations`
- **Purpose:** Stores gardener offers (Case 1) and feasibility/quotation responses (Case 2), including itemized labor/materials splits, duration estimates, revision tracking, offer locking, and active-offer uniqueness.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `inquiry_id` → `inquiries(id)` `ON DELETE CASCADE`
  - `gardener_id` → `users(id)` `ON DELETE RESTRICT`
- **Unique Constraints:**
  - `uq_quotation_active_offer (inquiry_id, gardener_id, active_flag)`
- **Indexes:**
  - `idx_quotations_inquiry (inquiry_id, created_at)`
  - `idx_quotations_gardener_status (gardener_id, status)`
- **Business Rules:**
  - `active_flag` is a stored generated column (`IF(status IN ('draft','sent','accepted'), 1, NULL)`). Because `NULL` values do not conflict in SQL `UNIQUE` indexes, a gardener may have at most **one** active (`draft`, `sent`, or `accepted`) offer per inquiry while preserving unlimited `'withdrawn'` or `'declined'` historical rows.
  - A gardener may revise (`PUT /api/inquiries/quotations/:quotationId`) or withdraw (`POST /api/inquiries/quotations/:quotationId/withdraw`) an offer only while `status = 'sent'` and `locked_at IS NULL`.
  - When a client accepts an offer, `status` becomes `'accepted'` and `locked_at` is set to `NOW()`, locking the offer against further unilateral edits.
  - Responses with `response_type = 'cannot_do'` allow `amount = NULL` and cannot be accepted by the client (`409`).

| Column | Data Type | Nullability | Default / Expression | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `inquiry_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to `inquiries.id` |
| `gardener_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to responding gardener (`users.id`) |
| `amount` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Total indicative price (`NULL` allowed for `interest`/`cannot_do`) |
| `labor_amount` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Labor portion of quote (Migration 006) |
| `materials_amount` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Materials/plants portion of quote (Migration 006) |
| `materials_breakdown` | `TEXT` | `NULL` | `NULL` | Itemized materials notes (Migration 006) |
| `details` | `TEXT` | `NOT NULL` | — | Scope/feasibility explanation |
| `availability_start` | `DATE` | `NULL` | `NULL` | Earliest available date |
| `availability_end` | `DATE` | `NULL` | `NULL` | Latest available date |
| `estimated_working_days` | `DECIMAL(4, 1)` | `NULL` | `NULL` | Estimated duration in days (Migration 005) |
| `estimated_hours` | `DECIMAL(5, 1)` | `NULL` | `NULL` | Estimated duration in hours (Migration 005) |
| `status` | `ENUM('draft', 'sent', 'accepted', 'declined', 'expired', 'withdrawn')` | `NOT NULL` | `'draft'` | Extended in Migration 001 |
| `valid_until` | `DATE` | `NULL` | `NULL` | Offer validity date |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | Last update timestamp |
| `response_type` | `ENUM('interest', 'offer', 'feasible', 'modifications', 'cannot_do')` | `NOT NULL` | `'offer'` | Added in Migration 001 |
| `proposed_changes` | `TEXT` | `NULL` | `NULL` | Required when `response_type = 'modifications'` |
| `requires_site_visit` | `BOOLEAN` (`TINYINT(1)`) | `NOT NULL` | `FALSE` (`0`) | Provider flags ocular visit needed (Migration 004) |
| `revision_number` | `INT UNSIGNED` | `NOT NULL` | `1` | Increments on each revision |
| `locked_at` | `TIMESTAMP` | `NULL` | `NULL` | Set when accepted by client |
| `active_flag` | `TINYINT UNSIGNED` | `NULL` | `GENERATED ALWAYS AS (IF(status IN ('draft','sent','accepted'), 1, NULL)) STORED` | Enforces 1 active offer per provider per inquiry |

---

### 3.14 `quotation_revisions`
- **Purpose:** Immutable audit snapshot table storing each superseded revision of a quotation whenever a gardener revises an unaccepted offer.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `quotation_id` → `quotations(id)` `ON DELETE CASCADE`
- **Unique Constraints:** `uq_quotation_revision (quotation_id, revision_number)`

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `quotation_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to `quotations.id` |
| `revision_number` | `INT UNSIGNED` | `NOT NULL` | — | Snapshot revision number (`1, 2, ...`) |
| `response_type` | `VARCHAR(20)` | `NOT NULL` | — | Prior `response_type` |
| `amount` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Prior total amount |
| `labor_amount` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Prior labor amount (Migration 006) |
| `materials_amount` | `DECIMAL(10, 2)` | `NULL` | `NULL` | Prior materials amount (Migration 006) |
| `materials_breakdown` | `TEXT` | `NULL` | `NULL` | Prior materials breakdown (Migration 006) |
| `details` | `TEXT` | `NOT NULL` | — | Prior details |
| `proposed_changes` | `TEXT` | `NULL` | `NULL` | Prior proposed changes |
| `requires_site_visit` | `BOOLEAN` (`TINYINT(1)`) | `NOT NULL` | `FALSE` (`0`) | Prior ocular visit flag (Migration 004) |
| `availability_start` | `DATE` | `NULL` | `NULL` | Prior availability start |
| `availability_end` | `DATE` | `NULL` | `NULL` | Prior availability end |
| `estimated_working_days` | `DECIMAL(4, 1)` | `NULL` | `NULL` | Prior estimated days (Migration 005) |
| `estimated_hours` | `DECIMAL(5, 1)` | `NULL` | `NULL` | Prior estimated hours (Migration 005) |
| `valid_until` | `DATE` | `NULL` | `NULL` | Prior validity date |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Snapshot timestamp |

---

### 3.15 `agreements`
- **Purpose:** Stores versioned mutual agreements between client and gardener covering scope of work, final agreed amount, required deposit, price basis, schedule, exact location, and conditions. **A reservation/booking can only be created when both parties approve the exact same agreement version.**
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `inquiry_id` → `inquiries(id)` `ON DELETE RESTRICT`
  - `quotation_id` → `quotations(id)` `ON DELETE SET NULL`
  - `client_id` → `users(id)` `ON DELETE RESTRICT`
  - `gardener_id` → `users(id)` `ON DELETE RESTRICT`
  - `previous_agreement_id` → `agreements(id)` `ON DELETE SET NULL`
  - `proposed_by` → `users(id)` `ON DELETE RESTRICT`
- **CHECK Constraints:**
  - `chk_agreement_agreed_needs_both`: `CHECK (status <> 'agreed' OR (client_approved_at IS NOT NULL AND gardener_approved_at IS NOT NULL))`
  - `chk_agreement_schedule`: `CHECK (scheduled_end > scheduled_start)`
  - `chk_agreement_proposer`: `CHECK (proposed_by IN (client_id, gardener_id))`
- **Unique Constraints:**
  - `uq_one_active_agreement (active_key)`
- **Indexes:**
  - `idx_agreements_inquiry (inquiry_id, version)`
- **Business Rules:**
  - `active_key` is a stored generated column (`IF(status IN ('proposed', 'agreed'), inquiry_id, NULL)`), guaranteeing at the database level that an inquiry can have at most **one** active (`proposed` or `agreed`) agreement at a time.
  - Editing a proposed agreement marks version $N$ as `'superseded'`, inserts version $N+1$ linked via `previous_agreement_id`, and resets both `client_approved_at` and `gardener_approved_at` to `NULL` so both parties explicitly approve version $N+1$.
  - When the second party approves the current version (`POST /api/agreements/:agreementId/approve`), the backend validates working days, blocked dates, and daily crew capacity, transitions `status` to `'agreed'`, inserts the reservation `bookings` record (`status = 'accepted'`, `booking_stage = 'reserved'`), updates `inquiries.status = 'confirmed'`, and declines competing open offers in a single atomic transaction.

| Column | Data Type | Nullability | Default / Expression | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `inquiry_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to `inquiries.id` |
| `quotation_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional FK to `quotations.id` (`NULL` for priced-service flow) |
| `client_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to client (`users.id`) |
| `gardener_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to gardener (`users.id`) |
| `previous_agreement_id` | `INT UNSIGNED` | `NULL` | `NULL` | Self-FK to superseded agreement row |
| `version` | `INT UNSIGNED` | `NOT NULL` | `1` | Version number (`1, 2, ...`) |
| `scope_of_work` | `TEXT` | `NOT NULL` | — | Mutually agreed scope of work |
| `amount` | `DECIMAL(10, 2)` | `NOT NULL` | — | Final agreed price (`> 0`) |
| `required_deposit_amount` | `DECIMAL(10, 2)` | `NOT NULL` | `0.00` | Deposit needed to upgrade reservation to booked (Migration 007) |
| `price_basis` | `VARCHAR(100)` | `NULL` | `NULL` | e.g., `Fixed project fee`, `Per visit` |
| `scheduled_start` | `DATETIME` | `NOT NULL` | — | Agreed start date/time |
| `scheduled_end` | `DATETIME` | `NOT NULL` | — | Agreed end date/time (`> scheduled_start`) |
| `estimated_working_days` | `DECIMAL(4, 1)` | `NULL` | `NULL` | Agreed working day estimate (Migration 005) |
| `location` | `VARCHAR(255)` | `NOT NULL` | — | Full service address |
| `conditions` | `TEXT` | `NULL` | `NULL` | Special conditions, materials, access notes |
| `proposed_by` | `INT UNSIGNED` | `NOT NULL` | — | FK to proposer (`client_id` or `gardener_id`) |
| `client_approved_at` | `TIMESTAMP` | `NULL` | `NULL` | Timestamp of client approval |
| `gardener_approved_at` | `TIMESTAMP` | `NULL` | `NULL` | Timestamp of gardener approval |
| `status` | `ENUM('proposed', 'agreed', 'superseded', 'cancelled')` | `NOT NULL` | `'proposed'` | Agreement lifecycle state |
| `active_key` | `INT UNSIGNED` | `NULL` | `GENERATED ALWAYS AS (IF(status IN ('proposed','agreed'), inquiry_id, NULL)) STORED` | Enforces 1 active agreement per inquiry |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | Last update timestamp |

---

### 3.16 `bookings`
- **Purpose:** Stores service reservations and confirmed paid bookings, tracking deposit gating (`reserved` → `booked`), execution lifecycle (`accepted` → `in_progress` → `completed` or event-based `cancelled`), and mutual transaction closure (`open` → `pending_closure` → `closed`).
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `inquiry_id` → `inquiries(id)` `ON DELETE SET NULL`
  - `quotation_id` → `quotations(id)` `ON DELETE SET NULL`
  - `client_id` → `users(id)` `ON DELETE RESTRICT`
  - `gardener_id` → `users(id)` `ON DELETE RESTRICT`
  - `service_id` → `services(id)` `ON DELETE SET NULL`
  - `cancelled_by` (`fk_bookings_cancelled_by`) → `users(id)` `ON DELETE SET NULL`
  - `agreement_id` (`fk_bookings_agreement`) → `agreements(id)` `ON DELETE RESTRICT`
- **Unique Constraints:**
  - `uq_booking_agreement (agreement_id)`
- **Indexes:**
  - `idx_bookings_client_status (client_id, status, requested_at)`
  - `idx_bookings_gardener_status (gardener_id, status, requested_at)`
  - `idx_bookings_schedule (gardener_id, scheduled_start, scheduled_end)`
- **Business Rules:**
  - Direct creation via `POST /api/bookings` is retired (`409 MUTUAL_AGREEMENT_REQUIRED`). Every new booking is created automatically by the second approval on `POST /api/agreements/:agreementId/approve` with `status = 'accepted'`, `booking_stage = 'reserved'`, and `agreement_id` populated.
  - Legacy pre-R3 bookings retain `agreement_id = NULL` and remain readable and manageable.

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `inquiry_id` | `INT UNSIGNED` | `NULL` | `NULL` | FK to `inquiries.id` |
| `quotation_id` | `INT UNSIGNED` | `NULL` | `NULL` | FK to `quotations.id` |
| `client_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to client (`users.id`) |
| `gardener_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to gardener (`users.id`) |
| `service_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional FK to `services.id` |
| `scheduled_start` | `DATETIME` | `NULL` | `NULL` | Confirmed start date/time |
| `scheduled_end` | `DATETIME` | `NULL` | `NULL` | Confirmed end date/time |
| `location` | `VARCHAR(255)` | `NULL` | `NULL` | Service location |
| `notes` | `TEXT` | `NULL` | `NULL` | Scope/notes copied from agreement |
| `status` | `ENUM('pending', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled')` | `NOT NULL` | `'pending'` | New bookings start at `'accepted'` |
| `booking_stage` | `ENUM('reserved', 'booked')` | `NOT NULL` | `'reserved'` | Upgrades to `'booked'` when deposit verified (Migration 007) |
| `payment_status` | `ENUM('unpaid', 'pending_verification', 'partially_paid', 'fully_paid')` | `NOT NULL` | `'unpaid'` | Aggregate payment state (Migration 007) |
| `required_deposit_amount` | `DECIMAL(10, 2)` | `NOT NULL` | `0.00` | Required reservation deposit (Migration 007) |
| `amount_paid` | `DECIMAL(10, 2)` | `NOT NULL` | `0.00` | Total verified payments (Migration 007) |
| `paid_at` | `TIMESTAMP` | `NULL` | `NULL` | Timestamp of latest verified payment (Migration 007) |
| `transaction_status` | `ENUM('open', 'pending_closure', 'closed')` | `NOT NULL` | `'open'` | Mutual completion closure state (Migration 008) |
| `client_completion_confirmed_at` | `TIMESTAMP` | `NULL` | `NULL` | Client completion sign-off (Migration 008) |
| `gardener_completion_confirmed_at` | `TIMESTAMP` | `NULL` | `NULL` | Gardener completion sign-off (Migration 008) |
| `transaction_closed_at` | `TIMESTAMP` | `NULL` | `NULL` | Mutual closure timestamp (Migration 008) |
| `completion_agreement_notes` | `TEXT` | `NULL` | `NULL` | Final closure notes (Migration 008) |
| `cancellation_reason_type` | `ENUM('typhoon_weather', 'accident_emergency', 'schedule_conflict', 'scope_or_plan_change', 'property_access_issue', 'other')` | `NULL` | `NULL` | Structured event cancel category (Migration 009) |
| `cancellation_reason` | `VARCHAR(1000)` | `NULL` | `NULL` | Cancellation explanation (Migration 009) |
| `cancelled_by` | `INT UNSIGNED` | `NULL` | `NULL` | FK to cancelling user (Migration 009) |
| `cancelled_at` | `TIMESTAMP` | `NULL` | `NULL` | Cancellation timestamp (Migration 009) |
| `requested_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | Last update timestamp |
| `agreement_id` | `INT UNSIGNED` | `NULL` | `NULL` | Unique FK to `agreements.id` (`NULL` only on legacy rows) |

---

### 3.17 `booking_payments` *(Added in Migration 007; extended in Migrations 008 & 013)*
- **Purpose:** Tracks deposit, full, and balance payment submissions—both online gateway sessions (PayMongo Checkout / Sandbox Demo) and manual payment proofs with receipt uploads—each assigned a unique `TXN-YYYYMMDD-XXXXXX` code.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `booking_id` → `bookings(id)` `ON DELETE CASCADE`
  - `submitted_by` → `users(id)` `ON DELETE RESTRICT`
  - `verified_by` → `users(id)` `ON DELETE SET NULL`
- **Unique Constraints:** `transaction_code` (`UNIQUE`)
- **Indexes:**
  - `idx_booking_payments_booking (booking_id, status, created_at)`
  - `idx_booking_payments_gateway_session (gateway_session_id)`

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `transaction_code` | `VARCHAR(40)` | `NULL` | `NULL` | Unique `TXN-YYYYMMDD-XXXXXX` code (Migration 008) |
| `booking_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to `bookings.id` |
| `submitted_by` | `INT UNSIGNED` | `NOT NULL` | — | FK to paying client (`users.id`) |
| `payment_type` | `ENUM('partial', 'full', 'balance')` | `NOT NULL` | `'partial'` | Payment stage |
| `payment_method` | `ENUM('gcash', 'maya', 'grab_pay', 'card', 'bank_transfer', 'cash', 'other')` | `NOT NULL` | `'gcash'` | Payment channel (extended in Migration 013) |
| `gateway_provider` | `ENUM('manual', 'paymongo', 'sandbox_demo')` | `NOT NULL` | `'manual'` | Gateway vs manual proof (Migration 013) |
| `gateway_session_id` | `VARCHAR(120)` | `NULL` | `NULL` | Provider checkout session ID (Migration 013) |
| `gateway_checkout_url` | `VARCHAR(500)` | `NULL` | `NULL` | Hosted checkout URL (Migration 013) |
| `gateway_status` | `ENUM('none', 'awaiting_payment', 'paid', 'failed', 'cancelled')` | `NOT NULL` | `'none'` | Gateway checkout status (Migration 013) |
| `gateway_paid_at` | `TIMESTAMP` | `NULL` | `NULL` | Gateway confirmation time (Migration 013) |
| `amount` | `DECIMAL(10, 2)` | `NOT NULL` | — | Payment amount (`> 0`) |
| `reference_number` | `VARCHAR(100)` | `NULL` | `NULL` | Optional manual reference number |
| `receipt_path` | `VARCHAR(255)` | `NULL` | `NULL` | Private receipt file under `uploads/payment-receipts/` |
| `notes` | `VARCHAR(500)` | `NULL` | `NULL` | Optional client notes |
| `status` | `ENUM('pending', 'verified', 'rejected')` | `NOT NULL` | `'pending'` | Verification state |
| `verified_by` | `INT UNSIGNED` | `NULL` | `NULL` | FK to verifying gardener or clerk (`users.id`) |
| `verified_at` | `TIMESTAMP` | `NULL` | `NULL` | Verification timestamp |
| `rejection_reason` | `VARCHAR(500)` | `NULL` | `NULL` | Reason if rejected |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | Last update timestamp |

---

### 3.18 `booking_reschedule_requests` *(Added in Migration 009)*
- **Purpose:** Tracks mutual date-change requests on existing bookings (e.g., due to typhoons, weather, or emergencies), preserving payments and re-checking crew/schedule availability on approval.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `booking_id` (`fk_reschedule_booking`) → `bookings(id)` `ON DELETE CASCADE`
  - `requested_by` (`fk_reschedule_requester`) → `users(id)` `ON DELETE RESTRICT`
  - `responded_by` (`fk_reschedule_responder`) → `users(id)` `ON DELETE SET NULL`
- **CHECK Constraints:** `chk_reschedule_proposed_schedule` (`proposed_end > proposed_start`)
- **Indexes:** `idx_reschedule_booking_status (booking_id, status, created_at)`

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `booking_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to `bookings.id` |
| `requested_by` | `INT UNSIGNED` | `NOT NULL` | — | FK to requesting party (`users.id`) |
| `reason_type` | `ENUM('typhoon_weather', 'accident_emergency', 'schedule_conflict', 'scope_or_plan_change', 'property_access_issue', 'other')` | `NOT NULL` | — | Event reason category |
| `reason_details` | `VARCHAR(1000)` | `NOT NULL` | — | Explanation |
| `previous_start` | `DATETIME` | `NOT NULL` | — | Prior booking start |
| `previous_end` | `DATETIME` | `NOT NULL` | — | Prior booking end |
| `proposed_start` | `DATETIME` | `NOT NULL` | — | Requested new start |
| `proposed_end` | `DATETIME` | `NOT NULL` | — | Requested new end (`> proposed_start`) |
| `status` | `ENUM('pending', 'approved', 'declined', 'cancelled')` | `NOT NULL` | `'pending'` | Request outcome |
| `responded_by` | `INT UNSIGNED` | `NULL` | `NULL` | FK to responding counterparty (`users.id`) |
| `responded_at` | `TIMESTAMP` | `NULL` | `NULL` | Response timestamp |
| `response_note` | `VARCHAR(500)` | `NULL` | `NULL` | Optional response message |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |
| `updated_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | Last update timestamp |

---

### 3.19 `reviews`
- **Purpose:** Stores client ratings (`1`–`5`) and written reviews for completed, fully paid, and mutually closed bookings.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `booking_id` → `bookings(id)` `ON DELETE RESTRICT`
  - `client_id` → `users(id)` `ON DELETE RESTRICT`
  - `gardener_id` → `users(id)` `ON DELETE RESTRICT`
- **Unique Constraints:**
  - `uq_review_booking (booking_id)` (enforces at most one review per booking)
- **Indexes:**
  - `idx_reviews_gardener (gardener_id, is_visible, created_at)`
- **Business Rules:** Only the `client_id` who owns a booking with `status = 'completed'`, `payment_status = 'fully_paid'`, and `transaction_status = 'closed'` can submit a review (`POST /api/reviews`).

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `booking_id` | `INT UNSIGNED` | `NOT NULL` | — | Unique FK to `bookings.id` |
| `client_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to reviewing client (`users.id`) |
| `gardener_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to reviewed gardener (`users.id`) |
| `rating` | `TINYINT UNSIGNED` | `NOT NULL` | — | Integer `1` to `5` |
| `review_text` | `TEXT` | `NULL` | `NULL` | Optional written feedback |
| `is_visible` | `BOOLEAN` (`TINYINT(1)`) | `NOT NULL` | `TRUE` (`1`) | Public visibility flag |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Submission timestamp |

---

### 3.20 `conversations`
- **Purpose:** Represents a 1-to-1 messaging thread between a client and a gardener, optionally tied to a specific inquiry.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `client_id` → `users(id)` `ON DELETE RESTRICT`
  - `gardener_id` → `users(id)` `ON DELETE RESTRICT`
  - `inquiry_id` → `inquiries(id)` `ON DELETE SET NULL`
- **Unique Constraints:**
  - `uq_conversation_inquiry_provider (inquiry_id, gardener_id)` (updated in Migration 001 from single-column `uq_conversation_inquiry` so multiple gardeners who submit offers on a Case 1 general request can each have their own isolated conversation thread with the client).
- **Indexes:**
  - `idx_conversations_client (client_id)`
  - `idx_conversations_gardener (gardener_id)`
- **Business Rules:** On a Case 1 general request, a gardener may create or send messages in a conversation thread only while holding an active (`sent` or `accepted`) offer on that inquiry (`403` otherwise).

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `client_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to client (`users.id`) |
| `gardener_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to gardener (`users.id`) |
| `inquiry_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional FK to `inquiries.id` |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |

---

### 3.21 `messages`
- **Purpose:** Stores individual chat messages within a conversation thread.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `conversation_id` → `conversations(id)` `ON DELETE CASCADE`
  - `sender_id` → `users(id)` `ON DELETE RESTRICT`
- **Indexes:**
  - `idx_messages_conversation (conversation_id, sent_at)`

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `conversation_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to `conversations.id` |
| `sender_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to sender (`users.id`) |
| `message_text` | `TEXT` | `NOT NULL` | — | Message body (`1`–`2000` chars) |
| `sent_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Sent timestamp |
| `read_at` | `TIMESTAMP` | `NULL` | `NULL` | Marked when recipient opens thread |

---

### 3.22 `notifications`
- **Purpose:** Stores in-app workflow notifications for clients, gardeners, assigned clerks, and administrators.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `user_id` → `users(id)` `ON DELETE CASCADE`
- **Indexes:**
  - `idx_notifications_user_read (user_id, read_at, created_at)`

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `user_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to recipient (`users.id`) |
| `notification_type` | `VARCHAR(50)` | `NOT NULL` | — | e.g., `inquiry`, `quotation`, `agreement`, `booking`, `message`, `review`, `gardener_profile` |
| `title` | `VARCHAR(150)` | `NOT NULL` | — | Short notification heading |
| `message` | `TEXT` | `NOT NULL` | — | Notification body |
| `related_entity_type` | `VARCHAR(50)` | `NULL` | `NULL` | e.g., `inquiry`, `booking`, `conversation`, `review`, `gardener_profile` |
| `related_entity_id` | `INT UNSIGNED` | `NULL` | `NULL` | Target entity ID for frontend navigation |
| `read_at` | `TIMESTAMP` | `NULL` | `NULL` | `NULL` while unread |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Creation timestamp |

---

### 3.23 `reports`
- **Purpose:** Stores user-submitted moderation reports concerning users, services, or messages, and tracks administrator resolution.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `reporter_id` → `users(id)` `ON DELETE RESTRICT`
  - `reported_user_id` → `users(id)` `ON DELETE SET NULL`
  - `reported_service_id` → `services(id)` `ON DELETE SET NULL`
  - `reported_message_id` → `messages(id)` `ON DELETE SET NULL`
  - `resolved_by` → `users(id)` `ON DELETE SET NULL`
- **Indexes:**
  - `idx_reports_status (status, created_at)`

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `reporter_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to reporting user (`users.id`) |
| `reported_user_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional FK to reported user |
| `reported_service_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional FK to reported service |
| `reported_message_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional FK to reported message |
| `reason` | `VARCHAR(255)` | `NOT NULL` | — | Summary reason |
| `details` | `TEXT` | `NULL` | `NULL` | Additional report context |
| `status` | `ENUM('open', 'reviewing', 'resolved', 'dismissed')` | `NOT NULL` | `'open'` | Moderation state |
| `resolved_by` | `INT UNSIGNED` | `NULL` | `NULL` | FK to resolving administrator |
| `resolution_notes` | `TEXT` | `NULL` | `NULL` | Administrator resolution notes |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Submission timestamp |
| `resolved_at` | `TIMESTAMP` | `NULL` | `NULL` | Timestamp when resolved/dismissed |

---

### 3.24 `request_events`
- **Purpose:** Chronological audit trail of state transitions, offer actions, and mutual agreement approvals for each inquiry.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `inquiry_id` → `inquiries(id)` `ON DELETE CASCADE`
  - `quotation_id` → `quotations(id)` `ON DELETE SET NULL`
  - `agreement_id` → `agreements(id)` `ON DELETE SET NULL`
  - `actor_id` → `users(id)` `ON DELETE RESTRICT`
- **Indexes:**
  - `idx_request_events_inquiry (inquiry_id, created_at)`
- **Recorded Event Types:** `inquiry_created`, `inquiry_closed`, `inquiry_cancelled`, `request_expired`, `request_renewed`, `quotation_sent`, `quotation_revised`, `quotation_withdrawn`, `quotation_accepted`, `quotation_declined`, `agreement_proposed`, `agreement_revised`, `agreement_approved_partial`, `agreement_confirmed`, `agreement_cancelled`.

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `inquiry_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to `inquiries.id` |
| `quotation_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional FK to `quotations.id` |
| `agreement_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional FK to `agreements.id` |
| `actor_id` | `INT UNSIGNED` | `NULL` | `NULL` | FK to acting user (`users.id`) |
| `event_type` | `VARCHAR(50)` | `NOT NULL` | — | Machine-readable event identifier |
| `from_status` | `VARCHAR(30)` | `NULL` | `NULL` | Previous status |
| `to_status` | `VARCHAR(30)` | `NULL` | `NULL` | New status |
| `note` | `VARCHAR(255)` | `NULL` | `NULL` | Human-readable summary |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Event timestamp |

---

### 3.25 `ai_usage_log`
- **Purpose:** Concurrency-safe per-user AI rate limiting (`10` calls per rolling hour) and model/fallback audit logging without storing raw user prompt text.
- **Primary Key:** `id` (`INT UNSIGNED AUTO_INCREMENT`)
- **Foreign Keys:**
  - `user_id` → `users(id)` `ON DELETE CASCADE`
- **Indexes:**
  - `idx_ai_usage_user (user_id, created_at)`
- **Business Rules:**
  - Before calling Gemini, the backend locks the user row (`SELECT id FROM users WHERE id = ? FOR UPDATE`), counts `ai_usage_log` rows in the last 60 minutes with `outcome IN ('success', 'error')`, and inserts an in-flight reservation (`model = 'RESERVED_IN_FLIGHT'`).
  - On completion, the row is updated with the actual model used (`gemini-3.8-flash` or fallback `gemini-3.5-flash-lite`), `outcome` (`'success'` or `'error'`), and `error_code` (`NULL` on primary success, `'FALLBACK_FROM_<PRIMARY_CODE>'` on fallback success, or `'FALLBACK_FAILED:<PRIMARY>-><FALLBACK>'` if both fail).
  - If the user has already reached `AI_HOURLY_LIMIT`, a row with `outcome = 'rate_limited'` and `error_code = 'RATE_LIMITED'` is logged and `429` is returned.

| Column | Data Type | Nullability | Default | Notes |
|---|---|---|---|---|
| `id` | `INT UNSIGNED` | `NOT NULL` | `AUTO_INCREMENT` | Primary key |
| `user_id` | `INT UNSIGNED` | `NOT NULL` | — | FK to requesting user (`users.id`) |
| `feature` | `ENUM('requirements', 'photo_analysis', 'garden_plan')` | `NOT NULL` | — | AI feature invoked |
| `inquiry_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional related inquiry ID |
| `request_image_id` | `INT UNSIGNED` | `NULL` | `NULL` | Optional related `request_images.id` |
| `model` | `VARCHAR(100)` | `NOT NULL` | — | Model identifier executed |
| `outcome` | `ENUM('success', 'error', 'rate_limited')` | `NOT NULL` | — | Execution result |
| `error_code` | `VARCHAR(50)` | `NULL` | `NULL` | Error or fallback audit code |
| `created_at` | `TIMESTAMP` | `NOT NULL` | `CURRENT_TIMESTAMP` | Invocation timestamp |

---

## 4. Foreign Key Constraint Summary (59 Total)

| Table | Foreign Key Count | Referenced Tables |
|---|---|---|
| `client_profiles` | `1` | `users` |
| `gardener_profiles` | `1` | `users` |
| `services` | `2` | `users`, `service_categories` |
| `portfolios` | `1` | `users` |
| `inquiries` | `4` | `users` (×2), `services`, `service_categories` |
| `request_images` | `3` | `inquiries`, `users`, `request_images` (self) |
| `quotations` | `2` | `inquiries`, `users` |
| `quotation_revisions` | `1` | `quotations` |
| `agreements` | `6` | `inquiries`, `quotations`, `users` (×3), `agreements` (self) |
| `bookings` | `7` | `inquiries`, `quotations`, `users` (×3 incl. `cancelled_by`), `services`, `agreements` |
| `booking_payments` | `3` | `bookings`, `users` (×2: `submitted_by`, `verified_by`) |
| `booking_reschedule_requests` | `3` | `bookings`, `users` (×2: `requested_by`, `responded_by`) |
| `gardener_unavailable_dates` | `1` | `users` |
| `clerk_gardener_assignments` | `3` | `users` (×3: `clerk_id`, `gardener_id`, `assigned_by`) |
| `inquiry_estimate_items` | `2` | `inquiries`, `pricing_addons` |
| `pricing_addons` | `0` | — |
| `reviews` | `3` | `bookings`, `users` (×2) |
| `conversations` | `3` | `users` (×2), `inquiries` |
| `messages` | `2` | `conversations`, `users` |
| `notifications` | `1` | `users` |
| `reports` | `5` | `users` (×3), `services`, `messages` |
| `request_events` | `4` | `inquiries`, `quotations`, `agreements`, `users` |
| `ai_usage_log` | `1` | `users` |
| `users` | `0` | — |
| `service_categories` | `0` | — |
| **Total (25 tables)** | **`59`** | — |

---

## 5. Migration 001 Documentation & Execution Record

### 5.1 Purpose of Migration 001
Migration 001 (`database/migrations/001_unified_requests_and_agreements.sql`) upgrades the original 14-table Phase 1–14 schema to the 19-table Revision Track (R1–R7) schema supporting:
1. **Unified Case 1 (General Service Request) and Case 2 (Direct Service Provider Inquiry)** in `inquiries`.
2. **Provider Feasibility Responses, Offer Revisions, Offer Withdrawal, and Offer Locking** in `quotations` and `quotation_revisions`.
3. **Per-Provider Inquiry Conversation Threads** in `conversations`.
4. **EXIF-Stripped Client Garden Photos & AI Space Descriptions** in `request_images`.
5. **Versioned Mutual Agreements & Booking Creation Gating** in `agreements` and `bookings`.
6. **Workflow Audit Trail & Concurrency-Safe AI Usage Logging** in `request_events` and `ai_usage_log`.

### 5.2 Summary of Schema & Data Changes in Migration 001
- **5 New Tables Created:**
  1. `quotation_revisions`
  2. `request_images`
  3. `agreements`
  4. `request_events`
  5. `ai_usage_log`
- **4 Existing Tables Modified:**
  1. `inquiries`: Extended `status` ENUM (`provider_selected`, `in_agreement`, `confirmed`, `expired`), made `gardener_id` nullable, added `request_type`, `category_id`, `ai_summary`, `expires_at`, added `fk_inquiries_category`, `chk_inquiries_direct_has_provider`, `idx_inquiries_open_board`, and `idx_inquiries_expiry`.
  2. `quotations`: Extended `status` ENUM (`withdrawn`), normalized older duplicate active offers per `(inquiry_id, gardener_id)` to `'withdrawn'`, added `response_type`, `proposed_changes`, `revision_number`, `locked_at`, stored generated column `active_flag`, and `uq_quotation_active_offer`.
  3. `conversations`: Added composite unique key `uq_conversation_inquiry_provider (inquiry_id, gardener_id)` first (preserving the FK index on `inquiry_id`), then dropped the single-column `uq_conversation_inquiry`.
  4. `bookings`: Added nullable `agreement_id`, `uq_booking_agreement`, and `fk_bookings_agreement`.

### 5.3 Execution History & Verification Record
1. **Test Database Rehearsal (November 11, 2026):**
   - Backed up `hugatiera_db` to `database/backups/hugatiera_db_pre_R1_20261111.sql`.
   - Restored into `hugatiera_db_migration_test` and verified forward migration, structural rollback (`001_unified_requests_and_agreements_rollback.sql`), and re-application.
2. **Pre-Migration Production Verification (November 12, 2026):**
   - Verified Migration 001 file SHA-256: `c7422e9a253d7a15e870a1290c850e30358b35d020e94bc7d269a8961f0e8a8d`.
   - Created verified backups `hugatiera_db_backup_20261112_201307.sql` (restored into `hugatiera_db_backup_verify` with 14/14 `CHECKSUM TABLE` parity, then dropped `hugatiera_db_backup_verify`) and final pre-execution backup `hugatiera_db_pre_migration001_final_20261112_202700.sql`.
3. **Production Execution on `hugatiera_db` (November 12, 2026):**
   - Executed `database/migrations/001_unified_requests_and_agreements.sql` exactly once against `hugatiera_db`.
   - Verified post-migration state:
     - `19` tables present (`19/19` table DDLs match `hugatiera_db_migration_test` after stripping `AUTO_INCREMENT`).
     - `46` foreign key constraints active.
     - Existing row counts preserved (`users=22`, `client_profiles=9`, `gardener_profiles=9`, `service_categories=6`, `services=5`, `portfolios=1`, `inquiries=2`, `quotations=3`, `conversations=1`, `messages=2`, `bookings=4`, `reviews=2`, `notifications=21`, `reports=2`).
     - Duplicate active offer on `inquiry_id = 2`, `gardener_id = 16`: Quotation ID `2` (`accepted`) remained active (`active_flag = 1`), and older/less-advanced Quotation ID `3` (`sent`) was normalized to `status = 'withdrawn'` (`active_flag = NULL`).

### 5.4 Important Operational & Rollback Notes
- **Do NOT Rerun Migration 001:** Running `001_unified_requests_and_agreements.sql` a second time against `hugatiera_db` or `hugatiera_db_migration_test` will fail with duplicate column/table/constraint errors (`ER_DUP_FIELDNAME` / `ER_TABLE_EXISTS_ERROR`).
- **Fresh Installations:** On a brand-new environment with no existing database, run `database/schema/hugatiera_schema.sql` directly. It already creates all `25` tables and `59` foreign keys in their final post-Migration-013 state.
- **MariaDB DDL Auto-Commit & Authoritative Recovery:** In MySQL and MariaDB, `ALTER TABLE`, `CREATE TABLE`, and `DROP TABLE` statements cause an implicit commit and cannot be wrapped in a single atomic SQL rollback transaction. While each migration ships with a `_rollback.sql` script for rehearsal databases, **the authoritative production recovery mechanism is restoring the pre-migration dump from `database/backups/`**.

---

## 6. Migrations `002`–`013` Summary (`mergedbranchv1`)

All 12 incremental migrations after Migration 001 include matching `_rollback.sql` scripts and are already reflected in [hugatiera_schema.sql](schema/hugatiera_schema.sql) and [docs/erd-and-dfd.md](../docs/erd-and-dfd.md):

| Migration | Script | Key Schema Additions |
|---|---|---|
| `002` | `002_avatars_service_images.sql` | Adds `users.avatar_path` and `services.image_path`. |
| `003` | `003_user_basic_info.sql` | Adds optional `users.middle_name` and `users.date_of_birth` (18+ registration enforcement). |
| `004` | `004_inquiry_price_estimator.sql` | Adds per-sq.m baseline rates (`rate_per_sqm_min`, `rate_per_sqm_max`, `min_base_fee`) on `service_categories`, price predictor fields (`area_sqm`, `work_complexity`, `materials_option`, `site_visit_requested`, `estimated_min_amount`, `estimated_max_amount`, `price_comment`) on `inquiries`, and `requires_site_visit` on `quotations` / `quotation_revisions`. |
| `005` | `005_scheduling_availability_capacity.sql` | Adds `working_days`, `work_start_time`, `work_end_time`, `max_concurrent_jobs`, `availability_notes` on `gardener_profiles`; creates `gardener_unavailable_dates`; adds `estimated_working_days` / `estimated_hours` on `quotations`, `quotation_revisions`, and `agreements`. |
| `006` | `006_itemized_pricing_settings.sql` | Creates `pricing_addons` (plants/materials/equipment/disposal catalog) and `inquiry_estimate_items`; adds labor/materials estimate split on `inquiries` and `labor_amount`, `materials_amount`, `materials_breakdown` on `quotations` / `quotation_revisions`. |
| `007` | `007_reservation_payment_workflow.sql` | Adds `agreements.required_deposit_amount` (30% default); adds `booking_stage` (`reserved` \| `booked`), `payment_status`, `required_deposit_amount`, `amount_paid`, `paid_at` on `bookings`; creates `booking_payments`. |
| `008` | `008_transaction_completion_agreement.sql` | Adds unique `booking_payments.transaction_code` (`TXN-...`); adds `transaction_status` (`open` \| `pending_closure` \| `closed`), `client_completion_confirmed_at`, `gardener_completion_confirmed_at`, `transaction_closed_at`, and `completion_agreement_notes` on `bookings`. |
| `009` | `009_event_cancellation_and_reschedule.sql` | Adds `cancellation_reason_type`, `cancellation_reason`, `cancelled_by`, `cancelled_at` on `bookings`; creates `booking_reschedule_requests`. |
| `010` | `010_inquiry_category_specs.sql` | Adds `inquiries.category_specs` (`JSON`) for dynamic per-category Open Request specifications. |
| `011` | `011_crew_capacity_workers.sql` | Adds `gardener_profiles.crew_size` and `services.workers_required` for worker-level daily capacity and "Fully Booked" detection. |
| `012` | `012_dual_role_and_assigned_clerk.sql` | Extends `users.role` ENUM with `'clerk'`; adds `can_act_as_client` and `can_act_as_gardener` flags; creates `clerk_gardener_assignments`. |
| `013` | `013_payment_gateway_sessions.sql` | Extends `booking_payments.payment_method` (`gcash`, `maya`, `grab_pay`, `card`, `bank_transfer`, `cash`, `other`) and adds `gateway_provider` (`manual` \| `paymongo` \| `sandbox_demo`), `gateway_session_id`, `gateway_checkout_url`, `gateway_status`, and `gateway_paid_at`. |
