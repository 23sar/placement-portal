-- =============================================================================
-- Migration 006: Create student profile details tables
--
-- Adds four normalized child tables for student profile sections:
--   1. student_skills: skills and proficiency levels with duplicate prevention
--   2. student_projects: academic, personal, and open-source project showcases
--   3. student_internships: work and internship experiences
--   4. student_achievements: honors, certifications, and competitive achievements
--
-- References users(id) directly so child records can exist independently
-- of whether an extended student_profiles row has been created yet.
--
-- Usage:
--   mysql -u root -p placement_portal < database/migrations/006_student_profile_details.sql
-- =============================================================================

USE placement_portal;

-- 1. student_skills -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_skills (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  skill_name  VARCHAR(100) NOT NULL,
  proficiency ENUM('beginner', 'intermediate', 'advanced', 'expert') NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT uq_student_skill UNIQUE (user_id, skill_name),

  CONSTRAINT fk_student_skills_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_student_skills_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. student_projects ---------------------------------------------------------
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
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
               ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_student_projects_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_student_projects_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. student_internships ------------------------------------------------------
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
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                 ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_student_internships_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_student_internships_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. student_achievements -----------------------------------------------------
CREATE TABLE IF NOT EXISTS student_achievements (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  title          VARCHAR(150) NOT NULL,
  issuer         VARCHAR(150) NULL,
  description    TEXT NULL,
  achieved_on    DATE NULL,
  credential_url VARCHAR(255) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                 ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_student_achievements_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_student_achievements_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
