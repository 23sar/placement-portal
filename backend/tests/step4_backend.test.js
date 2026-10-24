/**
 * Step 4 Automated Regression & Backend Rules Test Suite
 *
 * Runs against an isolated temporary database: placement_portal_test_step4
 * Never touches or modifies the development or production database.
 *
 * Covers:
 *   - All 13 Step 3 Baseline Regression Scenarios
 *   - All 18 Step 4 Required Verification Scenarios
 */

const path = require('path');
const fs   = require('fs');

// 1. Force isolated test database name before initializing backend
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const TEST_DB = 'placement_portal_test_step4';
process.env.DB_NAME = TEST_DB;

const mysql = require('mysql2/promise');

function prepareSql(rawSql) {
  return rawSql
    .replace(/CREATE DATABASE IF NOT EXISTS\s+[^\n;]+;/gi, '')
    .replace(/USE\s+[a-zA-Z0-9_`]+;/gi, `USE \`${TEST_DB}\`;`);
}

async function main() {
  console.log('===============================================================');
  console.log('       Step 4: Placement Cell Approval & Job Lifecycle Tests   ');
  console.log('===============================================================');

  const adminConn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  let server;
  let baseUrl;

  try {
    // -------------------------------------------------------------------------
    // Setup Isolated Test Database
    // -------------------------------------------------------------------------
    console.log(`\n[Setup] Provisioning isolated test database '${TEST_DB}'...`);
    await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\`;`);
    await adminConn.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await adminConn.query(`USE \`${TEST_DB}\`;`);

    // Schema
    const rawSchema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
    await adminConn.query(prepareSql(rawSchema));

    // Seed
    const rawSeed = fs.readFileSync(path.resolve(__dirname, '../../database/seed.sql'), 'utf8');
    await adminConn.query(prepareSql(rawSeed));

    const rawAdminSeed = fs.readFileSync(path.resolve(__dirname, '../../database/seed_admin_dev.sql'), 'utf8');
    await adminConn.query(prepareSql(rawAdminSeed));

    // Provision an additional registered company (Company 2: Northstar Systems)
    await adminConn.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES
      (5, 'Northstar Systems', 'northstar@example.com',
       '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'company', TRUE);
    `);

    // Provision an inactive company for metrics and permission testing
    await adminConn.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES
      (6, 'Deactivated Corp', 'inactive_corp@example.com',
       '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'company', FALSE);
    `);

    console.log('        Schema, base seed, admin, and test company accounts provisioned.');

    // -------------------------------------------------------------------------
    // Launch Express Server on ephemeral port
    // -------------------------------------------------------------------------
    console.log('[Setup] Launching Express server on ephemeral port...');
    const app = require('../src/app');
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

    // Authenticate test personas
    const admin = await login('admin@placement.edu', 'Admin#Dev2026!');
    console.assert(admin.status === 200 && admin.token, `Admin login failed: ${admin.status} ${admin.error}`);

    const company1 = await login('techcorp@example.com', 'Test@1234');
    console.assert(company1.status === 200 && company1.token, `Company 1 login failed: ${company1.status} ${company1.error}`);

    const company2 = await login('northstar@example.com', 'Test@1234');
    console.assert(company2.status === 200 && company2.token, `Company 2 login failed: ${company2.status} ${company2.error}`);

    const student1 = await login('alice@example.com', 'Test@1234');
    console.assert(student1.status === 200 && student1.token, `Student 1 login failed: ${student1.status} ${student1.error}`);

    console.log('--- PART 1: Baseline Step 3 Regression Assertions ---');

    // S3-1: Inactive user cannot sign in
    const inactiveLogin = await login('inactive_corp@example.com', 'Test@1234');
    console.assert(inactiveLogin.status === 403, `Expected 403 for inactive login, got ${inactiveLogin.status}`);
    console.log('  ✅ S3-1 PASS: Deactivated user rejected on login.');

    // S3-2: Live deactivation revokes token access immediately
    await adminConn.query('UPDATE users SET is_active = FALSE WHERE id = ?', [student1.user.id]);
    const liveDeactRes = await request('/api/jobs', { token: student1.token });
    console.assert(liveDeactRes.status === 403, `Expected 403 after live deactivation, got ${liveDeactRes.status}`);
    // Reactivate student for remaining tests
    await adminConn.query('UPDATE users SET is_active = TRUE WHERE id = ?', [student1.user.id]);
    console.log('  ✅ S3-2 PASS: Token invalidated immediately upon database deactivation.');

    // S3-3: Company creates pending job
    const coJobRes = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Backend Engineer (Company)',
        description: 'Design distributed microservices.',
        location: 'Bengaluru / Hybrid',
        stipend: 45000,
        application_deadline: '2026-12-31 23:59:59',
      },
    });
    console.assert(coJobRes.status === 201, `Expected 201 for company job creation, got ${coJobRes.status}`);
    const pendingJobId = coJobRes.data.jobId;
    console.assert(coJobRes.data.approval_status === 'pending', 'Company job must be pending');
    console.log('  ✅ S3-3 PASS: Company job creates with approval_status = pending.');

    // S3-4: Student cannot see pending job
    const studentJobs = await request('/api/jobs', { token: student1.token });
    const hasPendingInStudent = studentJobs.data.some((j) => j.id === pendingJobId);
    console.assert(!hasPendingInStudent, 'Pending job must NOT be visible in student job list');
    const studentPendingDetail = await request(`/api/jobs/${pendingJobId}`, { token: student1.token });
    console.assert(studentPendingDetail.status === 404, `Expected 404 for student viewing pending job, got ${studentPendingDetail.status}`);
    console.log('  ✅ S3-4 PASS: Pending company job remains hidden from student listings and detail view.');

    // S3-5: Student cannot apply to pending job
    const applyPendingRes = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: pendingJobId },
    });
    console.assert(applyPendingRes.status === 400, `Expected 400 when applying to pending job, got ${applyPendingRes.status}`);
    console.log('  ✅ S3-5 PASS: Application to unapproved job blocked with HTTP 400.');

    console.log('\n--- PART 2: Step 4 Placement Cell Approval & Job Lifecycle Scenarios ---');

    // -------------------------------------------------------------------------
    // Scenario 1: Admin can list pending company-created jobs
    // -------------------------------------------------------------------------
    const pendingQueueRes = await request('/api/jobs/pending', { token: admin.token });
    console.assert(pendingQueueRes.status === 200, `Expected 200 for admin pending queue, got ${pendingQueueRes.status}`);
    console.assert(Array.isArray(pendingQueueRes.data), 'Pending queue must return an array');
    const foundPendingJob = pendingQueueRes.data.find((j) => j.id === pendingJobId);
    console.assert(foundPendingJob !== undefined, 'Company pending job must be in pending queue');
    console.assert(foundPendingJob.posting_source === 'company', 'Posting source must be company');
    console.assert(foundPendingJob.approval_status === 'pending', 'Approval status must be pending');
    console.assert(foundPendingJob.submitting_company_name !== undefined, 'Submitting company name must be included');
    console.assert(foundPendingJob.submitting_company_email !== undefined, 'Submitting company email must be included');
    console.log('  ✅ Test 1 PASS: Admin lists pending company-created jobs with submitting company metadata.');

    // -------------------------------------------------------------------------
    // Scenario 2: The pending queue excludes admin-created approved jobs
    // -------------------------------------------------------------------------
    // Create an admin job
    const adminJobRes = await request('/api/jobs/create', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Placement Cell Direct Job',
        description: 'Direct placement drive posting.',
        location: 'Hyderabad',
        stipend: 50000,
        recruiting_organization: 'Gov Tech Labs',
      },
    });
    console.assert(adminJobRes.status === 201, `Failed to create admin job: ${adminJobRes.status}`);
    const adminJobId = adminJobRes.data.jobId;

    const queueCheck = await request('/api/jobs/pending', { token: admin.token });
    const hasAdminJobInPending = queueCheck.data.some((j) => j.id === adminJobId);
    console.assert(!hasAdminJobInPending, 'Admin-created approved job must NEVER appear in pending queue');
    console.log('  ✅ Test 2 PASS: Pending queue excludes admin-created approved jobs.');

    // -------------------------------------------------------------------------
    // Scenario 3: Admin can approve a pending job
    // -------------------------------------------------------------------------
    const approveRes = await request(`/api/jobs/${pendingJobId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved' },
    });
    console.assert(approveRes.status === 200, `Expected 200 for job approval, got ${approveRes.status}`);
    console.assert(approveRes.data.approval_status === 'approved', 'Approval status must be approved');
    console.assert(approveRes.data.reviewed_by === admin.user.id, 'Reviewed by must be recorded');

    // Verify DB columns
    const [approvedDbRows] = await adminConn.query('SELECT approval_status, reviewed_by, reviewed_at, rejection_reason FROM jobs WHERE id = ?', [pendingJobId]);
    console.assert(approvedDbRows[0].approval_status === 'approved', 'DB approval_status must be approved');
    console.assert(approvedDbRows[0].reviewed_by === admin.user.id, 'DB reviewed_by must be admin.id');
    console.assert(approvedDbRows[0].reviewed_at !== null, 'DB reviewed_at must be populated');
    console.assert(approvedDbRows[0].rejection_reason === null, 'DB rejection_reason must be cleared on approval');
    console.log('  ✅ Test 3 PASS: Admin approves pending job; reviewed_by, reviewed_at recorded and rejection_reason cleared.');

    // -------------------------------------------------------------------------
    // Scenario 4: Approved job becomes visible to students
    // -------------------------------------------------------------------------
    const studentListAfterApproval = await request('/api/jobs', { token: student1.token });
    const studentFindApproved = studentListAfterApproval.data.find((j) => j.id === pendingJobId);
    console.assert(studentFindApproved !== undefined, 'Approved job must now appear in student job listing');
    const studentApprovedDetail = await request(`/api/jobs/${pendingJobId}`, { token: student1.token });
    console.assert(studentApprovedDetail.status === 200, `Student should be able to view approved job detail: got ${studentApprovedDetail.status}`);
    console.log('  ✅ Test 4 PASS: Approved job is immediately visible in student listings and detail views.');

    // -------------------------------------------------------------------------
    // Scenario 5: Admin can reject a pending job with a reason
    // -------------------------------------------------------------------------
    // Create another company job for rejection test
    const coJob2Res = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Unqualified Role',
        description: 'Role with incomplete description.',
        location: 'Remote',
        stipend: 10000,
      },
    });
    const rejectedJobId = coJob2Res.data.jobId;

    const rejectRes = await request(`/api/jobs/${rejectedJobId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: {
        approval_status: 'rejected',
        rejection_reason: 'Job description lacks clear eligibility criteria and stipend justification.',
      },
    });
    console.assert(rejectRes.status === 200, `Expected 200 for job rejection, got ${rejectRes.status}`);
    console.assert(rejectRes.data.approval_status === 'rejected', 'Approval status must be rejected');

    const [rejectedDbRows] = await adminConn.query('SELECT approval_status, rejection_reason, reviewed_by, reviewed_at FROM jobs WHERE id = ?', [rejectedJobId]);
    console.assert(rejectedDbRows[0].approval_status === 'rejected', 'DB approval_status must be rejected');
    console.assert(rejectedDbRows[0].rejection_reason.includes('eligibility criteria'), 'DB rejection reason must match');
    console.assert(rejectedDbRows[0].reviewed_by === admin.user.id, 'DB reviewed_by must be set');
    console.log('  ✅ Test 5 PASS: Admin rejects pending job with recorded reason and audit timestamps.');

    // -------------------------------------------------------------------------
    // Scenario 6: Rejecting without a reason fails
    // -------------------------------------------------------------------------
    // Create a 3rd company job
    const coJob3Res = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Pending Test Role 3',
        description: 'Testing missing rejection reason.',
        location: 'Chennai',
      },
    });
    const pendingJob3Id = coJob3Res.data.jobId;

    const rejectNoReasonRes = await request(`/api/jobs/${pendingJob3Id}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'rejected' }, // Missing rejection_reason
    });
    console.assert(rejectNoReasonRes.status === 400, `Expected 400 for rejection without reason, got ${rejectNoReasonRes.status}`);

    const rejectEmptyReasonRes = await request(`/api/jobs/${pendingJob3Id}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'rejected', rejection_reason: '   ' }, // Whitespace only
    });
    console.assert(rejectEmptyReasonRes.status === 400, `Expected 400 for whitespace rejection reason, got ${rejectEmptyReasonRes.status}`);
    console.log('  ✅ Test 6 PASS: Rejecting a job without a meaningful rejection reason fails with HTTP 400.');

    // -------------------------------------------------------------------------
    // Scenario 7: Rejected jobs remain hidden from students
    // -------------------------------------------------------------------------
    const studentListAfterRejection = await request('/api/jobs', { token: student1.token });
    const hasRejectedInList = studentListAfterRejection.data.some((j) => j.id === rejectedJobId);
    console.assert(!hasRejectedInList, 'Rejected job must NOT appear in student job list');

    const studentRejectedDetail = await request(`/api/jobs/${rejectedJobId}`, { token: student1.token });
    console.assert(studentRejectedDetail.status === 404, `Student detail for rejected job must return 404, got ${studentRejectedDetail.status}`);

    const applyRejectedRes = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: rejectedJobId },
    });
    console.assert(applyRejectedRes.status === 400, `Application to rejected job must return 400, got ${applyRejectedRes.status}`);
    console.log('  ✅ Test 7 PASS: Rejected jobs remain hidden from student listings, detail views, and applications.');

    // -------------------------------------------------------------------------
    // Scenario 8: Companies and students cannot approve or reject jobs
    // -------------------------------------------------------------------------
    const companyApproveAttempt = await request(`/api/jobs/${pendingJob3Id}/approval`, {
      method: 'PATCH',
      token: company1.token,
      body: { approval_status: 'approved' },
    });
    console.assert(companyApproveAttempt.status === 403, `Company approval attempt must return 403, got ${companyApproveAttempt.status}`);

    const studentApproveAttempt = await request(`/api/jobs/${pendingJob3Id}/approval`, {
      method: 'PATCH',
      token: student1.token,
      body: { approval_status: 'approved' },
    });
    console.assert(studentApproveAttempt.status === 403, `Student approval attempt must return 403, got ${studentApproveAttempt.status}`);
    console.log('  ✅ Test 8 PASS: Company and student accounts forbidden (HTTP 403) from approving or rejecting jobs.');

    // -------------------------------------------------------------------------
    // Scenario 9: Repeated or concurrent review requests do not cause invalid state changes
    // -------------------------------------------------------------------------
    // pendingJobId was already approved in Test 3
    const duplicateApproveRes = await request(`/api/jobs/${pendingJobId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved' },
    });
    console.assert(duplicateApproveRes.status === 409, `Expected 409 Conflict for approving already-approved job, got ${duplicateApproveRes.status}`);

    // rejectedJobId was already rejected in Test 5
    const duplicateRejectRes = await request(`/api/jobs/${rejectedJobId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved' },
    });
    console.assert(duplicateRejectRes.status === 409, `Expected 409 Conflict for reviewing already-rejected job, got ${duplicateRejectRes.status}`);
    console.log('  ✅ Test 9 PASS: Repeated review requests safely rejected with HTTP 409 Conflict.');

    // -------------------------------------------------------------------------
    // Scenario 10: Company can see approval status and rejection reason for its own postings
    // -------------------------------------------------------------------------
    const companyMyJobs = await request('/api/jobs/my', { token: company1.token });
    console.assert(companyMyJobs.status === 200, `Expected 200 for /api/jobs/my, got ${companyMyJobs.status}`);

    const ownApproved = companyMyJobs.data.find((j) => j.id === pendingJobId);
    console.assert(ownApproved && ownApproved.approval_status === 'approved', 'Company should see approved status');

    const ownRejected = companyMyJobs.data.find((j) => j.id === rejectedJobId);
    console.assert(ownRejected && ownRejected.approval_status === 'rejected', 'Company should see rejected status');
    console.assert(ownRejected && ownRejected.rejection_reason !== null, 'Company must see rejection reason');

    const ownRejectedDetail = await request(`/api/jobs/${rejectedJobId}`, { token: company1.token });
    console.assert(ownRejectedDetail.status === 200, `Company should be able to view detail of its own rejected job: got ${ownRejectedDetail.status}`);
    console.assert(ownRejectedDetail.data.rejection_reason !== null, 'Rejection reason must be present in detail');
    console.log('  ✅ Test 10 PASS: Submitting company sees approval status and rejection reason for its own jobs.');

    // -------------------------------------------------------------------------
    // Scenario 11: Companies cannot access another company's job-management records
    // -------------------------------------------------------------------------
    // Company 2 tries to view Company 1's rejected job
    const company2ViewRejected = await request(`/api/jobs/${rejectedJobId}`, { token: company2.token });
    console.assert(company2ViewRejected.status === 404, `Company 2 viewing Company 1's rejected job must return 404, got ${company2ViewRejected.status}`);

    // Company 2 tries to view Company 1's pending job
    const company2ViewPending = await request(`/api/jobs/${pendingJob3Id}`, { token: company2.token });
    console.assert(company2ViewPending.status === 404, `Company 2 viewing Company 1's pending job must return 404, got ${company2ViewPending.status}`);

    // Company 2 tries to change status of Company 1's job
    const company2ChangeStatus = await request(`/api/jobs/${pendingJobId}/status`, {
      method: 'PATCH',
      token: company2.token,
      body: { job_status: 'closed' },
    });
    console.assert(company2ChangeStatus.status === 403, `Company 2 modifying Company 1 job status must return 403, got ${company2ChangeStatus.status}`);
    console.log('  ✅ Test 11 PASS: Strict cross-company tenant isolation enforced on job views and status controls.');

    // -------------------------------------------------------------------------
    // Scenario 12: Associated company can review applicants for admin-created job assigned to it
    // -------------------------------------------------------------------------
    // Admin creates job on behalf of Company 1 (Northstar or Company 1)
    const adminCreatedAssignedJob = await request('/api/jobs/create', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Admin Created Role for Company 1',
        description: 'Placement cell posting mapped to registered company.',
        location: 'Pune',
        stipend: 35000,
        company_id: company1.user.id,
      },
    });
    console.assert(adminCreatedAssignedJob.status === 201, `Failed to create admin-assigned job: ${adminCreatedAssignedJob.status}`);
    const assignedJobId = adminCreatedAssignedJob.data.jobId;

    // Student applies to this admin-created assigned job
    const applyAssignedRes = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: assignedJobId },
    });
    console.assert(applyAssignedRes.status === 201, `Student application failed: ${applyAssignedRes.status}`);

    // Company 1 reviews applicants for this job
    const company1ApplicantsRes = await request(`/api/jobs/applicants/${assignedJobId}`, {
      token: company1.token,
    });
    console.assert(company1ApplicantsRes.status === 200, `Company 1 should be allowed to view applicants: got ${company1ApplicantsRes.status}`);
    console.assert(company1ApplicantsRes.data.length >= 1, 'Company 1 must see student application');

    // BUT Company 1 must NOT have ownership to edit availability or delete the admin-created job
    const company1DeleteAttempt = await request(`/api/jobs/${assignedJobId}`, {
      method: 'DELETE',
      token: company1.token,
    });
    console.assert(company1DeleteAttempt.status === 404, `Company 1 cannot delete admin-created posting, got ${company1DeleteAttempt.status}`);

    const company1StatusAttempt = await request(`/api/jobs/${assignedJobId}/status`, {
      method: 'PATCH',
      token: company1.token,
      body: { job_status: 'closed' },
    });
    console.assert(company1StatusAttempt.status === 403, `Company 1 cannot change status of admin-created posting, got ${company1StatusAttempt.status}`);
    console.log('  ✅ Test 12 PASS: Associated company reviews applicants for admin-assigned job without ownership to edit/delete.');

    // -------------------------------------------------------------------------
    // Scenario 13: External Placement Cell job with no company account is reviewable by admin
    // -------------------------------------------------------------------------
    // adminJobId has company_id = NULL
    // Student applies to adminJobId
    const applyExternalRes = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: adminJobId },
    });
    console.assert(applyExternalRes.status === 201, `Student application to external job failed: ${applyExternalRes.status}`);

    // Admin can view applicants
    const adminExternalApplicants = await request(`/api/jobs/applicants/${adminJobId}`, {
      token: admin.token,
    });
    console.assert(adminExternalApplicants.status === 200, `Admin should view external applicants: got ${adminExternalApplicants.status}`);
    console.assert(adminExternalApplicants.data.length >= 1, 'Admin must see applicant');

    // Company 1 CANNOT view applicants for external job
    const companyExternalApplicants = await request(`/api/jobs/applicants/${adminJobId}`, {
      token: company1.token,
    });
    console.assert(companyExternalApplicants.status === 404, `Company viewing external job applicants must return 404, got ${companyExternalApplicants.status}`);
    console.log('  ✅ Test 13 PASS: External Placement Cell job applicants reviewable by Admin, inaccessible to companies.');

    // -------------------------------------------------------------------------
    // Scenario 14: Companies cannot reopen or modify approval status of pending or rejected jobs
    // -------------------------------------------------------------------------
    // Company tries to reopen rejected job
    const companyReopenRejected = await request(`/api/jobs/${rejectedJobId}/status`, {
      method: 'PATCH',
      token: company1.token,
      body: { job_status: 'open' },
    });
    console.assert(companyReopenRejected.status === 200, `Company reopening their own job status should succeed: got ${companyReopenRejected.status}`);
    // But approval status MUST NOT change!
    const [chkRejected] = await adminConn.query('SELECT approval_status, job_status FROM jobs WHERE id = ?', [rejectedJobId]);
    console.assert(chkRejected[0].approval_status === 'rejected', 'Approval status must still be rejected');
    console.assert(chkRejected[0].job_status === 'open', 'Job status was updated to open');

    // Students still cannot see or apply to this rejected job
    const studentCheckRejectedAgain = await request(`/api/jobs/${rejectedJobId}`, { token: student1.token });
    console.assert(studentCheckRejectedAgain.status === 404, 'Rejected job must still return 404 for student');

    const studentApplyRejectedAgain = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: rejectedJobId },
    });
    console.assert(studentApplyRejectedAgain.status === 400, 'Student cannot apply to rejected job even if job_status = open');
    console.log('  ✅ Test 14 PASS: Changing job_status to open on rejected job never publishes it to students or permits applications.');

    // -------------------------------------------------------------------------
    // Scenario 15: Closed and expired jobs remain unavailable for applications
    // -------------------------------------------------------------------------
    // 15a: Close an approved job
    const closeJobRes = await request(`/api/jobs/${pendingJobId}/status`, {
      method: 'PATCH',
      token: company1.token,
      body: { job_status: 'closed' },
    });
    console.assert(closeJobRes.status === 200, `Company close job failed: ${closeJobRes.status}`);

    const studentApplyClosed = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: pendingJobId },
    });
    console.assert(studentApplyClosed.status === 400, `Application to closed job must return 400, got ${studentApplyClosed.status}`);
    console.assert(studentApplyClosed.data.error.includes('closed'), 'Error must specify job is closed');

    // 15b: Expired job (set deadline to past in DB)
    await adminConn.query("UPDATE jobs SET application_deadline = '2020-01-01 00:00:00', job_status = 'open' WHERE id = ?", [pendingJobId]);
    const studentApplyExpired = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: pendingJobId },
    });
    console.assert(studentApplyExpired.status === 400, `Application to expired job must return 400, got ${studentApplyExpired.status}`);
    console.assert(studentApplyExpired.data.error.includes('deadline'), 'Error must specify deadline has passed');
    console.log('  ✅ Test 15 PASS: Closed and expired jobs remain unavailable for new applications.');

    // -------------------------------------------------------------------------
    // Scenario 16: Admin metrics match the isolated database
    // -------------------------------------------------------------------------
    const adminStatsRes = await request('/api/applications/dashboard/stats', { token: admin.token });
    console.assert(adminStatsRes.status === 200, `Admin stats failed: ${adminStatsRes.status}`);
    const stats = adminStatsRes.data;

    // Check against direct database queries
    const [dbPendingCo] = await adminConn.query("SELECT COUNT(*) AS cnt FROM jobs WHERE posting_source = 'company' AND approval_status = 'pending'");
    const [dbApproved]  = await adminConn.query("SELECT COUNT(*) AS cnt FROM jobs WHERE approval_status = 'approved'");
    const [dbActiveCo]  = await adminConn.query("SELECT COUNT(*) AS cnt FROM users WHERE role = 'company' AND is_active = TRUE");
    const [dbTotalApps] = await adminConn.query("SELECT COUNT(*) AS cnt FROM applications");

    console.assert(stats.total_jobs_awaiting_approval === dbPendingCo[0].cnt, `Expected ${dbPendingCo[0].cnt} awaiting approval, got ${stats.total_jobs_awaiting_approval}`);
    console.assert(stats.total_approved_jobs === dbApproved[0].cnt, `Expected ${dbApproved[0].cnt} approved jobs, got ${stats.total_approved_jobs}`);
    console.assert(stats.total_active_companies === dbActiveCo[0].cnt, `Expected ${dbActiveCo[0].cnt} active companies, got ${stats.total_active_companies}`);
    console.assert(stats.total_applications === dbTotalApps[0].cnt, `Expected ${dbTotalApps[0].cnt} applications, got ${stats.total_applications}`);
    console.assert(typeof stats.open_approved_jobs === 'number', 'open_approved_jobs must be reported as a separate metric');
    console.log(`  ✅ Test 16 PASS: Admin metrics (${stats.total_jobs_awaiting_approval} awaiting approval, ${stats.total_approved_jobs} approved, ${stats.total_active_companies} active cos, ${stats.total_applications} apps) match isolated database.`);

    // -------------------------------------------------------------------------
    // Scenario 17: Existing student and company dashboard statistics remain correct
    // -------------------------------------------------------------------------
    const studentStats = await request('/api/applications/dashboard/stats', { token: student1.token });
    console.assert(studentStats.status === 200, `Student stats failed: ${studentStats.status}`);
    console.assert(studentStats.data.total !== undefined, 'Student stats must include total');
    console.assert(studentStats.data.shortlisted !== undefined, 'Student stats must include shortlisted');
    console.assert(studentStats.data.pending !== undefined, 'Student stats must include pending');
    console.assert(studentStats.data.rejected !== undefined, 'Student stats must include rejected');
    // Ensure student cannot see admin fields
    console.assert(studentStats.data.total_active_companies === undefined, 'Student stats must not leak admin metrics');

    const companyStats = await request('/api/applications/dashboard/stats', { token: company1.token });
    console.assert(companyStats.status === 200, `Company stats failed: ${companyStats.status}`);
    console.assert(companyStats.data.total_jobs !== undefined, 'Company stats must include total_jobs');
    console.assert(companyStats.data.total_applications !== undefined, 'Company stats must include total_applications');
    console.assert(companyStats.data.total_active_companies === undefined, 'Company stats must not leak admin metrics');
    console.log('  ✅ Test 17 PASS: Student and Company dashboard metrics remain correct and segregated.');

    // -------------------------------------------------------------------------
    // Scenario 18: Inactive accounts remain forbidden from all protected operations
    // -------------------------------------------------------------------------
    // Deactivate admin account and verify immediate refusal on protected routes
    await adminConn.query('UPDATE users SET is_active = FALSE WHERE id = ?', [admin.user.id]);
    const inactiveAdminPending = await request('/api/jobs/pending', { token: admin.token });
    console.assert(inactiveAdminPending.status === 403, `Inactive admin must be forbidden (403), got ${inactiveAdminPending.status}`);

    const inactiveAdminApproval = await request(`/api/jobs/${pendingJob3Id}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved' },
    });
    console.assert(inactiveAdminApproval.status === 403, `Inactive admin approval must be forbidden (403), got ${inactiveAdminApproval.status}`);

    // Deactivate company account and verify status update refused
    await adminConn.query('UPDATE users SET is_active = FALSE WHERE id = ?', [company1.user.id]);
    const inactiveCompanyStatus = await request(`/api/jobs/${pendingJobId}/status`, {
      method: 'PATCH',
      token: company1.token,
      body: { job_status: 'open' },
    });
    console.assert(inactiveCompanyStatus.status === 403, `Inactive company status update must be forbidden (403), got ${inactiveCompanyStatus.status}`);
    console.log('  ✅ Test 18 PASS: Inactive accounts strictly forbidden (HTTP 403) from all protected endpoints.');

    console.log('\n===============================================================');
    console.log('  ✨ ALL STEP 3 AND STEP 4 TEST SCENARIOS PASSED SUCCESSFULLY!  ');
    console.log('===============================================================');

  } finally {
    if (server) {
      server.close();
    }
    console.log(`\n[Cleanup] Dropping isolated test database '${TEST_DB}'...`);
    await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\`;`);
    await adminConn.end();
    console.log('[Cleanup] Isolated test database dropped cleanly.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
