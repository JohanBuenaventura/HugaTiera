# HugaTiera — Entity-Relationship Diagram (ERD) and Data Flow Diagrams (DFD)

This document describes the database structure and data flows of **HugaTiera**, grounded directly in the 19-table MySQL schema ([hugatiera_schema.sql](../database/schema/hugatiera_schema.sql), updated through Migration 001 and Migration 002).

---

## 1. Entity-Relationship Diagram (ERD)

### 1.1 Full 19-Table Database ERD

```mermaid
erDiagram
  users {
    INT id PK
    VARCHAR email UK
    VARCHAR password_hash
    ENUM role
    VARCHAR first_name
    VARCHAR last_name
    VARCHAR phone
    VARCHAR avatar_path
    BOOLEAN is_active
    TIMESTAMP created_at
    TIMESTAMP updated_at
  }

  client_profiles {
    INT user_id PK,FK
    VARCHAR address
    VARCHAR city
    TEXT bio
  }

  gardener_profiles {
    INT user_id PK,FK
    VARCHAR business_name
    TEXT description
    VARCHAR service_area
    TINYINT years_of_experience
    BOOLEAN is_approved
  }

  service_categories {
    INT id PK
    VARCHAR name UK
    TEXT description
    BOOLEAN is_active
    TIMESTAMP created_at
  }

  services {
    INT id PK
    INT gardener_id FK
    INT category_id FK
    VARCHAR title
    TEXT description
    DECIMAL indicative_price
    VARCHAR price_unit
    VARCHAR service_area
    VARCHAR image_path
    BOOLEAN is_active
    TIMESTAMP created_at
    TIMESTAMP updated_at
  }

  portfolios {
    INT id PK
    INT gardener_id FK
    VARCHAR title
    TEXT description
    VARCHAR image_path
    TIMESTAMP created_at
  }

  inquiries {
    INT id PK
    ENUM request_type
    INT client_id FK
    INT gardener_id FK
    INT service_id FK
    INT category_id FK
    VARCHAR subject
    TEXT description
    TEXT ai_summary
    DATE requested_date
    VARCHAR location
    ENUM status
    DATETIME expires_at
    TIMESTAMP created_at
    TIMESTAMP updated_at
  }

  quotations {
    INT id PK
    INT inquiry_id FK
    INT gardener_id FK
    ENUM response_type
    DECIMAL amount
    TEXT details
    TEXT proposed_changes
    DATE availability_start
    DATE availability_end
    ENUM status
    DATE valid_until
    INT revision_number
    TIMESTAMP locked_at
    TIMESTAMP created_at
    TIMESTAMP updated_at
  }

  quotation_revisions {
    INT id PK
    INT quotation_id FK
    INT revision_number
    VARCHAR response_type
    DECIMAL amount
    TEXT details
    TEXT proposed_changes
    DATE availability_start
    DATE availability_end
    DATE valid_until
    TIMESTAMP created_at
  }

  request_images {
    INT id PK
    INT inquiry_id FK
    INT uploaded_by FK
    ENUM kind
    INT parent_image_id FK
    VARCHAR file_path
    VARCHAR mime_type
    INT file_size
    TEXT ai_description
    TIMESTAMP created_at
  }

  request_events {
    INT id PK
    INT inquiry_id FK
    INT quotation_id FK
    INT agreement_id FK
    INT actor_id FK
    VARCHAR event_type
    VARCHAR from_status
    VARCHAR to_status
    VARCHAR note
    TIMESTAMP created_at
  }

  agreements {
    INT id PK
    INT inquiry_id FK
    INT quotation_id FK
    INT client_id FK
    INT gardener_id FK
    INT previous_agreement_id FK
    INT version
    TEXT scope_of_work
    DECIMAL amount
    VARCHAR price_basis
    DATETIME scheduled_start
    DATETIME scheduled_end
    VARCHAR location
    TEXT conditions
    INT proposed_by FK
    TIMESTAMP client_approved_at
    TIMESTAMP gardener_approved_at
    ENUM status
    TIMESTAMP created_at
    TIMESTAMP updated_at
  }

  bookings {
    INT id PK
    INT inquiry_id FK
    INT quotation_id FK
    INT agreement_id UK,FK
    INT client_id FK
    INT gardener_id FK
    INT service_id FK
    DATETIME scheduled_start
    DATETIME scheduled_end
    VARCHAR location
    TEXT notes
    ENUM status
    TIMESTAMP requested_at
    TIMESTAMP updated_at
  }

  conversations {
    INT id PK
    INT client_id FK
    INT gardener_id FK
    INT inquiry_id FK
    TIMESTAMP created_at
  }

  messages {
    INT id PK
    INT conversation_id FK
    INT sender_id FK
    TEXT message_text
    TIMESTAMP sent_at
    TIMESTAMP read_at
  }

  notifications {
    INT id PK
    INT user_id FK
    VARCHAR notification_type
    VARCHAR title
    TEXT message
    VARCHAR related_entity_type
    INT related_entity_id
    TIMESTAMP read_at
    TIMESTAMP created_at
  }

  reviews {
    INT id PK
    INT booking_id UK,FK
    INT client_id FK
    INT gardener_id FK
    TINYINT rating
    TEXT review_text
    BOOLEAN is_visible
    TIMESTAMP created_at
  }

  reports {
    INT id PK
    INT reporter_id FK
    INT reported_user_id FK
    INT reported_service_id FK
    INT reported_message_id FK
    VARCHAR reason
    TEXT details
    ENUM status
    INT resolved_by FK
    TEXT resolution_notes
    TIMESTAMP created_at
    TIMESTAMP resolved_at
  }

  ai_usage_log {
    INT id PK
    INT user_id FK
    ENUM feature
    INT inquiry_id
    INT request_image_id
    VARCHAR model
    ENUM outcome
    VARCHAR error_code
    TIMESTAMP created_at
  }

  users ||--o| client_profiles : "has client profile"
  users ||--o| gardener_profiles : "has gardener profile"
  users ||--o{ services : "offers"
  users ||--o{ portfolios : "showcases"
  service_categories ||--o{ services : "classifies"
  service_categories ||--o{ inquiries : "categorizes"

  users ||--o{ inquiries : "submits as client"
  users ||--o{ inquiries : "receives as gardener"
  services ||--o{ inquiries : "referenced by"

  inquiries ||--o{ quotations : "receives"
  users ||--o{ quotations : "submits offer"
  quotations ||--o{ quotation_revisions : "snapshots"

  inquiries ||--o{ request_images : "attaches"
  users ||--o{ request_images : "uploads"
  request_images ||--o{ request_images : "derives from"

  inquiries ||--o{ request_events : "logs"
  quotations ||--o{ request_events : "triggers"
  agreements ||--o{ request_events : "triggers"
  users ||--o{ request_events : "acts in"

  inquiries ||--o{ agreements : "negotiates"
  quotations ||--o{ agreements : "basis for"
  agreements ||--o| agreements : "supersedes"
  users ||--o{ agreements : "client or gardener or proposer"

  agreements ||--o| bookings : "confirms"
  inquiries ||--o{ bookings : "originates"
  quotations ||--o{ bookings : "linked offer"
  services ||--o{ bookings : "booked service"
  users ||--o{ bookings : "client and gardener"

  users ||--o{ conversations : "participates"
  inquiries ||--o{ conversations : "scoped to"
  conversations ||--o{ messages : "contains"
  users ||--o{ messages : "sends"

  users ||--o{ notifications : "receives"
  bookings ||--o| reviews : "reviewed once"
  users ||--o{ reviews : "writes and receives"

  users ||--o{ reports : "submits and resolves"
  services ||--o{ reports : "reported"
  messages ||--o{ reports : "reported"
  users ||--o{ ai_usage_log : "consumes quota"
```

