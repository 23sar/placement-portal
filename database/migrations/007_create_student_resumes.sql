-- Migration 007: Private PDF resume metadata for student self-service.
-- Resume binaries are stored in a private backend storage directory, never in
-- the public frontend directory or in a client-accessible static path.
-- Usage: mysql -u root -p placement_portal < database/migrations/007_create_student_resumes.sql

USE placement_portal;

CREATE TABLE IF NOT EXISTS student_resumes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_key   VARCHAR(64) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  file_size     INT UNSIGNED NOT NULL,
  sha256        CHAR(64) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT uq_student_resumes_user UNIQUE (user_id),
  CONSTRAINT fk_student_resumes_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_student_resumes_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
