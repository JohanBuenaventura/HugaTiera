CREATE DATABASE IF NOT EXISTS hugatiera_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hugatiera_db;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('client', 'gardener', 'clerk', 'administrator') NOT NULL,
  can_act_as_client BOOLEAN NOT NULL DEFAULT FALSE,
  can_act_as_gardener BOOLEAN NOT NULL DEFAULT FALSE,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(30) NULL,
  date_of_birth DATE NULL,
  avatar_path VARCHAR(255) NULL,
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
  working_days VARCHAR(64) NOT NULL DEFAULT 'mon,tue,wed,thu,fri,sat,sun',
  work_start_time TIME NOT NULL DEFAULT '08:00:00',
  work_end_time TIME NOT NULL DEFAULT '17:00:00',
  max_concurrent_jobs TINYINT UNSIGNED NOT NULL DEFAULT 1,
  crew_size TINYINT UNSIGNED NOT NULL DEFAULT 1,
  availability_notes VARCHAR(255) NULL,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_gardener_profiles_approved_area (is_approved, service_area)
) ENGINE=InnoDB;

CREATE TABLE gardener_unavailable_dates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gardener_id INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_unavailable_dates_range CHECK (end_date >= start_date),
  INDEX idx_gardener_unavailable_range (gardener_id, start_date, end_date)
) ENGINE=InnoDB;

CREATE TABLE clerk_gardener_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  clerk_id INT UNSIGNED NOT NULL,
  gardener_id INT UNSIGNED NOT NULL,
  assigned_by INT UNSIGNED NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cga_clerk FOREIGN KEY (clerk_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cga_gardener FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cga_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_clerk_gardener (clerk_id, gardener_id),
  INDEX idx_cga_gardener (gardener_id)
) ENGINE=InnoDB;

CREATE TABLE service_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NULL,
  rate_per_sqm_min DECIMAL(10, 2) NOT NULL DEFAULT 60.00,
  rate_per_sqm_max DECIMAL(10, 2) NOT NULL DEFAULT 120.00,
  min_base_fee DECIMAL(10, 2) NOT NULL DEFAULT 450.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE pricing_addons (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  item_type ENUM('plant', 'material', 'equipment', 'disposal') NOT NULL DEFAULT 'material',
  unit VARCHAR(40) NOT NULL DEFAULT 'per item',
  unit_price_min DECIMAL(10, 2) NOT NULL,
  unit_price_max DECIMAL(10, 2) NOT NULL,
  description VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_pricing_addons_range CHECK (unit_price_max >= unit_price_min),
  INDEX idx_pricing_addons_active_type (is_active, item_type)
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
  workers_required TINYINT UNSIGNED NOT NULL DEFAULT 1,
  image_path VARCHAR(255) NULL,
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
  area_sqm DECIMAL(8, 2) NULL,
  work_complexity ENUM('light', 'moderate', 'heavy') NULL,
  materials_option ENUM('client_provides', 'gardener_provides') NULL,
  site_visit_requested BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_labor_min DECIMAL(10, 2) NULL,
  estimated_labor_max DECIMAL(10, 2) NULL,
  estimated_materials_min DECIMAL(10, 2) NULL,
  estimated_materials_max DECIMAL(10, 2) NULL,
  estimated_min_amount DECIMAL(10, 2) NULL,
  estimated_max_amount DECIMAL(10, 2) NULL,
  price_comment TEXT NULL,
  category_specs JSON NULL,
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

CREATE TABLE inquiry_estimate_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT UNSIGNED NOT NULL,
  addon_id INT UNSIGNED NULL,
  item_name VARCHAR(120) NOT NULL,
  item_type ENUM('plant', 'material', 'equipment', 'disposal') NOT NULL DEFAULT 'material',
  unit VARCHAR(40) NOT NULL,
  quantity DECIMAL(8, 2) NOT NULL,
  unit_price_min DECIMAL(10, 2) NOT NULL,
  unit_price_max DECIMAL(10, 2) NOT NULL,
  subtotal_min DECIMAL(10, 2) NOT NULL,
  subtotal_max DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (addon_id) REFERENCES pricing_addons(id) ON DELETE SET NULL,
  INDEX idx_inquiry_estimate_items_inquiry (inquiry_id)
) ENGINE=InnoDB;

