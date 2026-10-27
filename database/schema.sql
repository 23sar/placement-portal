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

-- student_profiles ------------------------------------------------------------
-- One private placement profile per student. Account identity (name/email/role)
-- remains managed by the users table and cannot be changed through this API.
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
  revision                INT UNSIGNED   NOT NULL DEFAULT 1,
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


-- student_skills --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_skills (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  skill_name  VARCHAR(100) NOT NULL,
  proficiency ENUM('beginner', 'intermediate', 'advanced', 'expert') NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_student_skill UNIQUE (user_id, skill_name),
  CONSTRAINT fk_student_skills_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_student_skills_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- student_projects ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_projects (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  title        VARCHAR(150) NOT NULL,
  description  TEXT NOT NULL,
  technologies VARCHAR(255) NULL,
  project_url  VARCHAR(255) NULL,
  start_date   DATE NULL,
  end_date     DATE NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_student_projects_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- student_internships ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_internships (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  organization   VARCHAR(150) NOT NULL,
  role           VARCHAR(100) NOT NULL,
  description    TEXT NULL,
  start_date     DATE NULL,
  end_date       DATE NULL,
  experience_url VARCHAR(255) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_internships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_student_internships_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- student_achievements --------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_achievements (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  title          VARCHAR(150) NOT NULL,
  issuer         VARCHAR(150) NULL,
  description    TEXT NULL,
  achieved_on    DATE NULL,
  credential_url VARCHAR(255) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_achievements_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_student_achievements_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- student_resumes -------------------------------------------------------------
-- Metadata only: PDF bytes live in private backend storage, never in frontend.
CREATE TABLE IF NOT EXISTS student_resumes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  label         VARCHAR(100) NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_key   VARCHAR(64) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  file_size     INT UNSIGNED NOT NULL,
  sha256        CHAR(64) NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_resumes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_student_resumes_user (user_id),
  INDEX idx_student_resumes_user_default (user_id, is_default),
  INDEX idx_student_resumes_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- application_resumes ---------------------------------------------------------
-- Immutable application-specific resume snapshot.
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

  CONSTRAINT uq_app_resumes_application UNIQUE (application_id),
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

-- announcements ---------------------------------------------------------------
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

-- announcement_reads ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcement_reads (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  announcement_id INT UNSIGNED NOT NULL,
  read_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_announcement_user_read UNIQUE (user_id, announcement_id),
  CONSTRAINT fk_announcement_reads_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_announcement_reads_announcement
    FOREIGN KEY (announcement_id) REFERENCES announcements(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_announcement_reads_user (user_id),
  INDEX idx_announcement_reads_announcement (announcement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