### 1.2 Domain Grouping & Key Integrity Rules

| Domain | Tables | Key Schema & Integrity Rules |
|---|---|---|
| **Identity & Profiles** | `users`, `client_profiles`, `gardener_profiles` | `users.role` is `client`, `gardener`, or `administrator`. `users.avatar_path` stores optional profile pictures. `gardener_profiles.is_approved` gates public marketplace visibility. |
| **Marketplace & Portfolios** | `service_categories`, `services`, `portfolios` | `services.image_path` stores optional service cover/business design photos. `category_id` uses `ON DELETE RESTRICT` to preserve historical listings. |
| **Unified Request Engine** | `inquiries`, `quotations`, `quotation_revisions`, `request_images`, `request_events` | Supports Case 1 (`general`, `gardener_id` nullable) and Case 2 (`direct`, `gardener_id` required via `chk_inquiries_direct_has_provider`). `uq_quotation_active_offer` prevents duplicate active offers per provider per inquiry. |
| **Agreements & Bookings** | `agreements`, `bookings`, `reviews` | `agreements` enforces `chk_agreement_agreed_needs_both` and `uq_one_active_agreement`. `bookings.agreement_id` is unique (`uq_booking_agreement`), ensuring one confirmed booking per agreed agreement. `reviews.booking_id` is unique (`uq_review_booking`). |
| **Communication & Governance** | `conversations`, `messages`, `notifications`, `reports`, `ai_usage_log` | `uq_conversation_inquiry_provider` keeps one thread per inquiry-provider pair. `ai_usage_log` records per-user Gemini usage (`requirements`, `photo_analysis`, `garden_plan`) for 10/hour rate limiting. |

