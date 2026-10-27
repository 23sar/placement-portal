-- Migration 010: Support multiple student resumes with labels and default selection
-- Removes single-resume uniqueness constraint safely, adds label and default flag,
-- and creates necessary indexes.
-- Usage: mysql -u root -p placement_portal < database/migrations/010_support_multiple_student_resumes.sql

USE placement_portal;

DELIMITER $$

DROP PROCEDURE IF EXISTS `migrate_010_multiple_resumes`$$
CREATE PROCEDURE `migrate_010_multiple_resumes`()
BEGIN
  -- Drop unique index uq_student_resumes_user if present
  IF EXISTS (
    SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'student_resumes'
       AND index_name = 'uq_student_resumes_user'
  ) THEN
    ALTER TABLE `student_resumes` DROP INDEX `uq_student_resumes_user`;
  END IF;

  -- Add label column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'student_resumes'
       AND column_name = 'label'
  ) THEN
    ALTER TABLE `student_resumes`
      ADD COLUMN `label` VARCHAR(100) NULL AFTER `user_id`;
  END IF;

  -- Add is_default column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'student_resumes'
       AND column_name = 'is_default'
  ) THEN
    ALTER TABLE `student_resumes`
      ADD COLUMN `is_default` BOOLEAN NOT NULL DEFAULT FALSE AFTER `sha256`;
    -- Existing resumes become the student's default resume
    UPDATE `student_resumes` SET `is_default` = TRUE;
  END IF;

  -- Add index on user_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'student_resumes'
       AND index_name = 'idx_student_resumes_user'
  ) THEN
    ALTER TABLE `student_resumes`
      ADD INDEX `idx_student_resumes_user` (`user_id`);
  END IF;

  -- Add index on (user_id, is_default) if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'student_resumes'
       AND index_name = 'idx_student_resumes_user_default'
  ) THEN
    ALTER TABLE `student_resumes`
      ADD INDEX `idx_student_resumes_user_default` (`user_id`, `is_default`);
  END IF;
END$$

DELIMITER ;

CALL `migrate_010_multiple_resumes`();
DROP PROCEDURE IF EXISTS `migrate_010_multiple_resumes`;
