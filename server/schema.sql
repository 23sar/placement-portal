-- ==========================================================
-- Campus Placement Portal — Database Schema
-- MySQL 8.0+
-- Run: mysql -u root -p < schema.sql
-- ==========================================================

CREATE DATABASE IF NOT EXISTS placement_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE placement_portal;

-- ----------------------------------------------------------
-- users
-- Stores students, companies. Admin role reserved for manual
-- creation only — not available through the public API.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150)  NOT NULL,
  email       VARCHAR(255)  NOT NULL UNIQUE,
  password    VARCHAR(255)  NOT NULL,           -- bcrypt hash
  role        ENUM('student', 'company', 'admin') NOT NULL DEFAULT 'student',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_users_email  (email),
  INDEX idx_users_role   (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- jobs
-- Each job belongs to one company (users.role = 'company').
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(255)  NOT NULL,
  description TEXT          NOT NULL,
  location    VARCHAR(255)  NOT NULL,
  stipend     DECIMAL(10,2) NULL,               -- NULL = unpaid / not specified
  company_id  INT UNSIGNED  NOT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_jobs_company
    FOREIGN KEY (company_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_jobs_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- applications
-- Each student may apply for each job at most once.
-- The UNIQUE constraint at DB level enforces this even if the
-- application-level duplicate check is bypassed.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id      INT UNSIGNED  NOT NULL,
  student_id  INT UNSIGNED  NOT NULL,
  status      ENUM('pending', 'shortlisted', 'rejected') NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Prevent duplicate applications for the same student/job
  UNIQUE KEY uq_application (job_id, student_id),

  CONSTRAINT fk_applications_job
    FOREIGN KEY (job_id) REFERENCES jobs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_applications_student
    FOREIGN KEY (student_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_applications_student (student_id),
  INDEX idx_applications_job     (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- Sample seed data (safe to re-run — uses INSERT IGNORE)
-- Passwords below are bcrypt hashes of "Test@1234"
-- DO NOT use these in production.
-- ----------------------------------------------------------

-- Sample company
INSERT IGNORE INTO users (id, name, email, password, role) VALUES
  (1, 'TechCorp Solutions', 'techcorp@example.com',
   '$2b$10$Q2xFv3vFV8eABMvZpEQ/yuP0KkY5wNdKvxWMXx0XqXWGgWqBmSTLG', 'company');

-- Sample students
INSERT IGNORE INTO users (id, name, email, password, role) VALUES
  (2, 'Alice Student', 'alice@example.com',
   '$2b$10$Q2xFv3vFV8eABMvZpEQ/yuP0KkY5wNdKvxWMXx0XqXWGgWqBmSTLG', 'student'),
  (3, 'Bob Student', 'bob@example.com',
   '$2b$10$Q2xFv3vFV8eABMvZpEQ/yuP0KkY5wNdKvxWMXx0XqXWGgWqBmSTLG', 'student');

-- Sample jobs (owned by TechCorp)
INSERT IGNORE INTO jobs (id, title, description, location, stipend, company_id) VALUES
  (1, 'Frontend Developer Intern', 'Build responsive UIs using React and Tailwind CSS.', 'Remote', 15000.00, 1),
  (2, 'Backend Engineer', 'Design and build REST APIs with Node.js and MySQL.', 'Bangalore', 20000.00, 1);

-- Sample applications
INSERT IGNORE INTO applications (job_id, student_id, status) VALUES
  (1, 2, 'pending'),
  (2, 2, 'shortlisted'),
  (1, 3, 'rejected');
