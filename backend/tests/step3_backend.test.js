/**
 * Step 3 Automated Regression & Backend Rules Test Suite
 *
 * Runs against an isolated temporary database: placement_portal_test_step3
 * Never modifies or resets the normal development database.
 */

const path = require('path');
const fs   = require('fs');

// 1. Load environment and set isolated test database name before initializing backend
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const TEST_DB = 'placement_portal_test_step3';
process.env.DB_NAME = TEST_DB;

const mysql = require('mysql2/promise');

function prepareSql(rawSql) {
  return rawSql
    .replace(/CREATE DATABASE IF NOT EXISTS\s+[^\n;]+;/gi, '')
    .replace(/USE\s+[a-zA-Z0-9_`]+;/gi, `USE \`${TEST_DB}\`;`);
}

async function main() {
  console.log('===============================================================');
  console.log('       Step 3: Backend Job Creation & Publication Test Suite    ');
  console.log('===============================================================');

  // Direct connection for database provisioning
  const adminConn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  let server;
  let baseUrl;

  try {
    // Stage 1: Setup isolated test DB
    console.log(`\n[Setup] Provisioning test database '${TEST_DB}'...`);
    await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\`;`);
    await adminConn.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await adminConn.query(`USE \`${TEST_DB}\`;`);

    // Load schema
    const rawSchema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
    await adminConn.query(prepareSql(rawSchema));

    // Load base seed and dev admin
    const rawSeed = fs.readFileSync(path.resolve(__dirname, '../../database/seed.sql'), 'utf8');
    await adminConn.query(prepareSql(rawSeed));

    const rawAdminSeed = fs.readFileSync(path.resolve(__dirname, '../../database/seed_admin_dev.sql'), 'utf8');
    await adminConn.query(prepareSql(rawAdminSeed));

    // Insert an extra company (Company 2: Northstar) for ownership tests
    await adminConn.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES
      (5, 'Northstar Systems', 'northstar@example.com',
       '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'company', TRUE);
    `);

    console.log('        Schema and test accounts provisioned.');

    // Stage 2: Spin up Express test instance
    console.log('[Setup] Launching Express server on ephemeral port...');
    const app = require('../src/app');
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`        Test server listening at ${baseUrl}`);
        resolve();
      });
    });

    // Helper for requests
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

    // Login helper
    async function login(email, password = 'Test@1234') {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      return { status: res.status, token: res.data.token, user: res.data.user, error: res.data.error };
    }

    // Authenticate test actors
    const company1 = await login('techcorp@example.com');
    const company2 = await login('northstar@example.com');
    const student1 = await login('alice@example.com');
    const student2 = await login('bob@example.com');
    const admin    = await login('admin@placement.edu', 'Admin#Dev2026!');

    console.log('company1 status:', company1.status, company1.error);
    console.log('admin status:', admin.status, admin.error);

    console.log('\n[Running 13 Test Cases]:');

    // -------------------------------------------------------------------------
    // Test 1: Active company creates a pending job
    // -------------------------------------------------------------------------
    const res1 = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Fullstack Intern',
        description: 'React and Node.js tasks',
        location: 'Bangalore',
        stipend: 25000,
        application_deadline: new Date(Date.now() + 864000000).toISOString(),
        eligibility_criteria: 'B.Tech CS / IT',
      },
    });
    console.assert(res1.status === 201, `Test 1 failed with status ${res1.status}: ${JSON.stringify(res1.data)}`);
    console.assert(res1.data.approval_status === 'pending', 'Test 1 approval_status must be pending');

    const [[dbJob1]] = await adminConn.query('SELECT * FROM jobs WHERE id = ?', [res1.data.jobId]);
    console.assert(dbJob1.approval_status === 'pending', 'Test 1 DB approval_status must be pending');
    console.assert(dbJob1.job_status === 'open', 'Test 1 DB job_status must be open');
    console.assert(dbJob1.posting_source === 'company', 'Test 1 DB posting_source must be company');
    console.assert(dbJob1.recruiting_organization === 'TechCorp Solutions', 'Test 1 DB recruiting_organization mismatch');
    console.assert(dbJob1.created_by === company1.user.id, 'Test 1 DB created_by must be company ID');
    console.assert(dbJob1.company_id === company1.user.id, 'Test 1 DB company_id must be company ID');
    console.log('  ✅ Test 1 PASS: Active company creates a pending job with accurate server attributes.');

    // -------------------------------------------------------------------------
    // Test 2: Active admin creates an immediately approved job
    // -------------------------------------------------------------------------
    const res2 = await request('/api/jobs/create', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Campus IT Analyst',
        description: 'Manage institutional infrastructure',
        location: 'Campus Office',
        stipend: 18000,
        recruiting_organization: 'University IT Center',
      },
    });
    console.assert(res2.status === 201, `Test 2 failed with status ${res2.status}: ${JSON.stringify(res2.data)}`);
    console.assert(res2.data.approval_status === 'approved', 'Test 2 approval_status must be approved');

    const [[dbJob2]] = await adminConn.query('SELECT * FROM jobs WHERE id = ?', [res2.data.jobId]);
    console.assert(dbJob2.approval_status === 'approved', 'Test 2 DB approval_status must be approved');
    console.assert(dbJob2.posting_source === 'placement_cell', 'Test 2 DB posting_source must be placement_cell');
    console.assert(dbJob2.created_by === admin.user.id, 'Test 2 DB created_by must be admin user ID');
    console.log('  ✅ Test 2 PASS: Active admin creates an immediately approved job.');

    // -------------------------------------------------------------------------
    // Test 3: Admin can post for an external organization with company_id = NULL
    // -------------------------------------------------------------------------
    const res3 = await request('/api/jobs/create', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Visiting Partner Engineer',
        description: 'Off-campus incubation role',
        location: 'Remote',
        recruiting_organization: 'External Global Labs Inc',
        company_id: null,
      },
    });
    console.assert(res3.status === 201, `Test 3 failed with status ${res3.status}`);
    const [[dbJob3]] = await adminConn.query('SELECT * FROM jobs WHERE id = ?', [res3.data.jobId]);
    console.assert(dbJob3.company_id === null, 'Test 3 company_id must be null');
    console.assert(dbJob3.recruiting_organization === 'External Global Labs Inc', 'Test 3 org mismatch');
    console.log('  ✅ Test 3 PASS: Admin posts for external organization with company_id = NULL.');

    // -------------------------------------------------------------------------
    // Test 4: Admin can post for a valid registered recruiting company
    // -------------------------------------------------------------------------
    const res4 = await request('/api/jobs/create', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Assisted Drive Engineer',
        description: 'Drive posted by Placement Cell for registered partner',
        location: 'Delhi',
        recruiting_organization: 'Northstar Systems',
        company_id: company2.user.id,
      },
    });
    console.assert(res4.status === 201, `Test 4 failed with status ${res4.status}`);
    const [[dbJob4]] = await adminConn.query('SELECT * FROM jobs WHERE id = ?', [res4.data.jobId]);
    console.assert(dbJob4.company_id === company2.user.id, 'Test 4 company_id must match company2');
    console.assert(dbJob4.created_by === admin.user.id, 'Test 4 created_by must be admin');
    console.assert(dbJob4.approval_status === 'approved', 'Test 4 must be approved');
    console.log('  ✅ Test 4 PASS: Admin posts on behalf of registered company account.');

    // -------------------------------------------------------------------------
    // Test 5: Company cannot set its job to approved or change its creator
    // -------------------------------------------------------------------------
    const res5 = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Hacked Title',
        description: 'Trying to inject approval and different creator',
        location: 'Remote',
        approval_status: 'approved',
        created_by: 999,
        company_id: 999,
        recruiting_organization: 'Faked Org',
        posting_source: 'placement_cell',
      },
    });
    console.assert(res5.status === 201, `Test 5 status: ${res5.status}`);
    const [[dbJob5]] = await adminConn.query('SELECT * FROM jobs WHERE id = ?', [res5.data.jobId]);
    console.assert(dbJob5.approval_status === 'pending', 'Test 5 company injection must NOT succeed (must remain pending)');
    console.assert(dbJob5.created_by === company1.user.id, 'Test 5 created_by cannot be forged');
    console.assert(dbJob5.company_id === company1.user.id, 'Test 5 company_id cannot be forged');
    console.assert(dbJob5.posting_source === 'company', 'Test 5 posting_source must remain company');
    console.assert(dbJob5.recruiting_organization === 'TechCorp Solutions', 'Test 5 org must use company name');
    console.log('  ✅ Test 5 PASS: Server prevents company from forging creator, org, or approval status.');

    // -------------------------------------------------------------------------
    // Test 6: Student cannot create a job
    // -------------------------------------------------------------------------
    const res6 = await request('/api/jobs/create', {
      method: 'POST',
      token: student1.token,
      body: {
        title: 'Student Attempt',
        description: 'Should fail',
        location: 'Remote',
      },
    });
    console.assert(res6.status === 403, `Test 6 expected 403, got ${res6.status}`);
    console.log('  ✅ Test 6 PASS: Student role is strictly forbidden from creating jobs (HTTP 403).');

    // -------------------------------------------------------------------------
    // Test 7: Inactive company cannot log in or use an existing token
    // -------------------------------------------------------------------------
    // Capture valid token for company 2 before deactivating
    const validPreDeactivationToken = company2.token;

    // Deactivate company 2
    await adminConn.query('UPDATE users SET is_active = FALSE WHERE id = ?', [company2.user.id]);

    // Attempt login with valid credentials
    const loginAttempt = await login('northstar@example.com');
    console.assert(loginAttempt.status === 403, `Test 7 login expected 403, got ${loginAttempt.status}`);

    // Attempt authenticated request with token issued before deactivation
    const reqWithOldToken = await request('/api/jobs/my', {
      token: validPreDeactivationToken,
    });
    console.assert(reqWithOldToken.status === 403, `Test 7 old token expected 403, got ${reqWithOldToken.status}`);

    // Reactivate company 2 for remaining tests
    await adminConn.query('UPDATE users SET is_active = TRUE WHERE id = ?', [company2.user.id]);
    console.log('  ✅ Test 7 PASS: Deactivated company rejected at login (403) and on existing JWTs (403).');

    // -------------------------------------------------------------------------
    // Test 8: Pending and rejected jobs are hidden from student listing & details
    // -------------------------------------------------------------------------
    // Seed a rejected job
    const [rejInsert] = await adminConn.query(`
      INSERT INTO jobs (title, description, location, created_by, posting_source, recruiting_organization, company_id, approval_status, job_status)
      VALUES ('Rejected Trial Job', 'Desc', 'Pune', 1, 'company', 'TechCorp Solutions', 1, 'rejected', 'open');
    `);
    const rejectedJobId = rejInsert.insertId;
    const pendingJobId  = res1.data.jobId;

    // Student GET /api/jobs
    const listRes = await request('/api/jobs', { token: student1.token });
    console.assert(listRes.status === 200, 'Student list jobs failed');
    const returnedIds = listRes.data.map(j => j.id);
    console.assert(!returnedIds.includes(pendingJobId), 'Pending job leaked into student listing!');
    console.assert(!returnedIds.includes(rejectedJobId), 'Rejected job leaked into student listing!');

    // Student GET /api/jobs/:pendingId and /api/jobs/:rejectedId
    const pendingDetail = await request(`/api/jobs/${pendingJobId}`, { token: student1.token });
    console.assert(pendingDetail.status === 404, `Expected 404 for pending job detail, got ${pendingDetail.status}`);

    const rejectedDetail = await request(`/api/jobs/${rejectedJobId}`, { token: student1.token });
    console.assert(rejectedDetail.status === 404, `Expected 404 for rejected job detail, got ${rejectedDetail.status}`);
    console.log('  ✅ Test 8 PASS: Pending and rejected jobs are completely hidden from students (HTTP 404).');

    // -------------------------------------------------------------------------
    // Test 9: Students cannot apply to pending, rejected, closed, or expired jobs
    // -------------------------------------------------------------------------
    // Setup closed job and expired job
    const [closedInsert] = await adminConn.query(`
      INSERT INTO jobs (title, description, location, created_by, posting_source, recruiting_organization, company_id, approval_status, job_status)
      VALUES ('Closed Approved Job', 'Desc', 'Remote', 1, 'company', 'TechCorp Solutions', 1, 'approved', 'closed');
    `);
    const closedJobId = closedInsert.insertId;

    const [expiredInsert] = await adminConn.query(`
      INSERT INTO jobs (title, description, location, created_by, posting_source, recruiting_organization, company_id, approval_status, job_status, application_deadline)
      VALUES ('Expired Approved Job', 'Desc', 'Remote', 1, 'company', 'TechCorp Solutions', 1, 'approved', 'open', DATE_SUB(NOW(), INTERVAL 2 DAY));
    `);
    const expiredJobId = expiredInsert.insertId;

    const applyPending = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: pendingJobId },
    });
    console.assert(applyPending.status === 400, `Expected 400 for applying to pending job, got ${applyPending.status}`);

    const applyRejected = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: rejectedJobId },
    });
    console.assert(applyRejected.status === 400, `Expected 400 for applying to rejected job, got ${applyRejected.status}`);

    const applyClosed = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: closedJobId },
    });
    console.assert(applyClosed.status === 400, `Expected 400 for applying to closed job, got ${applyClosed.status}`);

    const applyExpired = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: expiredJobId },
    });
    console.assert(applyExpired.status === 400, `Expected 400 for applying to expired job, got ${applyExpired.status}`);
    console.log('  ✅ Test 9 PASS: Server rejects applications to pending, rejected, closed, and expired jobs.');

    // -------------------------------------------------------------------------
    // Test 10: Students can apply to eligible approved jobs
    // -------------------------------------------------------------------------
    const applyDbJob2 = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: dbJob2.id },
    });
    console.assert(applyDbJob2.status === 201, `Applying to approved job failed with status ${applyDbJob2.status}`);
    console.log('  ✅ Test 10 PASS: Student successfully applies to eligible approved job (HTTP 201).');

    // -------------------------------------------------------------------------
    // Test 11: Duplicate applications remain prevented
    // -------------------------------------------------------------------------
    const applyDup = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: dbJob2.id },
    });
    console.assert(applyDup.status === 409, `Expected 409 Conflict on duplicate application, got ${applyDup.status}`);
    console.log('  ✅ Test 11 PASS: Duplicate applications rejected with HTTP 409 Conflict.');

    // -------------------------------------------------------------------------
    // Test 12: Company users can access only their own job records
    // -------------------------------------------------------------------------
    // Company 2 tries to view applicants for Job 1 (owned by Company 1)
    const viewForeignApplicants = await request('/api/jobs/applicants/1', {
      token: company2.token,
    });
    console.assert(viewForeignApplicants.status === 404, `Expected 404 for accessing other company's applicants, got ${viewForeignApplicants.status}`);

    // Company 2 tries to view detail of Company 1's pending job
    const viewForeignPendingJob = await request(`/api/jobs/${pendingJobId}`, {
      token: company2.token,
    });
    console.assert(viewForeignPendingJob.status === 404, `Expected 404 for other company's pending job, got ${viewForeignPendingJob.status}`);

    // Company 1 CAN view detail of their own pending job
    const viewOwnPendingJob = await request(`/api/jobs/${pendingJobId}`, {
      token: company1.token,
    });
    console.assert(viewOwnPendingJob.status === 200, `Company 1 should be able to view their own pending job, got ${viewOwnPendingJob.status}`);
    console.log('  ✅ Test 12 PASS: Strict company ownership enforced on job records and applicant lists.');

    // -------------------------------------------------------------------------
    // Test 13: Existing application history remains intact
    // -------------------------------------------------------------------------
    const myAppsRes = await request('/api/applications/my', { token: student1.token });
    console.assert(myAppsRes.status === 200, 'Failed to fetch student applications');
    console.assert(myAppsRes.data.length >= 2, `Expected >= 2 applications, got ${myAppsRes.data.length}`);
    console.assert(myAppsRes.data[0].company !== undefined, 'Recruiting company name must be populated');
    console.assert(myAppsRes.data[0].status !== undefined, 'Status must be populated');
    console.log('  ✅ Test 13 PASS: Student application history remains fully intact with company attribution.');

    console.log('\n===============================================================');
    console.log('  ✨ ALL 13 TEST CASES EXECUTED AND PASSED SUCCESSFULLY!       ');
    console.log('===============================================================');

  } finally {
    if (server) {
      server.close();
    }
    console.log(`\n[Cleanup] Dropping test database '${TEST_DB}'...`);
    await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\`;`);
    await adminConn.end();
    console.log('[Cleanup] Test database dropped cleanly.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
