/**
 * Step 5 Automated Integration & Dashboard Workflow Verification
 *
 * Runs against isolated temporary database: placement_portal_test_step5
 * Validates the complete API surface and contracts powering the Step 5 Dashboard:
 *   1. Student persona & metrics
 *   2. Company persona, approval badges, rejection reason visibility
 *   3. Admin persona, overview metrics matching isolated database
 *   4. Pending company jobs in pending queue
 *   5. Job approval workflow and immediate visibility to students
 *   6. Job rejection requiring reason & audit recording
 *   7. Direct job publication by Placement Cell (external & registered company)
 *   8. Absence of admin-created jobs in pending queue
 *   9. All Job Postings list with joined creator/reviewer metadata and filters
 *  10. Job availability controls (open / closed) preserving approval status
 *  11. Active registered companies dropdown endpoint (/api/jobs/companies)
 *  12. Unauthorized access rejections for admin endpoints
 *  13. Student application history and duplicate prevention
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
const TEST_DB = 'placement_portal_test_step5';
const TEST_STORAGE = path.join(os.tmpdir(), `placement-portal-step5-storage-${process.pid}`);
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
  console.log('   Step 5: Placement Cell Admin Dashboard Integration Suite    ');
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

    // Schema and Seeds
    const rawSchema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
    await adminConn.query(prepareSql(rawSchema));

    const rawSeed = fs.readFileSync(path.resolve(__dirname, '../../database/seed.sql'), 'utf8');
    await adminConn.query(prepareSql(rawSeed));

    const rawAdminSeed = fs.readFileSync(path.resolve(__dirname, '../../database/seed_admin_dev.sql'), 'utf8');
    await adminConn.query(prepareSql(rawAdminSeed));

    // Provision Northstar Systems as an additional active company
    await adminConn.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES
      (5, 'Northstar Systems', 'northstar@example.com',
       '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'company', TRUE);
    `);

    // Provision an inactive company
    await adminConn.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES
      (6, 'Inactive Inc', 'inactive@example.com',
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

    // Authenticate
    const student = await login('alice@example.com', 'Test@1234');
    const company = await login('techcorp@example.com', 'Test@1234');
    const admin   = await login('admin@placement.edu', 'Admin#Dev2026!');

    console.assert(student.status === 200, 'Student login failed');
    console.assert(company.status === 200, 'Company login failed');
    console.assert(admin.status === 200, 'Admin login failed');

    console.log('[Running 13 Verification Steps]:');

    // -------------------------------------------------------------------------
    // 1. Student login shows student interface data
    // -------------------------------------------------------------------------
    const studentStats = await request('/api/applications/dashboard/stats', { token: student.token });
    console.assert(studentStats.status === 200, 'Failed to fetch student stats');
    console.assert(studentStats.data.total !== undefined, 'Student stats missing total');
    console.assert(studentStats.data.shortlisted !== undefined, 'Student stats missing shortlisted');
    console.assert(studentStats.data.total_active_companies === undefined, 'Student stats leaked admin metrics');
    console.log('  ✅ 1. Student interface stats verified and segregated.');

    // -------------------------------------------------------------------------
    // 2. Company login shows company interface and approval badges
    // -------------------------------------------------------------------------
    const companyJobsRes = await request('/api/jobs/my', { token: company.token });
    console.assert(companyJobsRes.status === 200, 'Failed to fetch company jobs');
    console.assert(Array.isArray(companyJobsRes.data), 'Company jobs must be an array');
    console.assert(companyJobsRes.data[0].approval_status !== undefined, 'Missing approval_status on company jobs');
    console.assert(companyJobsRes.data[0].job_status !== undefined, 'Missing job_status on company jobs');
    console.log('  ✅ 2. Company job list includes approval_status, job_status, and applicant counts.');

    // -------------------------------------------------------------------------
    // 3. Admin login shows Placement Cell dashboard metrics
    // -------------------------------------------------------------------------
    const adminStats = await request('/api/applications/dashboard/stats', { token: admin.token });
    console.assert(adminStats.status === 200, 'Failed to fetch admin stats');
    console.assert(typeof adminStats.data.total_jobs_awaiting_approval === 'number', 'Missing total_jobs_awaiting_approval');
    console.assert(typeof adminStats.data.total_approved_jobs === 'number', 'Missing total_approved_jobs');
    console.assert(typeof adminStats.data.open_approved_jobs === 'number', 'Missing open_approved_jobs');
    console.assert(typeof adminStats.data.total_active_companies === 'number', 'Missing total_active_companies');
    console.assert(typeof adminStats.data.total_applications === 'number', 'Missing total_applications');
    console.log('  ✅ 3. Admin metrics contract verified with exact property names.');

    // -------------------------------------------------------------------------
    // 4. Admin metrics match actual database records
    // -------------------------------------------------------------------------
    const [dbCoActive] = await adminConn.query("SELECT COUNT(*) AS cnt FROM users WHERE role = 'company' AND is_active = TRUE");
    console.assert(adminStats.data.total_active_companies === dbCoActive[0].cnt, 'Active company count mismatch');
    console.log(`  ✅ 4. Admin metrics match database: ${adminStats.data.total_active_companies} active companies.`);

    // -------------------------------------------------------------------------
    // 5. Pending company jobs appear in Pending Approvals
    // -------------------------------------------------------------------------
    const createCoJob = await request('/api/jobs/create', {
      method: 'POST',
      token: company.token,
      body: {
        title: 'Cloud DevOps Intern',
        description: 'Docker, Kubernetes, and Terraform experience.',
        location: 'Hyderabad',
        stipend: 30000,
        application_deadline: '2026-12-31 23:59:59',
      },
    });
    console.assert(createCoJob.status === 201, 'Failed to create company pending job');
    const pendingJobId = createCoJob.data.jobId;

    const pendingQueue = await request('/api/jobs/pending', { token: admin.token });
    console.assert(pendingQueue.status === 200, 'Failed to fetch pending queue');
    const queueItem = pendingQueue.data.find(j => j.id === pendingJobId);
    console.assert(queueItem !== undefined, 'Company job not in pending queue');
    console.assert(queueItem.submitting_company_name === company.user.name, 'Submitting company name missing or incorrect');
    console.assert(queueItem.submitting_company_email === company.user.email, 'Submitting company email missing or incorrect');
    console.log('  ✅ 5. Company job appears in Pending Approvals with submitting company details.');

    // -------------------------------------------------------------------------
    // 6. Approving a pending job updates queue and makes it visible to students
    // -------------------------------------------------------------------------
    const approveRes = await request(`/api/jobs/${pendingJobId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved' },
    });
    console.assert(approveRes.status === 200, 'Failed to approve job');

    const pendingQueueAfterApprove = await request('/api/jobs/pending', { token: admin.token });
    const stillInQueue = pendingQueueAfterApprove.data.some(j => j.id === pendingJobId);
    console.assert(!stillInQueue, 'Approved job must be removed from pending queue');

    const studentJobList = await request('/api/jobs', { token: student.token });
    const inStudentList = studentJobList.data.some(j => j.id === pendingJobId);
    console.assert(inStudentList, 'Approved job must now be visible in student job list');
    console.log('  ✅ 6. Approving job updates pending queue and publishes job to students.');

    // -------------------------------------------------------------------------
    // 7. Rejecting a job requires reason and shows reason to submitting company
    // -------------------------------------------------------------------------
    const createCoJob2 = await request('/api/jobs/create', {
      method: 'POST',
      token: company.token,
      body: {
        title: 'Vague Role',
        description: 'Vague description without requirements.',
        location: 'Remote',
      },
    });
    const rejectedJobId = createCoJob2.data.jobId;

    // Attempt reject without reason
    const rejectNoReason = await request(`/api/jobs/${rejectedJobId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'rejected' },
    });
    console.assert(rejectNoReason.status === 400, 'Rejection without reason must fail');

    // Reject with reason
    const rejectionReasonText = 'Description lacks specific responsibilities and required qualification details.';
    const rejectWithReason = await request(`/api/jobs/${rejectedJobId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'rejected', rejection_reason: rejectionReasonText },
    });
    console.assert(rejectWithReason.status === 200, 'Rejection with reason failed');

    // Company checks their jobs
    const coJobsAfterReject = await request('/api/jobs/my', { token: company.token });
    const rejectedCoJob = coJobsAfterReject.data.find(j => j.id === rejectedJobId);
    console.assert(rejectedCoJob && rejectedCoJob.approval_status === 'rejected', 'Job must be marked rejected');
    console.assert(rejectedCoJob.rejection_reason === rejectionReasonText, 'Company must receive exact rejection reason');
    console.log('  ✅ 7. Rejecting requires reason and exposes reason in company dashboard.');

    // -------------------------------------------------------------------------
    // 8. Admin posts external organization job and it is published directly
    // -------------------------------------------------------------------------
    const adminExternalJob = await request('/api/jobs/create', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Research Analyst',
        description: 'National Research Institute direct drive.',
        location: 'New Delhi',
        stipend: 45000,
        recruiting_organization: 'National AI Mission',
      },
    });
    console.assert(adminExternalJob.status === 201, 'Failed to create direct admin job');
    console.assert(adminExternalJob.data.approval_status === 'approved', 'Admin job must be approved directly');
    const adminExternalJobId = adminExternalJob.data.jobId;

    const studentListWithExt = await request('/api/jobs', { token: student.token });
    const extFound = studentListWithExt.data.find(j => j.id === adminExternalJobId);
    console.assert(extFound !== undefined, 'Admin direct job must be immediately visible to students');
    console.log('  ✅ 8. Admin direct external job published immediately to students.');

    // -------------------------------------------------------------------------
    // 9. Admin-created jobs do not appear in Pending Approvals
    // -------------------------------------------------------------------------
    const pendingQueueAdminCheck = await request('/api/jobs/pending', { token: admin.token });
    const hasAdminJobInPending = pendingQueueAdminCheck.data.some(j => j.id === adminExternalJobId);
    console.assert(!hasAdminJobInPending, 'Admin job must never enter pending queue');
    console.log('  ✅ 9. Admin-created jobs excluded from Pending Approvals queue.');

    // -------------------------------------------------------------------------
    // 10. All Job Postings displays source, status, and joined reviewer/creator
    // -------------------------------------------------------------------------
    const allJobsRes = await request('/api/jobs/all', { token: admin.token });
    console.assert(allJobsRes.status === 200, 'Failed to fetch all jobs for admin');
    const allJobs = allJobsRes.data;
    const foundRejectedInAll = allJobs.find(j => j.id === rejectedJobId);
    console.assert(foundRejectedInAll !== undefined, 'Rejected job must appear in All Jobs for admin');
    console.assert(foundRejectedInAll.reviewer_name !== undefined, 'Reviewer name must be joined');
    console.assert(foundRejectedInAll.creator_name !== undefined, 'Creator name must be joined');
    console.assert(foundRejectedInAll.posting_source === 'company', 'Posting source must be company');
    console.log('  ✅ 10. All Job Postings endpoint returns full metadata (creator, reviewer, source, counts).');

    // -------------------------------------------------------------------------
    // 11. Closing a job changes availability but not approval state
    // -------------------------------------------------------------------------
    const closeJob = await request(`/api/jobs/${pendingJobId}/status`, {
      method: 'PATCH',
      token: admin.token,
      body: { job_status: 'closed' },
    });
    console.assert(closeJob.status === 200, 'Failed to close job');
    console.assert(closeJob.data.approval_status === 'approved', 'Approval status must remain approved');

    const [closedRow] = await adminConn.query('SELECT approval_status, job_status FROM jobs WHERE id = ?', [pendingJobId]);
    console.assert(closedRow[0].approval_status === 'approved', 'Database approval_status must remain approved');
    console.assert(closedRow[0].job_status === 'closed', 'Database job_status must be closed');

    // Student cannot apply to closed job
    const applyClosed = await request('/api/jobs/apply', {
      method: 'POST',
      token: student.token,
      body: { job_id: pendingJobId },
    });
    console.assert(applyClosed.status === 400, 'Student must not be able to apply to closed job');
    console.log('  ✅ 11. Closing job preserves approval status and blocks new applications.');

    // -------------------------------------------------------------------------
    // 12. Active companies dropdown endpoint (/api/jobs/companies)
    // -------------------------------------------------------------------------
    const companiesRes = await request('/api/jobs/companies', { token: admin.token });
    console.assert(companiesRes.status === 200, 'Failed to fetch active companies');
    console.assert(Array.isArray(companiesRes.data), 'Companies must be an array');
    console.assert(companiesRes.data.some(c => c.name === 'Northstar Systems'), 'Northstar Systems must be in active list');
    const hasInactive = companiesRes.data.some(c => c.email === 'inactive@example.com');
    console.assert(!hasInactive, 'Inactive company must NOT be in company dropdown list');

    // Student cannot access companies list
    const studentCoAccess = await request('/api/jobs/companies', { token: student.token });
    console.assert(studentCoAccess.status === 403, 'Student must be forbidden from company dropdown');
    console.log('  ✅ 12. /api/jobs/companies returns only active registered companies for admin (403 for others).');

    // -------------------------------------------------------------------------
    // 13. Student application history and duplicate prevention intact
    // -------------------------------------------------------------------------
    // Student applies to adminExternalJob
    const applyExt = await request('/api/jobs/apply', {
      method: 'POST',
      token: student.token,
      body: { job_id: adminExternalJobId },
    });
    console.assert(applyExt.status === 201, 'Student application to open job failed');

    const applyDup = await request('/api/jobs/apply', {
      method: 'POST',
      token: student.token,
      body: { job_id: adminExternalJobId },
    });
    console.assert(applyDup.status === 409, 'Duplicate application must return 409');

    const myApps = await request('/api/applications/my', { token: student.token });
    console.assert(myApps.status === 200, 'Failed to fetch student applications');
    console.assert(myApps.data.some(a => a.job_id === adminExternalJobId), 'New application must be in student list');
    console.log('  ✅ 13. Student application flow, history, and duplicate prevention remain intact.');

    console.log('\n===============================================================');
    console.log('  ✨ ALL 13 STEP 5 INTEGRATION SCENARIOS PASSED SUCCESSFULLY!   ');
    console.log('===============================================================');

  } catch (err) {
    console.error('\n❌ STEP 5 TEST RUNNER ENCOUNTERED AN ERROR:');
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
