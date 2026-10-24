-- =============================================================
-- seed.sql — Sample data only
-- Run AFTER schema.sql:  mysql -u root -p < database/seed.sql
--
-- All passwords below are bcrypt hashes of:  Test@1234
-- DO NOT use these accounts in production.
-- =============================================================

USE placement_portal;

-- Sample company
INSERT IGNORE INTO users (id, name, email, password, role, is_active) VALUES
(1, 'TechCorp Solutions', 'techcorp@example.com',
 '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'company', TRUE);

-- Sample students
INSERT IGNORE INTO users (id, name, email, password, role, is_active) VALUES
(2, 'Alice Student', 'alice@example.com',
 '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'student', TRUE),
(3, 'Bob Student', 'bob@example.com',
 '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'student', TRUE);

-- Sample jobs
-- Demonstrates representative states:
-- Job 1: Company-created, Approved, Open
-- Job 2: Company-created, Pending review, Open
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
) VALUES
(
  1,
  'Frontend Developer Intern',
  'Build responsive UIs using HTML, CSS, JavaScript and Tailwind.',
  'Remote',
  15000.00,
  1,
  'company',
  'TechCorp Solutions',
  1,
  'approved',
  'open',
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY),
  'B.Tech / BE in CS/IT or MCA. Minimum 7.0 CGPA. Familiarity with modern frontend development.'
),
(
  2,
  'Backend Engineer',
  'Design and build REST APIs with Node.js and MySQL.',
  'Bangalore',
  20000.00,
  1,
  'company',
  'TechCorp Solutions',
  1,
  'pending',
  'open',
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 21 DAY),
  'B.Tech / BE in CS/IT. Strong grasp of asynchronous JavaScript, SQL queries and relational design.'
);

-- Sample applications
INSERT IGNORE INTO applications (job_id, student_id, status) VALUES
(1, 2, 'pending'),
(1, 3, 'rejected');
