-- =============================================================
-- schema.sql — table definitions ONLY (no data)
-- Run:  mysql -u root -p < database/schema.sql
-- =============================================================

CREATE DATABASE IF NOT EXISTS placement_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE placement_portal;

-- users --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150)    NOT NULL,
  email      VARCHAR(255)    NOT NULL UNIQUE,
  password   VARCHAR(255)    NOT NULL,           -- bcrypt hash
  role       ENUM('student','company','admin')
             NOT NULL DEFAULT 'student',
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
             ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_users_email (email),
  INDEX idx_users_role  (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- jobs ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id          INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(255)   NOT NULL,
  description TEXT           NOT NULL,
  location    VARCHAR(255)   NOT NULL,
  stipend     DECIMAL(10,2)  NULL,
  company_id  INT UNSIGNED   NOT NULL,
  created_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_jobs_company
    FOREIGN KEY (company_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_jobs_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- applications -------------------------------------------------
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
    FOREIGN KEY (job_id)     REFERENCES jobs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_app_student
    FOREIGN KEY (student_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_app_student (student_id),
  INDEX idx_app_job     (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
