-- =============================================================
-- seed.sql — sample data only
-- Run AFTER schema.sql:  mysql -u root -p < database/seed.sql
--
-- All passwords below are bcrypt hashes of:  Test@1234
-- DO NOT use these accounts in production.
-- =============================================================

USE placement_portal;

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
(1, 'Frontend Developer Intern',
 'Build responsive UIs using HTML, CSS, JavaScript and Tailwind.',
 'Remote', 15000.00, 1),
(2, 'Backend Engineer',
 'Design and build REST APIs with Node.js and MySQL.',
 'Bangalore', 20000.00, 1);

-- Sample applications
INSERT IGNORE INTO applications (job_id, student_id, status) VALUES
(1, 2, 'pending'),
(2, 2, 'shortlisted'),
(1, 3, 'rejected');