CREATE TABLE quotations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inquiry_id INT UNSIGNED NOT NULL,
  gardener_id INT UNSIGNED NOT NULL,
  amount DECIMAL(10, 2) NULL,
  labor_amount DECIMAL(10, 2) NULL,
  materials_amount DECIMAL(10, 2) NULL,
  materials_breakdown TEXT NULL,
  details TEXT NOT NULL,
  availability_start DATE NULL,
  availability_end DATE NULL,
  estimated_working_days DECIMAL(4, 1) NULL,
  estimated_hours DECIMAL(5, 1) NULL,
  status ENUM('draft', 'sent', 'accepted', 'declined', 'expired', 'withdrawn') NOT NULL DEFAULT 'draft',
  valid_until DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  response_type ENUM('interest', 'offer', 'feasible', 'modifications', 'cannot_do') NOT NULL DEFAULT 'offer',
  proposed_changes TEXT NULL,
  requires_site_visit BOOLEAN NOT NULL DEFAULT FALSE,
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
  labor_amount DECIMAL(10, 2) NULL,
  materials_amount DECIMAL(10, 2) NULL,
  materials_breakdown TEXT NULL,
  details TEXT NOT NULL,
  proposed_changes TEXT NULL,
  requires_site_visit BOOLEAN NOT NULL DEFAULT FALSE,
  availability_start DATE NULL,
  availability_end DATE NULL,
  estimated_working_days DECIMAL(4, 1) NULL,
  estimated_hours DECIMAL(5, 1) NULL,
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
  required_deposit_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  price_basis VARCHAR(100) NULL,
  scheduled_start DATETIME NOT NULL,
  scheduled_end DATETIME NOT NULL,
  estimated_working_days DECIMAL(4, 1) NULL,
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
  booking_stage ENUM('reserved', 'booked') NOT NULL DEFAULT 'reserved',
  payment_status ENUM('unpaid', 'pending_verification', 'partially_paid', 'fully_paid') NOT NULL DEFAULT 'unpaid',
  required_deposit_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  paid_at TIMESTAMP NULL,
  transaction_status ENUM('open', 'pending_closure', 'closed') NOT NULL DEFAULT 'open',
  client_completion_confirmed_at TIMESTAMP NULL,
  gardener_completion_confirmed_at TIMESTAMP NULL,
  transaction_closed_at TIMESTAMP NULL,
  completion_agreement_notes TEXT NULL,
  cancellation_reason_type ENUM('typhoon_weather', 'accident_emergency', 'schedule_conflict', 'scope_or_plan_change', 'property_access_issue', 'other') NULL,
  cancellation_reason VARCHAR(1000) NULL,
  cancelled_by INT UNSIGNED NULL,
  cancelled_at TIMESTAMP NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  agreement_id INT UNSIGNED NULL,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE SET NULL,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (gardener_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  CONSTRAINT fk_bookings_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_bookings_agreement FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_booking_agreement (agreement_id),
  INDEX idx_bookings_client_status (client_id, status, requested_at),
  INDEX idx_bookings_gardener_status (gardener_id, status, requested_at),
  INDEX idx_bookings_schedule (gardener_id, scheduled_start, scheduled_end)
) ENGINE=InnoDB;

CREATE TABLE booking_reschedule_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id INT UNSIGNED NOT NULL,
  requested_by INT UNSIGNED NOT NULL,
  reason_type ENUM('typhoon_weather', 'accident_emergency', 'schedule_conflict', 'scope_or_plan_change', 'property_access_issue', 'other') NOT NULL,
  reason_details VARCHAR(1000) NOT NULL,
  previous_start DATETIME NOT NULL,
  previous_end DATETIME NOT NULL,
  proposed_start DATETIME NOT NULL,
  proposed_end DATETIME NOT NULL,
  status ENUM('pending', 'approved', 'declined', 'cancelled') NOT NULL DEFAULT 'pending',
  responded_by INT UNSIGNED NULL,
  responded_at TIMESTAMP NULL,
  response_note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reschedule_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_reschedule_requester FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reschedule_responder FOREIGN KEY (responded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_reschedule_proposed_schedule CHECK (proposed_end > proposed_start),
  INDEX idx_reschedule_booking_status (booking_id, status, created_at)
) ENGINE=InnoDB;

CREATE TABLE booking_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transaction_code VARCHAR(40) NULL UNIQUE,
  booking_id INT UNSIGNED NOT NULL,
  submitted_by INT UNSIGNED NOT NULL,
  payment_type ENUM('partial', 'full', 'balance') NOT NULL DEFAULT 'partial',
  payment_method ENUM('gcash', 'maya', 'grab_pay', 'card', 'bank_transfer', 'cash', 'other') NOT NULL DEFAULT 'gcash',
  gateway_provider ENUM('manual', 'paymongo', 'sandbox_demo') NOT NULL DEFAULT 'manual',
  gateway_session_id VARCHAR(120) NULL,
  gateway_checkout_url VARCHAR(500) NULL,
  gateway_status ENUM('none', 'awaiting_payment', 'paid', 'failed', 'cancelled') NOT NULL DEFAULT 'none',
  gateway_paid_at TIMESTAMP NULL,
  amount DECIMAL(10, 2) NOT NULL,
  reference_number VARCHAR(100) NULL,
  receipt_path VARCHAR(255) NULL,
  notes VARCHAR(500) NULL,
  status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  verified_by INT UNSIGNED NULL,
  verified_at TIMESTAMP NULL,
  rejection_reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_booking_payments_booking (booking_id, status, created_at),
  INDEX idx_booking_payments_gateway_session (gateway_session_id)
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

