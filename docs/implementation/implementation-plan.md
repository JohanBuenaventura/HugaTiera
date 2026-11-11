# HugaTiera Revision: Consolidated Implementation Plan

Status: **proposal for your review. No code, database, or migration has been changed.** Only documentation was updated (see the end).

## 1. Approved decisions

| # | Decision |
|---|---|
| 1 | Priced-service direct requests are kept but go through the **mutual agreement** step. |
| 2 | **Text and photo understanding only** (Gemini). Paid image generation is postponed. No paid billing without your approval. The design stays extensible. |
| 3 | Providers can **revise offers** until the client accepts. Latest offer is active, history is kept. An accepted offer is **locked**. |
| 4 | Extend `inquiries` and `quotations`. Avoid duplication. Explain schema changes first. |
| 5 | Documents updated. Phase 15 is **not** marked complete. |

**Mutual agreement applies to both cases:** an offer, response, or acceptance never creates a booking. A booking exists only when both parties approve the same agreement version.

## 2. How the two cases map onto one engine

| Concept | Case 1: General request | Case 2: Direct inquiry | Stored in |
|---|---|---|---|
| Request | `request_type = general`, no provider | `request_type = direct`, one provider | `inquiries` (extended) |
| Photo | client's original photo | client's original photo | new `request_images` |
| Provider reply | interest or offer (many providers) | feasible / suggest modifications / cannot do (one provider) | `quotations` (extended) |
| Revisions | provider edits own offer until accepted | same | `quotations` + new `quotation_revisions` |
| Client decision | accept or decline an offer | accept or decline the response | `quotations.status` |
| Agreement | scope, price, schedule, conditions, both approve | same | new `agreements` |
| Confirmed arrangement | booking created on both approvals | same | `bookings` (+ `agreement_id`) |
| Priced service request | creates a `direct` request plus an agreement proposal | n/a | same tables |

## 3. State machine

**Request (`inquiries.status`):**
`open` → `responded` (at least one provider reply) → `provider_selected` (client accepted a reply) → `in_agreement` (an agreement proposal is active) → `confirmed` (both approved; booking exists). Also `closed`, `cancelled`, and `expired`.
Completion and cancellation of the service itself stay on the booking (`in_progress`, `completed`, `cancelled`).

