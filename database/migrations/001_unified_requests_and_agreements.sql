-- =====================================================================
-- HugaTiera migration 001: unified requests, offers, agreements, images
-- Revision Track step R1 (scope revision approved 2026-11-10)
--
-- Validated against: MariaDB 10.4.32 (XAMPP), InnoDB, utf8mb4_unicode_ci.
-- Portable to MySQL 8.0.16+ (generated columns and CHECK constraints).
--
-- HOW TO RUN (once only, on a database that has been backed up):
--   Select the target database first (this file has no USE statement), then run it.
--   DDL statements in MySQL/MariaDB cannot be rolled back, so the real rollback
--   is restoring the backup taken before this migration.
--
-- Data change: section 2 changes the STATUS (nothing is deleted) of older
-- duplicate active offers from one provider on one request to 'withdrawn'.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extend ENUMs first (append only, so existing rows are untouched)
-- ---------------------------------------------------------------------
ALTER TABLE quotations
  MODIFY status ENUM('draft','sent','accepted','declined','expired','withdrawn')
    NOT NULL DEFAULT 'draft';

ALTER TABLE inquiries
  MODIFY status ENUM('open','responded','closed','cancelled',
                     'provider_selected','in_agreement','confirmed','expired')
    NOT NULL DEFAULT 'open';

-- ---------------------------------------------------------------------
-- 2. Data normalisation: at most one ACTIVE offer per provider per request.
--    Keep the most advanced offer (accepted > sent > draft; newest if equal).
--    Others become 'withdrawn' (history is preserved, nothing is deleted).
-- ---------------------------------------------------------------------
UPDATE quotations q
JOIN quotations k
  ON k.inquiry_id = q.inquiry_id
 AND k.gardener_id = q.gardener_id
 AND k.id <> q.id
 AND k.status IN ('draft','sent','accepted')
SET q.status = 'withdrawn'
WHERE q.status IN ('draft','sent','accepted')
  AND (
       (k.status = 'accepted' AND q.status <> 'accepted')
    OR (k.status = 'sent'     AND q.status = 'draft')
    OR (k.status = q.status   AND k.id > q.id)
  );

-- ---------------------------------------------------------------------
-- 3. inquiries: one table for Case 1 (general) and Case 2 (direct)
-- ---------------------------------------------------------------------
ALTER TABLE inquiries
  MODIFY gardener_id INT UNSIGNED NULL,
  ADD COLUMN request_type ENUM('direct','general') NOT NULL DEFAULT 'direct' AFTER id,
  ADD COLUMN category_id INT UNSIGNED NULL,
  ADD COLUMN ai_summary TEXT NULL,
  ADD COLUMN expires_at DATETIME NULL,
  ADD CONSTRAINT fk_inquiries_category FOREIGN KEY (category_id)
    REFERENCES service_categories(id) ON DELETE SET NULL,
  ADD CONSTRAINT chk_inquiries_direct_has_provider
    CHECK (request_type = 'general' OR gardener_id IS NOT NULL),
  ADD INDEX idx_inquiries_open_board (request_type, status, category_id, expires_at),
  ADD INDEX idx_inquiries_expiry (status, expires_at);

-- ---------------------------------------------------------------------
-- 4. quotations: provider offers/responses with revisions and locking
-- ---------------------------------------------------------------------
ALTER TABLE quotations
  ADD COLUMN response_type ENUM('interest','offer','feasible','modifications','cannot_do')
    NOT NULL DEFAULT 'offer',
  ADD COLUMN proposed_changes TEXT NULL,
  ADD COLUMN revision_number INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN locked_at TIMESTAMP NULL,
  ADD COLUMN active_flag TINYINT UNSIGNED
    GENERATED ALWAYS AS (IF(status IN ('draft','sent','accepted'), 1, NULL)) STORED,
  ADD UNIQUE KEY uq_quotation_active_offer (inquiry_id, gardener_id, active_flag);

CREATE TABLE quotation_revisions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quotation_id INT UNSIGNED NOT NULL,
  revision_number INT UNSIGNED NOT NULL,
  response_type VARCHAR(20) NOT NULL,
  amount DECIMAL(10, 2) NULL,
  details TEXT NOT NULL,
  proposed_changes TEXT NULL,
  availability_start DATE NULL,
  availability_end DATE NULL,
  valid_until DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  UNIQUE KEY uq_quotation_revision (quotation_id, revision_number)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. conversations: one thread per provider per request (Case 1)
--    The new key is added first because the foreign key on inquiry_id
--    needs an index while the old unique key is dropped.
-- ---------------------------------------------------------------------
ALTER TABLE conversations
  ADD UNIQUE KEY uq_conversation_inquiry_provider (inquiry_id, gardener_id);

ALTER TABLE conversations
  DROP INDEX uq_conversation_inquiry;

-- ---------------------------------------------------------------------
-- 6. request_images: client photos now, AI-generated images later
-- ---------------------------------------------------------------------
CREATE TABLE request_images (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT UNSIGNED NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  kind ENUM('original','ai_generated') NOT NULL DEFAULT 'original',
  parent_image_id INT UNSIGNED NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  ai_description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_image_id) REFERENCES request_images(id) ON DELETE SET NULL,
  INDEX idx_request_images_inquiry (inquiry_id, kind),
  INDEX idx_request_images_unattached (inquiry_id, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. agreements: versioned mutual agreement; the only source of bookings
-- ---------------------------------------------------------------------
CREATE TABLE agreements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT UNSIGNED NOT NULL,
  quotation_id INT UNSIGNED NULL,
  client_id INT UNSIGNED NOT NULL,
  gardener_id INT UNSIGNED NOT NULL,
  previous_agreement_id INT UNSIGNED NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  scope_of_work TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  price_basis VARCHAR(100) NULL,
  scheduled_start DATETIME NOT NULL,
  scheduled_end DATETIME NOT NULL,
  location VARCHAR(255) NOT NULL,
  conditions TEXT NULL,
  proposed_by INT UNSIGNED NOT NULL,
  client_approved_at TIMESTAMP NULL,
  gardener_approved_at TIMESTAMP NULL,
  status ENUM('proposed','agreed','superseded','cancelled') NOT NULL DEFAULT 'proposed',
  active_key INT UNSIGNED
    GENERATED ALWAYS AS (IF(status IN ('proposed','agreed'), inquiry_id, NULL)) STORED,
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
  UNIQUE KEY uq_one_active_agreement (active_key),
  INDEX idx_agreements_inquiry (inquiry_id, version)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. bookings: a confirmed arrangement links to exactly one agreement
--    (legacy bookings keep agreement_id = NULL)
-- ---------------------------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN agreement_id INT UNSIGNED NULL,
  ADD UNIQUE KEY uq_booking_agreement (agreement_id),
  ADD CONSTRAINT fk_bookings_agreement FOREIGN KEY (agreement_id)
    REFERENCES agreements(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------
-- 9. request_events: audit trail of important actions and approvals
-- ---------------------------------------------------------------------
CREATE TABLE request_events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT UNSIGNED NOT NULL,
  quotation_id INT UNSIGNED NULL,
  agreement_id INT UNSIGNED NULL,
  actor_id INT UNSIGNED NULL,
  event_type VARCHAR(50) NOT NULL,
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

-- ---------------------------------------------------------------------
-- 10. ai_usage_log: per-user limits and cost tracking (no prompt text stored)
-- ---------------------------------------------------------------------
CREATE TABLE ai_usage_log (
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
