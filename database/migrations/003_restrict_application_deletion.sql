-- =============================================================================
-- Migration: 003_restrict_application_deletion.sql
-- Description: Migrates fk_app_job from ON DELETE CASCADE to ON DELETE RESTRICT
--              to ensure that jobs with existing student applications cannot be
--              hard-deleted, preventing accidental loss of student application history.
--
-- Safety:
--   - Safe forward-only migration.
--   - Preserves all existing applications and student data.
--   - Compatible with database/schema.sql definition.
--
-- Usage:
--   mysql -u <user> -p <database_name> < database/migrations/003_restrict_application_deletion.sql
-- =============================================================================

ALTER TABLE applications
  DROP FOREIGN KEY fk_app_job;

ALTER TABLE applications
  ADD CONSTRAINT fk_app_job
    FOREIGN KEY (job_id) REFERENCES jobs(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