---

## 2. Data Flow Diagrams (DFD)

### 2.1 Level 0 — Context Diagram

```mermaid
flowchart LR
  Client["External Entity: Client"]
  Gardener["External Entity: Gardener"]
  Admin["External Entity: Administrator"]
  Gemini["External Entity: Google Gemini API"]
  System(["0.0 HugaTiera Platform"])

  Client -->|"Registration, profile & avatar, garden photos, requests, agreement approvals, messages, reviews"| System
  System -->|"Service listings, AI plans & photo notes, offers, agreements, booking status, notifications"| Client

  Gardener -->|"Profile & avatar, services & cover photos, portfolios, offers, agreement approvals, booking updates"| System
  System -->|"Open requests board, direct inquiries, AI decision-support view, bookings, reviews, notifications"| Gardener

  Admin -->|"Approval decisions, category updates, user role/status/delete actions, report resolutions"| System
  System -->|"KPI counts, analytics & breakdown logs, pending approvals, activity, reports, account list"| Admin

  System -->|"Sanitized garden photo & prompt context"| Gemini
  Gemini -->|"Structured requirements, photo descriptions, tropical garden ideas"| System
```

### 2.2 Level 1 — System Data Flow Diagram

```mermaid
flowchart TD
  Client["Client"]
  Gardener["Gardener"]
  Admin["Administrator"]
  Gemini["Google Gemini API"]

  P1(["1.0 Auth & Profile Management"])
  P2(["2.0 Marketplace, Services & Portfolios"])
  P3(["3.0 Unified Request & Offer Engine"])
  P4(["4.0 AI Garden Assistant"])
  P5(["5.0 Mutual Agreement & Booking Engine"])
  P6(["6.0 Messaging, Notifications & Reviews"])
  P7(["7.0 Admin Moderation & Analytics"])

  D1[("D1: users, client_profiles, gardener_profiles")]
  D2[("D2: service_categories, services, portfolios")]
  D3[("D3: inquiries, request_images, request_events")]
  D4[("D4: quotations, quotation_revisions")]
  D5[("D5: agreements, bookings")]
  D6[("D6: conversations, messages, notifications")]
  D7[("D7: reviews, reports")]
  D8[("D8: ai_usage_log")]
  FS[("D9: Local Media Storage (avatars, services, portfolios, request-images)")]

  Client <-->|"Credentials, profile, avatar"| P1
  Gardener <-->|"Credentials, profile, avatar"| P1
  P1 <-->|"Read/write user & profile rows"| D1
  P1 <-->|"Store/serve avatar files"| FS

  Gardener <-->|"Service CRUD, cover photos, portfolios"| P2
  Client -->|"Search, filter, view profiles"| P2
  P2 <-->|"Read/write listings & categories"| D2
  P2 -->|"Check is_approved & is_active"| D1
  P2 <-->|"Store/serve cover & portfolio images"| FS

  Client <-->|"Create Case 1/Case 2 request & upload photos"| P3
  Gardener <-->|"Browse open board, submit/revise offers"| P3
  P3 <-->|"Read/write inquiries, photos, events"| D3
  P3 <-->|"Read/write offers & revisions"| D4
  P3 <-->|"Store/serve EXIF-stripped garden photos"| FS
  P3 -->|"Notify counterparty"| P6

  Client <-->|"Photo analysis, requirements, garden plan"| P4
  Gardener <-->|"Garden plan queries"| P4
  P4 <-->|"Check/log 10-per-hour quota"| D8
  P4 -->|"Read photo metadata & update ai_description"| D3
  P4 <-->|"Multimodal & text requests"| Gemini

  Client <-->|"Propose, edit, approve agreement; view booking"| P5
  Gardener <-->|"Propose, edit, approve agreement; update progress"| P5
  P5 <-->|"Read/write versioned agreements & bookings"| D5
  P5 -->|"Lock accepted offer & update inquiry status"| D3
  P5 -->|"Read offer basis"| D4
  P5 -->|"Emit agreement & booking notifications"| P6

  Client <-->|"Messages, notifications, reviews, reports"| P6
  Gardener <-->|"Messages, notifications, reports"| P6
  P6 <-->|"Read/write threads, messages, alerts"| D6
  P6 <-->|"Write reviews & user reports"| D7
  P6 -->|"Verify Case 1 offer gating & booking completion"| D4

  Admin <-->|"Approvals, analytics, categories, accounts, reports"| P7
  P7 <-->|"Approve gardeners, edit/role-change/delete users"| D1
  P7 <-->|"Manage categories & moderate services"| D2
  P7 -->|"Read activity & analytics"| D3
  P7 -->|"Read booking completion metrics"| D5
  P7 <-->|"Resolve flagged reports"| D7
  P7 -->|"Send approval notifications"| D6
```

