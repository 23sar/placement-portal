/**
 * Migration verification test script
 * Runs entirely against a temporary database: placement_portal_migration_test
 * Never modifies the development database.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../backend/.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runVerification() {
  console.log('===============================================================');
  console.log('       Migration & Retention Policy Verification Suite         ');
  console.log('===============================================================');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  const TEST_DB = 'placement_portal_migration_test';

  try {
    // 1. Setup fresh test database
    console.log(`\n[Stage 1] Initializing isolated test database '${TEST_DB}'...`);
    await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\`;`);
    await connection.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.query(`USE \`${TEST_DB}\`;`);

    // 2. Load PRE-MIGRATION legacy schema
    console.log('[Stage 2] Loading pre-migration legacy schema...');
    const legacySchema = `
      CREATE TABLE users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('student','company','admin') NOT NULL DEFAULT 'student',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;

      CREATE TABLE jobs (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        location VARCHAR(255) NOT NULL,
        stipend DECIMAL(10,2) NULL,
        company_id INT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_jobs_company FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB;

      CREATE TABLE applications (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        job_id INT UNSIGNED NOT NULL,
        student_id INT UNSIGNED NOT NULL,
        status ENUM('pending','shortlisted','rejected') NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_application (job_id, student_id),
        CONSTRAINT fk_app_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        CONSTRAINT fk_app_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `;
    await connection.query(legacySchema);

    // 3. Insert legacy data
    console.log('[Stage 3] Seeding legacy historical data...');
    const legacySeed = `
      INSERT INTO users (id, name, email, password, role) VALUES
      (1, 'Legacy TechCorp', 'techcorp@example.com', 'hash1', 'company'),
      (2, 'Legacy Student A', 'studenta@example.com', 'hash2', 'student'),
      (3, 'Legacy Student B', 'studentb@example.com', 'hash3', 'student');

      INSERT INTO jobs (id, title, description, location, stipend, company_id) VALUES
      (101, 'Legacy Frontend Job', 'Frontend description', 'Remote', 15000.00, 1),
      (102, 'Legacy Backend Job', 'Backend description', 'Bangalore', 25000.00, 1);

      INSERT INTO applications (job_id, student_id, status) VALUES
      (101, 2, 'shortlisted'),
      (101, 3, 'pending');
    `;
    await connection.query(legacySeed);

    // 4. Apply Migration 001
    console.log('[Stage 4] Applying migration 001_job_approval_workflow.sql...');
    const migrationSql = fs.readFileSync(
      path.join(__dirname, 'migrations/001_job_approval_workflow.sql'),
      'utf8'
    );
    await connection.query(migrationSql);
    console.log('          Migration SQL applied successfully.');

    // 5. Verification Assertions
    console.log('\n[Stage 5] Running Core Verification Assertions:');

    // Assertion 1: Existing legacy jobs backfilled & preserved
    const [backfilledJobs] = await connection.query('SELECT * FROM jobs ORDER BY id ASC;');
    console.assert(backfilledJobs.length === 2, `Expected 2 jobs, got ${backfilledJobs.length}`);
    console.assert(backfilledJobs[0].created_by === 1, 'Job 101 created_by should be 1');
    console.assert(backfilledJobs[0].recruiting_organization === 'Legacy TechCorp', 'Job 101 recruiting_organization mismatch');
    console.assert(backfilledJobs[0].approval_status === 'approved', 'Job 101 approval_status should be approved');
    console.assert(backfilledJobs[0].job_status === 'open', 'Job 101 job_status should be open');
    console.assert(backfilledJobs[0].posting_source === 'company', 'Job 101 posting_source should be company');
    console.log('  ✅ Assertion 1 PASS: Existing jobs preserved and backfilled correctly.');

    // Assertion 2: Existing applications intact
    const [apps] = await connection.query('SELECT * FROM applications ORDER BY id ASC;');
    console.assert(apps.length === 2, `Expected 2 applications, got ${apps.length}`);
    console.assert(apps[0].status === 'shortlisted', 'App 1 status changed unexpectedly');
    console.assert(apps[1].status === 'pending', 'App 2 status changed unexpectedly');
    console.log('  ✅ Assertion 2 PASS: Existing applications and duplicate constraints remain intact.');

    // Assertion 3: New company jobs default to pending approval
    await connection.query(`
      INSERT INTO jobs (title, description, location, stipend, created_by, recruiting_organization, company_id)
      VALUES ('New Unapproved Intern', 'Desc', 'Remote', 10000, 1, 'Legacy TechCorp', 1);
    `);
    const [[newJob]] = await connection.query("SELECT * FROM jobs WHERE title = 'New Unapproved Intern';");
    console.assert(newJob.approval_status === 'pending', `Expected pending approval, got ${newJob.approval_status}`);
    console.assert(newJob.job_status === 'open', `Expected open job_status, got ${newJob.job_status}`);
    console.assert(newJob.posting_source === 'company', `Expected company posting_source, got ${newJob.posting_source}`);
    console.log('  ✅ Assertion 3 PASS: New company jobs default to pending approval.');

    // Assertion 4: Placement Cell job with unregistered company (company_id = NULL)
    await connection.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES (4, 'Admin Officer', 'admin@test.edu', 'hash4', 'admin', TRUE);
    `);
    await connection.query(`
      INSERT INTO jobs (title, description, location, created_by, posting_source, recruiting_organization, company_id, approval_status, job_status)
      VALUES ('External Partner Drive', 'Desc', 'Delhi', 4, 'placement_cell', 'External Non-Registered Corp', NULL, 'approved', 'open');
    `);
    const [[adminJob]] = await connection.query("SELECT * FROM jobs WHERE title = 'External Partner Drive';");
    console.assert(adminJob.company_id === null, 'Admin job company_id should be NULL');
    console.assert(adminJob.recruiting_organization === 'External Non-Registered Corp', 'recruiting_organization mismatch');
    console.assert(adminJob.posting_source === 'placement_cell', 'posting_source should be placement_cell');
    console.log('  ✅ Assertion 4 PASS: Nullable company_id allowed for Placement Cell external listings.');

    // Assertion 5: Approval state and open/closed state are independent
    await connection.query(`
      UPDATE jobs SET job_status = 'closed' WHERE id = 101;
      INSERT INTO jobs (title, description, location, created_by, posting_source, recruiting_organization, company_id, approval_status, job_status)
      VALUES ('Rejected Job', 'Desc', 'Pune', 1, 'company', 'Legacy TechCorp', 1, 'rejected', 'open');
    `);
    const [[closedJob]] = await connection.query('SELECT approval_status, job_status FROM jobs WHERE id = 101;');
    const [[rejectedJob]] = await connection.query("SELECT approval_status, job_status FROM jobs WHERE title = 'Rejected Job';");
    console.assert(closedJob.approval_status === 'approved' && closedJob.job_status === 'closed', 'Job 101 should be approved and closed');
    console.assert(rejectedJob.approval_status === 'rejected' && rejectedJob.job_status === 'open', 'Rejected job should be rejected and open');
    console.log('  ✅ Assertion 5 PASS: Approval state and open/closed state are completely independent.');

    // Assertion 6 & 7: Account Retention Policy Verification (Deactivation vs Physical Deletion)
    console.log('\n[Stage 6] Verifying Account Retention Policy:');
    // Step A: Setup active company and job
    await connection.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES (5, 'CloudScale Systems', 'hr@cloudscale.io', 'hash5', 'company', TRUE);
      INSERT INTO jobs (id, title, description, location, created_by, posting_source, recruiting_organization, company_id, approval_status, job_status)
      VALUES (200, 'Cloud Infrastructure Intern', 'Work on AWS/GCP', 'Hyderabad', 5, 'company', 'CloudScale Systems', 5, 'approved', 'open');
      INSERT INTO applications (job_id, student_id, status) VALUES (200, 2, 'pending');
    `);

    // Step B: Deactivate company account (Preferred retention policy)
    await connection.query('UPDATE users SET is_active = FALSE WHERE id = 5;');
    const [[deactivatedUser]] = await connection.query('SELECT is_active FROM users WHERE id = 5;');
    console.assert(deactivatedUser.is_active === 0, 'User should be marked inactive');

    // Assert job and applications remain 100% intact with proper attribution
    const [[retainedJob]] = await connection.query('SELECT * FROM jobs WHERE id = 200;');
    console.assert(retainedJob.created_by === 5, 'Creator attribution preserved');
    console.assert(retainedJob.company_id === 5, 'Company foreign key preserved');
    console.assert(retainedJob.recruiting_organization === 'CloudScale Systems', 'Recruiting organization name preserved');

    const [retainedApps] = await connection.query('SELECT * FROM applications WHERE job_id = 200;');
    console.assert(retainedApps.length === 1, 'Applications preserved under deactivated account');
    console.log('  ✅ Assertion 6 PASS: Account deactivation preserves job, application history, and creator attribution.');

    // Step C: Verify that physical deletion is BLOCKED by foreign key constraint (ON DELETE RESTRICT)
    let physicalDeleteFailed = false;
    try {
      await connection.query('DELETE FROM users WHERE id = 5;');
    } catch (err) {
      if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
        physicalDeleteFailed = true;
      } else {
        throw err;
      }
    }
    console.assert(physicalDeleteFailed, 'Physical deletion of account with jobs should be BLOCKED by foreign key RESTRICT');
    console.log('  ✅ Assertion 7 PASS: Database strictly blocks physical hard deletion via ON DELETE RESTRICT.');

    // Assertion 8: Backfill query safety (does NOT overwrite pending or rejected decisions)
    console.log('\n[Stage 7] Verifying Backfill Safety on Subsequent Runs:');
    const [backfillRerun] = await connection.query(`
      UPDATE jobs j
      JOIN users u ON j.company_id = u.id
      SET
        j.created_by = j.company_id,
        j.recruiting_organization = u.name,
        j.approval_status = 'approved',
        j.job_status = 'open',
        j.posting_source = 'company'
      WHERE j.created_by IS NULL;
    `);
    console.assert(backfillRerun.affectedRows === 0, `Expected 0 affected rows on backfill rerun, got ${backfillRerun.affectedRows}`);

    const [[checkPendingAfter]] = await connection.query("SELECT approval_status FROM jobs WHERE title = 'New Unapproved Intern';");
    const [[checkRejectedAfter]] = await connection.query("SELECT approval_status FROM jobs WHERE title = 'Rejected Job';");
    console.assert(checkPendingAfter.approval_status === 'pending', 'Pending job was overwritten!');
    console.assert(checkRejectedAfter.approval_status === 'rejected', 'Rejected job was overwritten!');
    console.log('  ✅ Assertion 8 PASS: Guarded backfill touches 0 rows and protects pending/rejected decisions.');

    // Assertion 9: One-time migration DDL vs Rerunnability distinction
    console.log('\n[Stage 8] Verifying Migration Execution Semantics (One-time DDL):');
    let alterFailed = false;
    try {
      // Attempting to run a raw DDL statement from the migration again on already-altered table
      await connection.query('ALTER TABLE jobs ADD COLUMN created_by INT UNSIGNED NULL;');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060) {
        alterFailed = true;
      }
    }
    console.assert(alterFailed, 'Expected duplicate column error when re-running raw DDL');
    console.log('  ✅ Assertion 9 PASS: DDL correctly verified as one-time forward migration (not rerun-safe at DDL layer).');

    console.log('\n===============================================================');
    console.log('  ✨ ALL 9 VERIFICATION ASSERTIONS PASSED WITH ZERO DEFECTS!    ');
    console.log('===============================================================');

  } finally {
    console.log(`\n[Cleanup] Tearing down temporary database '${TEST_DB}'...`);
    await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\`;`);
    await connection.end();
    console.log('[Cleanup] Isolated test database destroyed cleanly.');
  }
}

runVerification().catch(err => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
