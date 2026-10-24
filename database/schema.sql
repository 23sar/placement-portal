-- =============================================================================
-- schema.sql — Table definitions for clean / fresh installations
--
-- Account Retention Policy:
--   - Historical placement data and job postings must be preserved permanently.
--   - User accounts (companies, students, admins) linked to jobs or applications
--     cannot be physically hard-deleted. The database enforces this via
--     ON DELETE RESTRICT foreign key constraints on created_by and company_id.
--   - Instead of physical deletion, accounts are deactivated (is_active = FALSE).
--   - company_id is NULLABLE solely to allow Placement Cell administrators to post
--     jobs for external organizations that do not have registered portal accounts.
--
-- Run:  mysql -u root -p < database/schema.sql
-- =============================================================================

CREATE DATABASE IF NOT EXISTS placement_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE placement_portal;

-- users -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150)    NOT NULL,
  email      VARCHAR(255)    NOT NULL UNIQUE,
  password   VARCHAR(255)    NOT NULL,           -- bcrypt hash
  role       ENUM('student','company','admin')
             NOT NULL DEFAULT 'student',
  is_active  BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
             ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_users_email  (email),
  INDEX idx_users_role   (role),
  INDEX idx_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- jobs ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id                      INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  title                   VARCHAR(255)   NOT NULL,
  description             TEXT           NOT NULL,
  location                VARCHAR(255)   NOT NULL,
  stipend                 DECIMAL(10,2)  NULL,
  created_by              INT UNSIGNED   NOT NULL,
  posting_source          ENUM('company', 'placement_cell')
                          NOT NULL DEFAULT 'company',
  recruiting_organization VARCHAR(255)   NOT NULL,
  company_id              INT UNSIGNED   NULL,
  approval_status         ENUM('pending', 'approved', 'rejected')
                          NOT NULL DEFAULT 'pending',
  job_status              ENUM('open', 'closed')
                          NOT NULL DEFAULT 'open',
  application_deadline    DATETIME       NULL,
  eligibility_criteria    TEXT           NULL,
  rejection_reason        TEXT           NULL,
  reviewed_by             INT UNSIGNED   NULL,
  reviewed_at             DATETIME       NULL,
  created_at              TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
                          ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign keys: RESTRICT prevents hard-deleting users associated with active jobs
  CONSTRAINT fk_jobs_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_jobs_company
    FOREIGN KEY (company_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_jobs_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  INDEX idx_jobs_created_by      (created_by),
  INDEX idx_jobs_company         (company_id),
  INDEX idx_jobs_reviewed_by     (reviewed_by),
  INDEX idx_jobs_approval_status (approval_status),
  INDEX idx_jobs_job_status      (job_status),
  INDEX idx_jobs_listing         (approval_status, job_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- applications ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
  id          INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  job_id      INT UNSIGNED   NOT NULL,
  student_id  INT UNSIGNED   NOT NULL,
  status      ENUM('pending','shortlisted','rejected')
              NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP,

  -- Prevent duplicate applications at the database level
  UNIQUE KEY uq_application (job_id, student_id),

  CONSTRAINT fk_app_job
    FOREIGN KEY (job_id) REFERENCES jobs(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_app_student
    FOREIGN KEY (student_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  INDEX idx_app_student (student_id),
  INDEX idx_app_job     (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
