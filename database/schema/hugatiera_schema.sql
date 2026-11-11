CREATE DATABASE IF NOT EXISTS hugatiera_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hugatiera_db;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('client', 'gardener', 'administrator') NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(30) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role_active (role, is_active)
) ENGINE=InnoDB;

CREATE TABLE client_profiles (
  user_id INT UNSIGNED PRIMARY KEY,
  address VARCHAR(255) NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Zamboanga City',
  bio TEXT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE gardener_profiles (
  user_id INT UNSIGNED PRIMARY KEY,
  business_name VARCHAR(150) NULL,
  description TEXT NULL,
  service_area VARCHAR(150) NOT NULL DEFAULT 'Zamboanga City',
  years_of_experience TINYINT UNSIGNED NULL,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_gardener_profiles_approved_area (is_approved, service_area)
) ENGINE=InnoDB;

CREATE TABLE service_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gardener_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  indicative_price DECIMAL(10, 2) NULL,
  price_unit VARCHAR(50) NULL,
  service_area VARCHAR(150) NOT NULL DEFAULT 'Zamboanga City',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE RESTRICT,
  INDEX idx_services_search (category_id, service_area, is_active),
  INDEX idx_services_gardener (gardener_id, is_active)
) ENGINE=InnoDB;

CREATE TABLE portfolios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gardener_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  image_path VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_portfolios_gardener (gardener_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE inquiries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_type ENUM('direct', 'general') NOT NULL DEFAULT 'direct',
  client_id INT UNSIGNED NOT NULL,
  gardener_id INT UNSIGNED NULL,
  service_id INT UNSIGNED NULL,
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  requested_date DATE NULL,
  location VARCHAR(255) NULL,
  status ENUM('open', 'responded', 'closed', 'cancelled', 'provider_selected', 'in_agreement', 'confirmed', 'expired') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  category_id INT UNSIGNED NULL,
  ai_summary TEXT NULL,
  expires_at DATETIME NULL,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  CONSTRAINT fk_inquiries_category FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE SET NULL,
  CONSTRAINT chk_inquiries_direct_has_provider CHECK (request_type = 'general' OR gardener_id IS NOT NULL),
  INDEX idx_inquiries_client_status (client_id, status, created_at),
  INDEX idx_inquiries_gardener_status (gardener_id, status, created_at),
  INDEX idx_inquiries_open_board (request_type, status, category_id, expires_at),
  INDEX idx_inquiries_expiry (status, expires_at)
) ENGINE=InnoDB;

CREATE TABLE quotations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT UNSIGNED NOT NULL,
  gardener_id INT UNSIGNED NOT NULL,
  amount DECIMAL(10, 2) NULL,
  details TEXT NOT NULL,
  availability_start DATE NULL,
  availability_end DATE NULL,
  status ENUM('draft', 'sent', 'accepted', 'declined', 'expired', 'withdrawn') NOT NULL DEFAULT 'draft',
  valid_until DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  response_type ENUM('interest', 'offer', 'feasible', 'modifications', 'cannot_do') NOT NULL DEFAULT 'offer',
  proposed_changes TEXT NULL,
  revision_number INT UNSIGNED NOT NULL DEFAULT 1,
  locked_at TIMESTAMP NULL,
  active_flag TINYINT UNSIGNED GENERATED ALWAYS AS (IF(status IN ('draft', 'sent', 'accepted'), 1, NULL)) STORED,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_quotations_inquiry (inquiry_id, created_at),
  INDEX idx_quotations_gardener_status (gardener_id, status),
  UNIQUE KEY uq_quotation_active_offer (inquiry_id, gardener_id, active_flag)
) ENGINE=InnoDB;

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

CREATE TABLE conversations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT UNSIGNED NOT NULL,
  gardener_id INT UNSIGNED NOT NULL,
  inquiry_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE SET NULL,
  UNIQUE KEY uq_conversation_inquiry_provider (inquiry_id, gardener_id),
  INDEX idx_conversations_client (client_id),
  INDEX idx_conversations_gardener (gardener_id)
) ENGINE=InnoDB;

CREATE TABLE messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT UNSIGNED NOT NULL,
  sender_id INT UNSIGNED NOT NULL,
  message_text TEXT NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_messages_conversation (conversation_id, sent_at)
) ENGINE=InnoDB;

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
  status ENUM('proposed', 'agreed', 'superseded', 'cancelled') NOT NULL DEFAULT 'proposed',
  active_key INT UNSIGNED GENERATED ALWAYS AS (IF(status IN ('proposed', 'agreed'), inquiry_id, NULL)) STORED,
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

CREATE TABLE bookings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT UNSIGNED NULL,
  quotation_id INT UNSIGNED NULL,
  client_id INT UNSIGNED NOT NULL,
  gardener_id INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NULL,
  scheduled_start DATETIME NULL,
  scheduled_end DATETIME NULL,
  location VARCHAR(255) NULL,
  notes TEXT NULL,
  status ENUM('pending', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  agreement_id INT UNSIGNED NULL,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE SET NULL,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  CONSTRAINT fk_bookings_agreement FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_booking_agreement (agreement_id),
  INDEX idx_bookings_client_status (client_id, status, requested_at),
  INDEX idx_bookings_gardener_status (gardener_id, status, requested_at),
  INDEX idx_bookings_schedule (gardener_id, scheduled_start, scheduled_end)
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id INT UNSIGNED NOT NULL,
  client_id INT UNSIGNED NOT NULL,
  gardener_id INT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  review_text TEXT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_review_booking (booking_id),
  INDEX idx_reviews_gardener (gardener_id, is_visible, created_at)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  related_entity_type VARCHAR(50) NULL,
  related_entity_id INT UNSIGNED NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user_read (user_id, read_at, created_at)
) ENGINE=InnoDB;

CREATE TABLE reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporter_id INT UNSIGNED NOT NULL,
  reported_user_id INT UNSIGNED NULL,
  reported_service_id INT UNSIGNED NULL,
  reported_message_id INT UNSIGNED NULL,
  reason VARCHAR(255) NOT NULL,
  details TEXT NULL,
  status ENUM('open', 'reviewing', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  resolved_by INT UNSIGNED NULL,
  resolution_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reported_service_id) REFERENCES services(id) ON DELETE SET NULL,
  FOREIGN KEY (reported_message_id) REFERENCES messages(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_reports_status (status, created_at)
) ENGINE=InnoDB;

CREATE TABLE request_images (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT UNSIGNED NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  kind ENUM('original', 'ai_generated') NOT NULL DEFAULT 'original',
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

CREATE TABLE ai_usage_log (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  feature ENUM('requirements', 'photo_analysis', 'garden_plan') NOT NULL,
  inquiry_id INT UNSIGNED NULL,
  request_image_id INT UNSIGNED NULL,
  model VARCHAR(100) NOT NULL,
  outcome ENUM('success', 'error', 'rate_limited') NOT NULL,
  error_code VARCHAR(50) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ai_usage_user (user_id, created_at)
) ENGINE=InnoDB;

