-- Migration 011: Application resume snapshots
-- Records an immutable snapshot of the specific PDF resume submitted by a student
-- for each job application, preserving the exact document even if the original
-- profile resume is edited or removed.
-- Usage: mysql -u root -p placement_portal < database/migrations/011_create_application_resumes.sql

USE placement_portal;

CREATE TABLE IF NOT EXISTS application_resumes (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id     INT UNSIGNED NOT NULL,
  student_id         INT UNSIGNED NOT NULL,
  original_resume_id INT UNSIGNED NULL,
  original_name      VARCHAR(255) NOT NULL,
  storage_key        VARCHAR(64) NOT NULL,
  mime_type          VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  file_size          INT UNSIGNED NOT NULL,
  sha256             CHAR(64) NOT NULL,
  submitted_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_app_resumes_application
    UNIQUE (application_id),

  CONSTRAINT fk_app_resumes_application
    FOREIGN KEY (application_id) REFERENCES applications(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_app_resumes_student
    FOREIGN KEY (student_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_app_resumes_orig_resume
    FOREIGN KEY (original_resume_id) REFERENCES student_resumes(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  INDEX idx_app_resumes_student (student_id),
  INDEX idx_app_resumes_submitted (submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
