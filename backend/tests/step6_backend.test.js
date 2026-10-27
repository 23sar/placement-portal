/**
 * Step 6 Automated Backend Test Suite
 * Job Editing, Rejection Resubmission & Application History Protection
 *
 * Runs against isolated temporary database: placement_portal_test_step6
 * Never modifies normal development or production records.
 */

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const crypto = require('crypto');
const assert = require('node:assert/strict');

// Ensure console.assert failures throw AssertionError and cause test failure
console.assert = (condition, ...args) => {
  assert.ok(condition, args.map(a => (typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a))).join(' '));
};

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const TEST_DB = 'placement_portal_test_step6';
const TEST_STORAGE = path.join(os.tmpdir(), `placement-portal-step6-storage-${process.pid}`);
process.env.DB_NAME = TEST_DB;
process.env.RESUME_STORAGE_DIR = TEST_STORAGE;

const mysql = require('mysql2/promise');

function prepareSql(rawSql) {
  return rawSql
    .replace(/CREATE DATABASE IF NOT EXISTS\s+[^\n;]+;/gi, '')
    .replace(/USE\s+[a-zA-Z0-9_`]+;/gi, `USE \`${TEST_DB}\`;`);
}

async function main() {
  console.log('===============================================================');
  console.log('   Step 6: Job Editing, Resubmission & Application Protection  ');
  console.log('===============================================================');

  let adminConn;
  let server;
  let pool;
  let baseUrl;

  try {
    adminConn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      multipleStatements: true,
    });
    console.log(`\n[Setup] Provisioning test database '${TEST_DB}'...`);
    await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\`;`);
    await adminConn.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await adminConn.query(`USE \`${TEST_DB}\`;`);

    // Schema
    const rawSchema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
    await adminConn.query(prepareSql(rawSchema));

    // Seeds
    const rawSeed = fs.readFileSync(path.resolve(__dirname, '../../database/seed.sql'), 'utf8');
    await adminConn.query(prepareSql(rawSeed));

    const rawAdminSeed = fs.readFileSync(path.resolve(__dirname, '../../database/seed_admin_dev.sql'), 'utf8');
    await adminConn.query(prepareSql(rawAdminSeed));

    // Company 2 (Northstar)
    await adminConn.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES
      (5, 'Northstar Systems', 'northstar@example.com',
       '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'company', TRUE);
    `);

    // Inactive Company
    await adminConn.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES
      (6, 'Deactivated Corp', 'inactive_corp@example.com',
       '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'company', FALSE);
    `);

    console.log('        Schema and test accounts provisioned.');

    await fs.promises.mkdir(TEST_STORAGE, { recursive: true });
    const sampleResumeKey = '11111111-1111-4111-8111-111111111111.pdf';
    const samplePdfBytes = Buffer.from('%PDF-1.7\nAlice Test Resume\n%%EOF\n');
    const sampleHash = crypto.createHash('sha256').update(samplePdfBytes).digest('hex');
    await fs.promises.writeFile(path.join(TEST_STORAGE, sampleResumeKey), samplePdfBytes);
    await adminConn.query(`
      INSERT INTO student_resumes (user_id, label, original_name, storage_key, mime_type, file_size, sha256, is_default)
      VALUES (2, 'Default Resume', 'alice_resume.pdf', ?, 'application/pdf', ?, ?, TRUE)
    `, [sampleResumeKey, samplePdfBytes.length, sampleHash]);

    const app = require('../src/app');
    pool = require('../src/config/db');
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`        Test server listening at ${baseUrl}\n`);
        resolve();
      });
    });

    async function request(path, { method = 'GET', body, token } = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }

    async function login(email, password = 'Test@1234') {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      return { status: res.status, token: res.data.token, user: res.data.user, error: res.data.error };
    }

    const admin    = await login('admin@placement.edu', 'Admin#Dev2026!');
    const company1 = await login('techcorp@example.com', 'Test@1234');
    const company2 = await login('northstar@example.com', 'Test@1234');
    const student1 = await login('alice@example.com', 'Test@1234');

    console.assert(admin.status === 200, 'Admin login failed');
    console.assert(company1.status === 200, 'Company 1 login failed');
    console.assert(company2.status === 200, 'Company 2 login failed');
    console.assert(student1.status === 200, 'Student 1 login failed');

    console.log('[Executing Step 6 Test Cases]:');

    // -------------------------------------------------------------------------
    // Test 1: A company can edit its own pending job
    // -------------------------------------------------------------------------
    const createRes = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Initial Pending Role',
        description: 'Initial role description.',
        location: 'Bengaluru',
        stipend: 20000,
      },
    });
    console.assert(createRes.status === 201, `Failed to create pending job: ${createRes.status}`);
    const jobId1 = createRes.data.jobId;

    const editPendingRes = await request(`/api/jobs/${jobId1}`, {
      method: 'PATCH',
      token: company1.token,
      body: {
        title: 'Updated Pending Role',
        stipend: 25000,
        location: 'Bengaluru / Hybrid',
      },
    });
    console.assert(editPendingRes.status === 200, `Expected 200 for company edit, got ${editPendingRes.status}`);
    console.assert(editPendingRes.data.approval_status === 'pending', 'Approval status must remain pending');

    const [dbJob1] = await adminConn.query('SELECT title, stipend, location, approval_status FROM jobs WHERE id = ?', [jobId1]);
    console.assert(dbJob1[0].title === 'Updated Pending Role', 'Job title did not update in DB');
    console.assert(Number(dbJob1[0].stipend) === 25000, 'Stipend did not update in DB');
    console.assert(dbJob1[0].approval_status === 'pending', 'Approval status should be pending');
    console.log('  ✅ Test 1 PASS: Company can edit its own pending job and update editable fields.');

    // -------------------------------------------------------------------------
    // Test 2 & 9: Company can edit its own rejected job, resubmitting clears rejection reason
    // -------------------------------------------------------------------------
    // Admin rejects jobId1 with reason
    const rejectRes = await request(`/api/jobs/${jobId1}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: {
        approval_status: 'rejected',
        rejection_reason: 'Stipend is too low for the required responsibilities.',
      },
    });
    console.assert(rejectRes.status === 200, `Failed to reject job: ${rejectRes.status}`);

    const [rejectedDb] = await adminConn.query('SELECT approval_status, rejection_reason, reviewed_by, reviewed_at FROM jobs WHERE id = ?', [jobId1]);
    console.assert(rejectedDb[0].approval_status === 'rejected', 'Job must be marked rejected');
    console.assert(rejectedDb[0].rejection_reason !== null, 'Rejection reason must be stored');

    // Company edits and resubmits
    const resubmitRes = await request(`/api/jobs/${jobId1}`, {
      method: 'PATCH',
      token: company1.token,
      body: {
        stipend: 40000,
        description: 'Comprehensive role description with increased compensation.',
      },
    });
    console.assert(resubmitRes.status === 200, `Resubmission failed: ${resubmitRes.status}`);
    console.assert(resubmitRes.data.approval_status === 'pending', 'Resubmitted job must be pending');

    const [resubmittedDb] = await adminConn.query(
      'SELECT approval_status, rejection_reason, reviewed_by, reviewed_at, stipend FROM jobs WHERE id = ?',
      [jobId1]
    );
    console.assert(resubmittedDb[0].approval_status === 'pending', 'DB approval status must be reset to pending');
    console.assert(resubmittedDb[0].rejection_reason === null, 'Rejection reason must be cleared on resubmission');
    console.assert(resubmittedDb[0].reviewed_by === null, 'Reviewed_by must be cleared on resubmission');
    console.assert(resubmittedDb[0].reviewed_at === null, 'Reviewed_at must be cleared on resubmission');
    console.assert(Number(resubmittedDb[0].stipend) === 40000, 'Stipend should be updated to 40000');
    console.log('  ✅ Test 2 & 9 PASS: Editing rejected job resets status to pending and clears previous rejection/audit data.');

    // -------------------------------------------------------------------------
    // Test 3: Resubmitted job remains hidden from students and blocks applications
    // -------------------------------------------------------------------------
    const studentJobs = await request('/api/jobs', { token: student1.token });
    const inStudentList = studentJobs.data.some((j) => j.id === jobId1);
    console.assert(!inStudentList, 'Resubmitted pending job must not be visible to students in list');

    const studentDetail = await request(`/api/jobs/${jobId1}`, { token: student1.token });
    console.assert(studentDetail.status === 404, `Student detail must return 404 for resubmitted pending job, got ${studentDetail.status}`);

    const applyAttempt = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: jobId1 },
    });
    console.assert(applyAttempt.status === 400, `Application to resubmitted pending job must fail with 400, got ${applyAttempt.status}`);
    console.log('  ✅ Test 3 PASS: Resubmitted job is hidden from student listings, detail views, and application submissions.');

    // -------------------------------------------------------------------------
    // Test 4: Editing an approved company job requires fresh approval
    // -------------------------------------------------------------------------
    // Admin approves jobId1
    const approveJob1 = await request(`/api/jobs/${jobId1}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved' },
    });
    console.assert(approveJob1.status === 200, `Approval failed: ${approveJob1.status}`);

    // Verify it was visible to student
    const studentViewApproved = await request(`/api/jobs/${jobId1}`, { token: student1.token });
    console.assert(studentViewApproved.status === 200, 'Approved job should be visible to student');

    // Company edits the approved job
    const editApproved = await request(`/api/jobs/${jobId1}`, {
      method: 'PATCH',
      token: company1.token,
      body: { location: 'Chennai / Hybrid' },
    });
    console.assert(editApproved.status === 200, `Edit approved job failed: ${editApproved.status}`);
    console.assert(editApproved.data.approval_status === 'pending', 'Approved job after edit must return to pending');

    // Verify it is immediately hidden from student again
    const studentViewAfterEdit = await request(`/api/jobs/${jobId1}`, { token: student1.token });
    console.assert(studentViewAfterEdit.status === 404, 'Edited job must immediately become hidden from students');
    console.log('  ✅ Test 4 PASS: Editing an approved company job requires fresh approval and immediately hides it from students.');

    // -------------------------------------------------------------------------
    // Test 5: A company cannot edit another company's job
    // -------------------------------------------------------------------------
    const foreignEdit = await request(`/api/jobs/${jobId1}`, {
      method: 'PATCH',
      token: company2.token,
      body: { title: 'Hacked Title' },
    });
    console.assert(foreignEdit.status === 403, `Company 2 editing Company 1 job must return 403, got ${foreignEdit.status}`);
    console.log('  ✅ Test 5 PASS: Cross-company job modification strictly rejected with HTTP 403.');

    // -------------------------------------------------------------------------
    // Test 6: A company cannot edit or delete a Placement Cell-created job
    // -------------------------------------------------------------------------
    // Admin creates job mapped to company1
    const createAdminAssigned = await request('/api/jobs/create', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Placement Cell Campus Drive for TechCorp',
        description: 'Placement cell direct drive.',
        location: 'Pune',
        stipend: 30000,
        company_id: company1.user.id,
      },
    });
    console.assert(createAdminAssigned.status === 201, `Failed to create admin assigned job: ${createAdminAssigned.status}`);
    const adminJobId = createAdminAssigned.data.jobId;

    // Company 1 tries to edit admin-created posting
    const companyEditAdminJob = await request(`/api/jobs/${adminJobId}`, {
      method: 'PATCH',
      token: company1.token,
      body: { title: 'Tampered Title' },
    });
    console.assert(companyEditAdminJob.status === 403, `Company editing admin job must return 403, got ${companyEditAdminJob.status}`);

    // Company 1 tries to delete admin-created posting
    const companyDeleteAdminJob = await request(`/api/jobs/${adminJobId}`, {
      method: 'DELETE',
      token: company1.token,
    });
    console.assert(companyDeleteAdminJob.status === 403, `Company deleting admin job must return 403, got ${companyDeleteAdminJob.status}`);
    console.log('  ✅ Test 6 PASS: Company forbidden (HTTP 403) from editing or deleting Placement Cell postings.');

    // -------------------------------------------------------------------------
    // Test 7: Administrator can edit Placement Cell posting without company approval queue
    // -------------------------------------------------------------------------
    const adminEditRes = await request(`/api/jobs/${adminJobId}`, {
      method: 'PATCH',
      token: admin.token,
      body: {
        title: 'Placement Cell Campus Drive for TechCorp (Updated)',
        stipend: 38000,
        recruiting_organization: 'TechCorp India Division',
      },
    });
    console.assert(adminEditRes.status === 200, `Admin edit failed: ${adminEditRes.status}`);

    const [adminDbAfter] = await adminConn.query(
      'SELECT title, stipend, recruiting_organization, posting_source, approval_status FROM jobs WHERE id = ?',
      [adminJobId]
    );
    console.assert(adminDbAfter[0].title.includes('Updated'), 'Title not updated');
    console.assert(adminDbAfter[0].posting_source === 'placement_cell', 'Posting source must remain placement_cell');
    console.assert(adminDbAfter[0].approval_status === 'approved', 'Approval status must remain approved');

    // Verify it did NOT enter pending queue
    const pendingQueue = await request('/api/jobs/pending', { token: admin.token });
    const inPendingQueue = pendingQueue.data.some((j) => j.id === adminJobId);
    console.assert(!inPendingQueue, 'Placement Cell job must NEVER enter pending approvals queue');
    console.log('  ✅ Test 7 PASS: Administrator edits Placement Cell posting; preserves approval and bypasses queue.');

    // -------------------------------------------------------------------------
    // Test 8: Client request data cannot forge or alter protected fields
    // -------------------------------------------------------------------------
    const forgeryAttempt = await request(`/api/jobs/${jobId1}`, {
      method: 'PATCH',
      token: company1.token,
      body: {
        title: 'Attempted Forgery',
        created_by: 999,
        posting_source: 'placement_cell',
        company_id: 999,
        approval_status: 'approved',
        reviewed_by: 999,
      },
    });
    console.assert(forgeryAttempt.status === 200, 'Request with ignored fields should succeed for allowed fields');

    const [forgeryDb] = await adminConn.query(
      'SELECT created_by, posting_source, company_id, approval_status, reviewed_by FROM jobs WHERE id = ?',
      [jobId1]
    );
    console.assert(forgeryDb[0].created_by === company1.user.id, 'created_by was tampered with!');
    console.assert(forgeryDb[0].posting_source === 'company', 'posting_source was tampered with!');
    console.assert(forgeryDb[0].company_id === company1.user.id, 'company_id was tampered with!');
    console.assert(forgeryDb[0].approval_status === 'pending', 'approval_status was forged to approved!');
    console.assert(forgeryDb[0].reviewed_by === null, 'reviewed_by was tampered with!');
    console.log('  ✅ Test 8 PASS: Protected fields (created_by, posting_source, company_id, approval_status) safely protected.');

    // -------------------------------------------------------------------------
    // Test 10: Editing does not erase existing student applications or their statuses
    // -------------------------------------------------------------------------
    // Re-approve jobId1 so student can apply
    await request(`/api/jobs/${jobId1}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved' },
    });

    const studentApply = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: jobId1 },
    });
    console.assert(studentApply.status === 201, `Student application failed: ${studentApply.status}`);
    const appId = studentApply.data.applicationId;

    // Company edits the job again
    await request(`/api/jobs/${jobId1}`, {
      method: 'PATCH',
      token: company1.token,
      body: { description: 'Updated description while application exists.' },
    });

    // Check application record
    const [appCheck] = await adminConn.query('SELECT id, job_id, student_id, status FROM applications WHERE id = ?', [appId]);
    console.assert(appCheck.length === 1, 'Application record disappeared after job edit!');
    console.assert(appCheck[0].job_id === jobId1, 'Application job association corrupted');
    console.assert(appCheck[0].student_id === student1.user.id, 'Student association corrupted');
    console.assert(appCheck[0].status === 'pending', 'Application status corrupted');
    console.log('  ✅ Test 10 PASS: Job editing preserves all existing student applications and application statuses.');

    // -------------------------------------------------------------------------
    // Test 11: A job with applications cannot be permanently deleted (HTTP 409 Conflict)
    // -------------------------------------------------------------------------
    const deleteWithApps = await request(`/api/jobs/${jobId1}`, {
      method: 'DELETE',
      token: company1.token,
    });
    console.assert(deleteWithApps.status === 409, `Expected 409 Conflict deleting job with applications, got ${deleteWithApps.status}`);
    console.assert(deleteWithApps.data.error.includes('existing student applications'), 'Error message must explain retention reason');

    const adminDeleteWithApps = await request(`/api/jobs/${jobId1}`, {
      method: 'DELETE',
      token: admin.token,
    });
    console.assert(adminDeleteWithApps.status === 409, `Admin delete on job with apps must return 409, got ${adminDeleteWithApps.status}`);

    // Verify job and application still exist in DB
    const [jobStillExists] = await adminConn.query('SELECT id FROM jobs WHERE id = ?', [jobId1]);
    const [appStillExists] = await adminConn.query('SELECT id FROM applications WHERE id = ?', [appId]);
    console.assert(jobStillExists.length === 1, 'Job was deleted despite having applications!');
    console.assert(appStillExists.length === 1, 'Application was deleted!');
    console.log('  ✅ Test 11 PASS: Deleting a job with student applications rejected with HTTP 409 Conflict; records preserved.');

    // -------------------------------------------------------------------------
    // Test 12: A job with no applications follows documented deletion policy
    // -------------------------------------------------------------------------
    const createEmptyJob = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Empty Role for Deletion',
        description: 'To be deleted without applications.',
        location: 'Remote',
      },
    });
    const emptyJobId = createEmptyJob.data.jobId;

    const deleteEmptyRes = await request(`/api/jobs/${emptyJobId}`, {
      method: 'DELETE',
      token: company1.token,
    });
    console.assert(deleteEmptyRes.status === 200, `Failed to delete empty job: ${deleteEmptyRes.status}`);

    const [deletedCheck] = await adminConn.query('SELECT id FROM jobs WHERE id = ?', [emptyJobId]);
    console.assert(deletedCheck.length === 0, 'Empty job should be deleted from DB');
    console.log('  ✅ Test 12 PASS: Authorized deletion of job with zero applications succeeds (HTTP 200).');

    // -------------------------------------------------------------------------
    // Test 13: Closing a job continues to prevent new applications
    // -------------------------------------------------------------------------
    // Re-approve jobId1 so it's approved, then close it
    await request(`/api/jobs/${jobId1}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved' },
    });

    const closeRes = await request(`/api/jobs/${jobId1}/status`, {
      method: 'PATCH',
      token: company1.token,
      body: { job_status: 'closed' },
    });
    console.assert(closeRes.status === 200, `Close job failed: ${closeRes.status}`);

    // Another student tries to apply
    const applyClosedAttempt = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: jobId1 },
    });
    console.assert(applyClosedAttempt.status === 400 || applyClosedAttempt.status === 409, 'Application to closed job must fail');
    console.log('  ✅ Test 13 PASS: Closed job remains unavailable for new applications.');

    // -------------------------------------------------------------------------
    // Test 14: Input validation and rejection on invalid fields
    // -------------------------------------------------------------------------
    const emptyTitleRes = await request(`/api/jobs/${jobId1}`, {
      method: 'PATCH',
      token: company1.token,
      body: { title: '   ' },
    });
    console.assert(emptyTitleRes.status === 400, `Empty title must return 400, got ${emptyTitleRes.status}`);

    const badStipendRes = await request(`/api/jobs/${jobId1}`, {
      method: 'PATCH',
      token: company1.token,
      body: { stipend: -500 },
    });
    console.assert(badStipendRes.status === 400, `Negative stipend must return 400, got ${badStipendRes.status}`);

    const badDeadlineRes = await request(`/api/jobs/${jobId1}`, {
      method: 'PATCH',
      token: company1.token,
      body: { application_deadline: 'invalid-date' },
    });
    console.assert(badDeadlineRes.status === 400, `Invalid deadline must return 400, got ${badDeadlineRes.status}`);

    // Admin cannot edit company job directly
    const adminEditCompanyJob = await request(`/api/jobs/${jobId1}`, {
      method: 'PATCH',
      token: admin.token,
      body: { title: 'Admin Direct Mod on Company Job' },
    });
    console.assert(adminEditCompanyJob.status === 400, `Admin editing company job must return 400, got ${adminEditCompanyJob.status}`);
    console.log('  ✅ Test 14 PASS: Server-side validation rejects empty fields, negative stipends, malformed dates, and direct admin company bypass.');

    console.log('\n===============================================================');
    console.log('  ✨ ALL 14 STEP 6 TEST CASES PASSED SUCCESSFULLY!             ');
    console.log('===============================================================');

  } catch (err) {
    console.error('\n❌ STEP 6 TEST RUNNER ENCOUNTERED AN ERROR:');
    console.error(err);
    process.exitCode = 1;
  } finally {
    try {
      if (server) {
        if (typeof server.closeIdleConnections === 'function') {
          server.closeIdleConnections();
        }
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        await new Promise((resolve) => server.close(resolve));
      }
    } catch (e) {
      console.error('[Cleanup Error] Server shutdown failed:', e.message);
      process.exitCode = process.exitCode || 1;
    } finally {
      try {
        if (pool) {
          await new Promise((resolve) => pool.end(resolve));
        }
      } catch (e) {
        console.error('[Cleanup Error] Pool close failed:', e.message);
        process.exitCode = process.exitCode || 1;
      } finally {
        try {
          if (adminConn) {
            console.log(`\n[Cleanup] Dropping isolated test database '${TEST_DB}'...`);
            await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\`;`);
            console.log('[Cleanup] Test database dropped cleanly.');
          }
        } catch (e) {
          console.error('[Cleanup Error] Dropping test database failed:', e.message);
          process.exitCode = process.exitCode || 1;
        } finally {
          try {
            if (adminConn) {
              await adminConn.end();
            }
          } catch (e) {
            console.error('[Cleanup Error] Closing admin connection failed:', e.message);
            process.exitCode = process.exitCode || 1;
          } finally {
            try {
              if (fs.existsSync(TEST_STORAGE)) {
                await fs.promises.rm(TEST_STORAGE, { recursive: true, force: true });
                console.log('[Cleanup] Cleaned up temporary test storage directory.');
              }
            } catch (e) {
              console.error('[Cleanup Error] Resume storage cleanup failed:', e.message);
              process.exitCode = process.exitCode || 1;
            }
          }
        }
      }
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal error in test runner:', err);
  process.exitCode = 1;
});