### 2.3 Level 2 — Request-to-Confirmation & Mutual Agreement Flow (Processes 3.0 & 5.0)

```mermaid
flowchart LR
  Client["Client"]
  Gardener["Gardener"]

  P31(["3.1 Upload & Strip Garden Photo"])
  P32(["3.2 Submit Case 1 Open or Case 2 Direct Request"])
  P33(["3.3 Submit / Revise Provider Offer"])
  P34(["3.4 Client Compares & Accepts Offer"])
  P51(["5.1 Propose / Revise Agreement Version"])
  P52(["5.2 Two-Party Approval & Conflict Check"])
  P53(["5.3 Confirm Booking & Update Inquiry"])

  D_IMG[("request_images + request-images/originals")]
  D_INQ[("inquiries + request_events")]
  D_QUO[("quotations + quotation_revisions")]
  D_AGR[("agreements")]
  D_BKG[("bookings")]
  D_NOT[("notifications")]

  Client -->|"JPEG/PNG/WebP"| P31
  P31 -->|"EXIF-stripped file & metadata"| D_IMG
  Client -->|"Scope, area/location, imageIds"| P32
  P32 -->|"Insert inquiry (open) & attach images"| D_INQ
  P32 -->|"Link inquiry_id"| D_IMG

  D_INQ -->|"Open board or direct target"| Gardener
  Gardener -->|"Amount, details, availability"| P33
  P33 -->|"Upsert quotation + snapshot revision"| D_QUO
  P33 -->|"Notify client"| D_NOT

  D_QUO -->|"Side-by-side comparison"| Client
  Client -->|"Select provider offer"| P34
  P34 -->|"Lock offer (accepted, locked_at)"| D_QUO
  P34 -->|"Set status = provider_selected"| D_INQ

  Client -->|"Scope, price, schedule, conditions"| P51
  Gardener -->|"Propose or counter-edit (v1..vN)"| P51
  P51 -->|"Supersede prior version, insert new version"| D_AGR
  P51 -->|"Set inquiry status = in_agreement"| D_INQ

  Client -->|"Approve version N"| P52
  Gardener -->|"Approve version N"| P52
  D_AGR -->|"Verify same version & both timestamps"| P52
  D_BKG -->|"Check gardener schedule overlap"| P52

  P52 -->|"Both approved & no overlap"| P53
  P53 -->|"Mark agreement = agreed"| D_AGR
  P53 -->|"Insert confirmed booking (uq_booking_agreement)"| D_BKG
  P53 -->|"Mark inquiry = confirmed & decline other offers"| D_INQ
  P53 -->|"Notify client & gardener"| D_NOT
```
