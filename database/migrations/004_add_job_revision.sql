-- =============================================================================
-- Migration 004: Add revision tracking for concurrency-safe job approvals
--
-- Adds a revision column to `jobs` to track substantive edits and protect
-- against race conditions where an administrator inadvertently approves
-- a stale revision of a job posting.
--
-- Usage:
--   mysql -u root -p placement_portal < database/migrations/004_add_job_revision.sql
-- =============================================================================

USE placement_portal;

ALTER TABLE `jobs`
  ADD COLUMN `revision` INT UNSIGNED NOT NULL DEFAULT 1
  AFTER `eligibility_criteria`;
