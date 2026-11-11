-- =====================================================================
-- HugaTiera migration 001 ROLLBACK (structure only)
--
-- Use this to rehearse or undo the structure on a database that holds no
-- data created by the new workflows. The REAL rollback is restoring the
-- backup taken before migration 001.
--
-- It cannot restore the one data normalisation (older duplicate active
-- offers set to 'withdrawn'); those rows are set to 'declined' so the old
-- ENUM accepts them. Run it only when no row uses the new inquiry statuses
-- (provider_selected, in_agreement, confirmed, expired) or general requests.
-- =====================================================================

DROP TABLE IF EXISTS ai_usage_log;
DROP TABLE IF EXISTS request_events;

ALTER TABLE bookings
  DROP FOREIGN KEY fk_bookings_agreement,
  DROP INDEX uq_booking_agreement,
  DROP COLUMN agreement_id;

DROP TABLE IF EXISTS agreements;
DROP TABLE IF EXISTS request_images;

ALTER TABLE conversations
  ADD UNIQUE KEY uq_conversation_inquiry (inquiry_id);
ALTER TABLE conversations
  DROP INDEX uq_conversation_inquiry_provider;

DROP TABLE IF EXISTS quotation_revisions;

ALTER TABLE quotations
  DROP INDEX uq_quotation_active_offer,
  DROP COLUMN active_flag,
  DROP COLUMN locked_at,
  DROP COLUMN revision_number,
  DROP COLUMN proposed_changes,
  DROP COLUMN response_type;

UPDATE quotations SET status = 'declined' WHERE status = 'withdrawn';
ALTER TABLE quotations
  MODIFY status ENUM('draft','sent','accepted','declined','expired')
    NOT NULL DEFAULT 'draft';

-- inquiries: remove constraints/indexes, then columns, then restore NOT NULL.
-- Precondition: no row has gardener_id IS NULL (no general requests exist).
ALTER TABLE inquiries
  DROP INDEX idx_inquiries_expiry,
  DROP INDEX idx_inquiries_open_board,
  DROP CONSTRAINT chk_inquiries_direct_has_provider,
  DROP FOREIGN KEY fk_inquiries_category;

ALTER TABLE inquiries
  DROP COLUMN expires_at,
  DROP COLUMN ai_summary,
  DROP COLUMN category_id,
  DROP COLUMN request_type;

-- MariaDB refuses NULL -> NOT NULL on a foreign-key column while foreign key
-- checks are on (error 1832), so this single statement runs with them off.
SET FOREIGN_KEY_CHECKS = 0;
ALTER TABLE inquiries MODIFY gardener_id INT UNSIGNED NOT NULL;
SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE inquiries
  MODIFY status ENUM('open','responded','closed','cancelled') NOT NULL DEFAULT 'open';
