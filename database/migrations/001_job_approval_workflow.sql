-- =============================================================================
-- Migration: 001_job_approval_workflow.sql
-- Description: Extends users and jobs tables for Placement Cell job approval workflow.
--              Introduces account retention policy (is_active + ON DELETE RESTRICT).
--              Separates job creator (created_by) from recruiting organization.
--              Permits nullable company_id for external Placement Cell postings.
--              Adds approval_status, job_status, application_deadline, and eligibility_criteria.
--
-- Migration Execution Model:
--   - Type: One-time, forward-only DDL structural migration.
--   - NOTE: This file is a one-time migration script. It is NOT fully rerunnable
--     at the DDL layer because MySQL ALTER TABLE statements error if executed against
--     already-altered tables.
--   - The data backfill step (Step 5) IS idempotent: it guards against re-execution
--     using `WHERE j.created_by IS NULL`, ensuring subsequent sync runs or application
--     operations will never overwrite or auto-approve newer pending/rejected jobs.
--
-- Account Retention Policy:
--   - Placement records and applicant histories are permanent academic assets.
--   - Users (companies/students) associated with jobs or applications cannot be hard-deleted.
--   - fk_jobs_created_by and fk_jobs_company enforce ON DELETE RESTRICT.
--   - Account deactivation is achieved via is_active = FALSE.
--
-- Usage:
--   mysql -u <user> -p <database_name> < database/migrations/001_job_approval_workflow.sql
-- =============================================================================

-- 1. Add is_active flag to users table for soft deactivation
ALTER TABLE users
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER role,
  ADD INDEX idx_users_active (is_active);

-- 2. Add approval, lifecycle, and snapshot columns to jobs table
ALTER TABLE jobs
  ADD COLUMN created_by INT UNSIGNED NULL AFTER stipend,
  ADD COLUMN posting_source ENUM('company', 'placement_cell') NOT NULL DEFAULT 'company' AFTER created_by,
  ADD COLUMN recruiting_organization VARCHAR(255) NULL AFTER posting_source,
  ADD COLUMN approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending' AFTER recruiting_organization,
  ADD COLUMN job_status ENUM('open', 'closed') NOT NULL DEFAULT 'open' AFTER approval_status,
  ADD COLUMN application_deadline DATETIME NULL AFTER job_status,
  ADD COLUMN eligibility_criteria TEXT NULL AFTER application_deadline;

-- 3. Drop existing fk_jobs_company to modify nullability
ALTER TABLE jobs DROP FOREIGN KEY fk_jobs_company;

-- 4. Modify company_id to allow NULL (strictly for Placement Cell external drives)
ALTER TABLE jobs MODIFY COLUMN company_id INT UNSIGNED NULL;

-- 5. One-time data backfill for existing historical jobs:
--    - Sets created_by = company_id
--    - Populates recruiting_organization snapshot from associated company's name
--    - Grandfathers existing live jobs as 'approved' and 'open'
--    - Guarded with `WHERE created_by IS NULL` to prevent overwriting newer pending/rejected decisions
UPDATE jobs j
JOIN users u ON j.company_id = u.id
SET
  j.created_by = j.company_id,
  j.recruiting_organization = u.name,
  j.approval_status = 'approved',
  j.job_status = 'open',
  j.posting_source = 'company'
WHERE j.created_by IS NULL;

-- 6. Enforce NOT NULL on created_by and recruiting_organization now that backfill is complete
ALTER TABLE jobs
  MODIFY COLUMN created_by INT UNSIGNED NOT NULL,
  MODIFY COLUMN recruiting_organization VARCHAR(255) NOT NULL;

-- 7. Add foreign key for created_by with ON DELETE RESTRICT
--    (Prevents hard deletion of accounts that authored job postings)
ALTER TABLE jobs
  ADD CONSTRAINT fk_jobs_created_by
    FOREIGN KEY (created_by) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. Re-add company foreign key with ON DELETE RESTRICT
--    (Enforces consistent retention policy: company accounts linked to jobs cannot be hard-deleted)
ALTER TABLE jobs
  ADD CONSTRAINT fk_jobs_company
    FOREIGN KEY (company_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 9. Add performance and query indexes
CREATE INDEX idx_jobs_created_by      ON jobs (created_by);
CREATE INDEX idx_jobs_approval_status ON jobs (approval_status);
CREATE INDEX idx_jobs_job_status      ON jobs (job_status);
CREATE INDEX idx_jobs_listing         ON jobs (approval_status, job_status);
