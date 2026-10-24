-- =============================================================================
-- seed_admin_dev.sql — Development & QA Bootstrap for Administrator Account
--
-- ⚠️ CAUTION — FOR LOCAL DEVELOPMENT AND TESTING ONLY
-- DO NOT RUN THIS SCRIPT IN STAGING OR PRODUCTION ENVIRONMENTS.
--
-- In production, administrator accounts must be provisioned via a secure,
-- out-of-band administrative script with unique, randomly generated credentials.
--
-- Local Dev Credentials:
--   Email:    admin@placement.edu
--   Password: Admin#Dev2026!
--   Role:     admin
-- =============================================================================

USE placement_portal;

-- 1. Create or update dev administrator account
INSERT INTO users (id, name, email, password, role, is_active)
VALUES (
  4,
  'Placement Cell Administrator',
  'admin@placement.edu',
  '$2b$10$sCZXQEmky3o9Sq3b22l2WeC1Zjui4N4XJaPHHwWwssko30RTgnhoa',
  'admin',
  TRUE
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  role = 'admin',
  is_active = TRUE;

-- 2. Optional demo job posted directly by the Placement Cell
--    on behalf of an external partner without a registered company user account.
INSERT IGNORE INTO jobs (
  id,
  title,
  description,
  location,
  stipend,
  created_by,
  posting_source,
  recruiting_organization,
  company_id,
  approval_status,
  job_status,
  application_deadline,
  eligibility_criteria
) VALUES (
  3,
  'Machine Learning Trainee',
  'Direct campus drive opportunity organized by Placement Cell with external industry partner.',
  'Hyderabad / Hybrid',
  35000.00,
  4,
  'placement_cell',
  'Global AI Labs',
  NULL, -- Nullable because company has no registered login account
  'approved', -- Admin-created jobs can be approved directly
  'open',
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 45 DAY),
  'Open to final-year students with Python and Linear Algebra fundamentals.'
);
