-- =============================================================================
-- Migration: 002_approval_review_audit.sql
-- Description: Adds review audit columns and rejection reason to jobs table:
--              - rejection_reason: explanation provided by Placement Cell upon rejection
--              - reviewed_by: administrator user who performed the review
--              - reviewed_at: timestamp of review decision
--
-- Safety:
--   - Safe forward-only migration.
--   - fk_jobs_reviewed_by uses ON DELETE SET NULL to preserve audit trail if admin account is removed.
--
-- Usage:
--   mysql -u <user> -p <database_name> < database/migrations/002_approval_review_audit.sql
-- =============================================================================

ALTER TABLE jobs
  ADD COLUMN rejection_reason TEXT NULL AFTER eligibility_criteria,
  ADD COLUMN reviewed_by INT UNSIGNED NULL AFTER rejection_reason,
  ADD COLUMN reviewed_at DATETIME NULL AFTER reviewed_by;

ALTER TABLE jobs
  ADD CONSTRAINT fk_jobs_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX idx_jobs_reviewed_by ON jobs (reviewed_by);
