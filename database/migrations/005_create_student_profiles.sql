-- =============================================================================
-- Migration 005: Create the student placement profile table
--
-- For existing placement_portal databases that need student profile storage.
-- This migration does not modify users, jobs, or applications.
-- Back up an existing database before applying migrations.
-- =============================================================================

USE placement_portal;

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id             INT UNSIGNED PRIMARY KEY,
  phone               VARCHAR(25)  NULL,
  department          VARCHAR(100) NULL,
  degree_program      VARCHAR(120) NULL,
  graduation_year     SMALLINT UNSIGNED NULL,
  roll_number         VARCHAR(50)  NULL,
  cgpa                DECIMAL(4,2) NULL,
  backlog_count       SMALLINT UNSIGNED NULL,
  technical_interests TEXT         NULL,
  github_url          VARCHAR(255) NULL,
  linkedin_url        VARCHAR(255) NULL,
  portfolio_url       VARCHAR(255) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                      ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_student_profiles_department_year (department, graduation_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