**Provider reply (`quotations.status` = the client's decision):** `sent` → `accepted` / `declined`. Also `withdrawn` by the provider and `expired`.
- `response_type` records the provider's stance: `interest`, `offer`, `feasible`, `modifications`, `cannot_do`.
- A `cannot_do` reply cannot be accepted.
- Revising is allowed only while `status = sent`. Accepting sets `locked_at` and blocks further unilateral edits.

**Agreement:** `proposed` → `agreed`. Also `superseded` (a newer version replaced it) and `cancelled`.
- Either party may propose, and the proposer's approval is recorded automatically.
- Any edit creates a **new version** (new row linked to the previous one) and resets approvals.
- On the second approval, in one transaction: re-check the provider's schedule conflicts, set `agreed`, create the booking (status `accepted`), set the request to `confirmed`, decline the other open offers, notify both parties, and write audit events.

**Other rules:**
- Only one active agreement per request, enforced by a database unique key.
- Only one accepted offer per request, enforced by locking the request row in a transaction.
- If an agreement is cancelled, the accepted offer stays accepted. The client may propose a new agreement, or decline the offer, which returns the request to `responded`.

### 3.1 Request expiry (added after review)

- `inquiries.expires_at` (nullable `DATETIME`). The client picks a validity period when submitting (7, 14 or 30 days; default 14). `NULL` means "never expires" and is used for existing legacy rows.
- **What expires:** only requests with status `open` or `responded` (no offer accepted yet). A request that has reached `provider_selected`, `in_agreement`, or `confirmed` is **protected and never auto-expired or auto-cancelled**.
- **No scheduled job.** Expiry is evaluated when the data is read or written:
  - A request counts as expired when `expires_at < NOW()` and its status is `open` or `responded`.
  - The backend persists this lazily by setting status `expired` (inside the same transaction as the read or write that noticed it) and writing a `request_expired` audit event and a client notification.
- **Provider dashboard:** the Open Requests board lists only non-expired requests and shows the remaining time. A provider who already submitted an offer on a request that later expires keeps seeing it in "My offers" labelled *Expired*.
- **Expired requests do not accept new offers, and existing offers cannot be revised** (a plain 409 with a clear message). The client may still **renew** the request (new `expires_at`, status returns to `open` or `responded`), or close it.
- If a request is already in agreement when its date passes, nothing changes. The agreement continues normally.

### 3.2 Agreement and booking integrity (added after review)

All agreement writes run in a single database transaction, with the agreement row locked (`SELECT … FOR UPDATE`):

- **Propose:** creates version 1 and records the proposer's approval automatically. Sets the request to `in_agreement`.
- **Edit:** locks the current version, marks it `superseded`, and inserts version N+1 linked through `previous_agreement_id`. **Both approvals are cleared** (the editor's own approval is recorded again). Editing an `agreed` version is not allowed.
- **Approve:** the request must include the version number being approved. The server rejects it with 409 if that version is no longer the current one, so nobody can approve a stale version. It also checks that the caller is a party who has not already approved.
- **Second approval:** in the same transaction, re-check the provider's schedule for conflicts, set the agreement `agreed`, insert the booking with `agreement_id`, set the request `confirmed`, decline the other open offers, write the audit events, and create the notifications. If any step fails, everything rolls back.
- **Database-level guards** (so a bug cannot create an invalid state):
  - `CHECK (status <> 'agreed' OR both approval timestamps are set)`.
  - `UNIQUE` active-agreement key, so only one proposed or agreed agreement exists per request.
  - `UNIQUE (bookings.agreement_id)`, so one agreement can produce at most one booking.

## 4. Proposed database changes (for your review)

All changes are additive. `NULL` or default values keep existing rows valid. Existing tests and records stay intact.

**Why extend rather than add new tables:** the existing `quotations` already has request, provider, amount, details, availability, status and validity, so it is the offer. `inquiries` already holds the client's request, optional service, and location. Only genuinely new concepts get new tables.

### 4.1 Changes to existing tables

*(Revised after database validation. ENUM values are appended after the existing ones so existing rows are not rewritten. The old `UNIQUE(inquiry_id, gardener_id)` on quotations became a unique key over active offers only, because existing data already contains two active offers from one provider on one inquiry.)*

```sql
-- inquiries: one table for both workflows
ALTER TABLE inquiries
  MODIFY status ENUM('open','responded','closed','cancelled',
                     'provider_selected','in_agreement','confirmed','expired')
      NOT NULL DEFAULT 'open',
  MODIFY gardener_id INT UNSIGNED NULL,                 -- NULL only for general requests
  ADD COLUMN request_type ENUM('direct','general') NOT NULL DEFAULT 'direct' AFTER id,
  ADD COLUMN category_id INT UNSIGNED NULL,             -- lets providers filter the open board
  ADD COLUMN ai_summary TEXT NULL,                      -- client-approved AI-assisted summary
  ADD COLUMN expires_at DATETIME NULL,                  -- NULL = never expires (legacy rows)
  ADD CONSTRAINT fk_inquiries_category FOREIGN KEY (category_id)
      REFERENCES service_categories(id) ON DELETE SET NULL,
  ADD CONSTRAINT chk_inquiries_direct_has_provider
      CHECK (request_type = 'general' OR gardener_id IS NOT NULL),
  ADD INDEX idx_inquiries_open_board (request_type, status, category_id, expires_at),
  ADD INDEX idx_inquiries_expiry (status, expires_at);

-- quotations: provider offers and responses, with revisions and locking
ALTER TABLE quotations
  MODIFY status ENUM('draft','sent','accepted','declined','expired','withdrawn')
      NOT NULL DEFAULT 'draft';
-- data normalisation (see 4.4): older duplicate active offers become 'withdrawn'
ALTER TABLE quotations
  ADD COLUMN response_type ENUM('interest','offer','feasible','modifications','cannot_do')
      NOT NULL DEFAULT 'offer',
  ADD COLUMN proposed_changes TEXT NULL,                -- Case 2 suggested modifications
  ADD COLUMN revision_number INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN locked_at TIMESTAMP NULL,                  -- set when the client accepts
  ADD COLUMN active_flag TINYINT UNSIGNED
      GENERATED ALWAYS AS (IF(status IN ('draft','sent','accepted'), 1, NULL)) STORED,
  ADD UNIQUE KEY uq_quotation_active_offer (inquiry_id, gardener_id, active_flag);
  -- => at most ONE active offer per provider per request; withdrawn/declined history rows are unrestricted

-- conversations: one thread per provider per request (needed for Case 1)
ALTER TABLE conversations
  ADD UNIQUE KEY uq_conversation_inquiry_provider (inquiry_id, gardener_id);  -- added FIRST:
ALTER TABLE conversations
  DROP INDEX uq_conversation_inquiry;                                         -- the FK needs an index on inquiry_id

-- bookings: a confirmed arrangement always comes from an agreement
-- (columns and key added now; the foreign key is added after `agreements` exists)
ALTER TABLE bookings
  ADD COLUMN agreement_id INT UNSIGNED NULL,
  ADD UNIQUE KEY uq_booking_agreement (agreement_id);
```

### 4.2 New tables

```sql
CREATE TABLE quotation_revisions (       -- snapshot of each superseded version
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quotation_id INT UNSIGNED NOT NULL,
  revision_number INT UNSIGNED NOT NULL,
  response_type VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NULL,
  details TEXT NOT NULL,
  proposed_changes TEXT NULL,
  availability_start DATE NULL, availability_end DATE NULL, valid_until DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  UNIQUE KEY uq_revision (quotation_id, revision_number)
) ENGINE=InnoDB;

CREATE TABLE request_images (            -- originals now; generated images later
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT UNSIGNED NULL,          -- NULL until the request is submitted
  uploaded_by INT UNSIGNED NOT NULL,
  kind ENUM('original','ai_generated') NOT NULL DEFAULT 'original',
  parent_image_id INT UNSIGNED NULL,     -- future: generated image points to its original
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  ai_description TEXT NULL,              -- photo-understanding text the client reviewed
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_image_id) REFERENCES request_images(id) ON DELETE SET NULL,
  INDEX idx_request_images_inquiry (inquiry_id, kind)
) ENGINE=InnoDB;

CREATE TABLE agreements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT UNSIGNED NOT NULL,
  quotation_id INT UNSIGNED NULL,
  client_id INT UNSIGNED NOT NULL,
  gardener_id INT UNSIGNED NOT NULL,
  previous_agreement_id INT UNSIGNED NULL,   -- version history without another table
  version INT UNSIGNED NOT NULL DEFAULT 1,
  scope_of_work TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  price_basis VARCHAR(100) NULL,
  scheduled_start DATETIME NOT NULL,
  scheduled_end DATETIME NOT NULL,
  location VARCHAR(255) NOT NULL,            -- exact address is revealed only here
  conditions TEXT NULL,
  proposed_by INT UNSIGNED NOT NULL,
  client_approved_at TIMESTAMP NULL,
  gardener_approved_at TIMESTAMP NULL,
  status ENUM('proposed','agreed','superseded','cancelled') NOT NULL DEFAULT 'proposed',
  active_key INT UNSIGNED GENERATED ALWAYS AS
      (IF(status IN ('proposed','agreed'), inquiry_id, NULL)) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE RESTRICT,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (previous_agreement_id) REFERENCES agreements(id) ON DELETE SET NULL,
  FOREIGN KEY (proposed_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_agreement_agreed_needs_both
      CHECK (status <> 'agreed' OR (client_approved_at IS NOT NULL AND gardener_approved_at IS NOT NULL)),
  CONSTRAINT chk_agreement_schedule CHECK (scheduled_end > scheduled_start),
  CONSTRAINT chk_agreement_proposer CHECK (proposed_by IN (client_id, gardener_id)),
  UNIQUE KEY uq_one_active_agreement (active_key)   -- one active agreement per request
) ENGINE=InnoDB;
-- then: ALTER TABLE bookings ADD CONSTRAINT fk_bookings_agreement
--       FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE RESTRICT;

CREATE TABLE request_events (            -- audit trail of important actions and approvals
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT UNSIGNED NOT NULL,
  quotation_id INT UNSIGNED NULL,
  agreement_id INT UNSIGNED NULL,
  actor_id INT UNSIGNED NOT NULL,
  event_type VARCHAR(50) NOT NULL,       -- e.g. offer_sent, offer_revised, offer_accepted, agreement_approved
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL,
  FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_request_events_inquiry (inquiry_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE ai_usage_log (              -- usage limits and cost tracking; no prompt text stored
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  feature ENUM('requirements','photo_analysis','garden_plan') NOT NULL,
  inquiry_id INT UNSIGNED NULL,
  request_image_id INT UNSIGNED NULL,
  model VARCHAR(100) NOT NULL,
  outcome ENUM('success','error','rate_limited') NOT NULL,
  error_code VARCHAR(50) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ai_usage_user (user_id, created_at)
) ENGINE=InnoDB;
```

### 4.3 How this keeps the design extensible for image generation later
Adding generation later needs only: one new `feature` value (`image_generation`) in `ai_usage_log`, and new `request_images` rows with `kind = 'ai_generated'` and `parent_image_id` pointing at the original. The upload, storage, access control, and display code are the same. No redesign is needed.

### 4.4 Existing data (validated against the real database on 2026-11-11)

| Check | Result | Consequence |
|---|---|---|
| Server | **MariaDB 10.4.32** (XAMPP), InnoDB, `utf8mb4_unicode_ci` | Stored generated columns and `CHECK` constraints are supported and enforced. The SQL stays portable, so it also works on MySQL 8.0.16+. |
| Column types | All referenced keys are `INT UNSIGNED` | Foreign keys are compatible. No type changes needed. |
| Orphans | None | Safe to add constraints. |
| Row counts | users 22, inquiries 2, quotations 3, bookings 4, conversations 1 | Small, so rehearsal is fast. |
| ENUM values in use | inquiries: `responded` (2). quotations: `sent` (1), `accepted` (2). bookings: `pending` (1), `completed` (3) | All stay valid. New ENUM values are appended after the existing ones. |
| **Duplicate quotations** | inquiry 2 / gardener 16 has **two active offers**: #2 (`accepted`, ₱1000, "overall cleaning", booked) and #3 (`sent`, ₱123123, "qweqwe", looks like test data) | A plain `UNIQUE(inquiry_id, gardener_id)` would fail. Replaced by the active-offer unique key. The migration marks the older or less-advanced duplicate as `withdrawn` (here: #3). It is a status change only, so nothing is deleted. **This is a data change to your real records, so it needs your approval before the real run.** |
| Conversations | `uq_conversation_inquiry` is the only index covering `inquiry_id` (used by the FK) | Add the new composite unique key first, then drop the old one. |
| Legacy workflow state | Both inquiries are still `responded` although quotations were accepted and bookings exist | Left unchanged. The backend treats bookings with `agreement_id IS NULL` as legacy bookings. |

### 4.5 Sensitive points to review
1. Dropping the old conversations unique key and adding the per-provider one (the new key is added first, so nothing is unprotected).
2. Making `inquiries.gardener_id` nullable. The `CHECK` plus backend validation keeps direct requests valid.
3. Booking creation will only come from an agreed agreement. The old direct paths (`POST /api/bookings` from a quotation or a service) will be retired in R3. New bookings start as `accepted`, because the provider's agreement approval is the acceptance. The old `pending` and `declined` transitions remain only for legacy rows.

## 5. API and frontend impact

| Area | Change |
|---|---|
| Requests | `POST /api/requests` (both types, with images). `GET /api/requests/open` (provider board). Existing `/api/inquiries` stays, so current screens and tests keep working. |
| Offers | `POST /api/requests/:id/offers`, `PUT /api/offers/:id` (revise, only while `sent`), withdraw, client accept or decline. |
| Agreements | `POST /api/requests/:id/agreements`, `PUT /api/agreements/:id` (new version), `POST /api/agreements/:id/approve`, cancel. |
| Images | `POST /api/request-images` (upload), `GET /api/request-images/:id` (authorised only). |
| AI | `POST /api/ai/requirements`, `POST /api/ai/photo-analysis`, both returning editable suggestions. Limits come from `ai_usage_log`. |
| Existing code to change | `booking.controller` (creation gated by agreements), `inquiry.controller` (general requests, revisions, locking), `conversation.controller` (per provider, only providers with an offer), `ai.controller` (database-backed limits), `upload.middleware` (content checks), `ServiceDetailPage` (priced-service button creates a direct request plus agreement proposal). |
| New pages | Request wizard (photo, requirements, AI help), provider Open Requests board, offer comparison, agreement screen, request timeline. |

**Privacy:** the open board shows photos and area-level location only to approved providers. The exact address and phone are shared only inside the agreement.

## 6. Step plan

| Step | Content | Gate |
|---|---|---|
| R0 | Docs updated, plan proposed (this document) | **Your review** |
| R1 | Back up DB, migration + schema/README update, test on a copy | Your approval before running on the local DB |
| R2 | Secure photo upload and access control | Confirmation |
| R3 | Agreement engine, booking gating, priced-service routing | Confirmation |
| R4 | Case 2 end to end | Confirmation |
| R5 | Case 1 end to end | Confirmation |
| R6 | Gemini requirements and photo understanding, provider view, DB-backed limits | Confirmation, after the live-API check |
| R7 | Tests and manual verification, completes Phase 15 | Confirmation |

## 7. Testing plan (extends `backend/tests/integration.test.js`)
- Offer revision allowed before acceptance, rejected after acceptance (locked).
- Only one accepted offer per request. Concurrent accepts resolved safely.
- Agreement: version history, approval reset on edit, second approval creates exactly one booking, duplicate approval rejected, schedule conflict rejected.
- A client or provider cannot create a booking any other way.
- Ownership and role checks on every new endpoint. Image access control for outsiders.
- AI failure and rate-limit handling, and the request flow with AI unavailable.
- Both workflows end to end, plus notifications and audit events.
- Manual: responsive layouts, real photo upload, live Gemini call, all in a browser.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Gemini free-tier availability, model name, or photo support unverified | Verify in R6 before relying on it. The flow works without AI. |
| Garden photos reveal location | Strip location metadata, no public image URLs, area-level info on the open board. |
| Concurrency (double accept or approve) | Transactions, row locks, unique keys. |
| Schema rollback after migration | Backup first, rehearse on a copy, write a rollback note. |
| Scope growth | One engine, no new frameworks, no payments, no real-time chat. |

## 9. Decisions (all confirmed by you)
1. **Photo processing: `sharp` library (approved).** Used in R2 to decode and validate every upload (a file that cannot be decoded is rejected), apply the EXIF orientation, resize to a sensible maximum, and **re-encode the image without any metadata, including GPS location**, before it is stored. Only the cleaned copy is kept. `sharp` is added in R2, not before.
2. **Request expiry (approved):** `inquiries.expires_at`, handled as described in section 3.1. Requests in agreement are never auto-cancelled.
3. **Conversation access (confirmed):** in Case 1, a provider can message a client only after submitting an offer on that request.

## 10. Documentation changes made in this step
- `AGENTS.md`: revised workflow rule, AI scope (image generation postponed), revision-track rules.
- `prompt/masterprompt.md`: revised Section 4 (workflows and mutual agreement), Section 7 (AI), Section 8, and new Section 11A (Revision Track).
- `prompt/prompts.md`: appended R0–R7 prompts. `prompt/phase.md`: added a revision-track note.
- `project_progress.md`: Phase 15 status corrected to partially verified (not complete), revised decisions, R-step checklist, accurate known issues.
- `system_bug_and_missing_features.md`: "verified" now means build/lint/API tests only; browser checks pending.
