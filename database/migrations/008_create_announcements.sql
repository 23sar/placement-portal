-- Migration 008: Announcements table with approval workflow
-- Supports Placement Cell direct announcements and company announcements requiring review.
-- Usage: mysql -u root -p placement_portal < database/migrations/008_create_announcements.sql

USE placement_portal;

CREATE TABLE IF NOT EXISTS announcements (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title            VARCHAR(255) NOT NULL,
  content          TEXT NOT NULL,
  category         VARCHAR(100) NULL,
  created_by       INT UNSIGNED NOT NULL,
  posting_source   ENUM('company', 'placement_cell') NOT NULL DEFAULT 'company',
  company_id       INT UNSIGNED NULL,
  approval_status  ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  revision         INT UNSIGNED NOT NULL DEFAULT 1,
  rejection_reason TEXT NULL,
  reviewed_by      INT UNSIGNED NULL,
  reviewed_at      DATETIME NULL,
  published_at     DATETIME NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_announcements_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_announcements_company
    FOREIGN KEY (company_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_announcements_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  INDEX idx_announcements_created_by (created_by),
  INDEX idx_announcements_company (company_id),
  INDEX idx_announcements_reviewed_by (reviewed_by),
  INDEX idx_announcements_approval_status (approval_status),
  INDEX idx_announcements_listing (approval_status, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
