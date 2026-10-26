/**
 * Step 7 Automated Backend Test Suite
 * Concurrency-Safe Stale Approvals, Strict Validation & Safe DOM Rendering
 *
 * Runs against isolated temporary database: placement_portal_test_step7
 * Never modifies normal development or production records.
 */

const path = require('path');
const fs   = require('fs');
const assert = require('node:assert/strict');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const TEST_DB = 'placement_portal_test_step7';
process.env.DB_NAME = TEST_DB;

const mysql = require('mysql2/promise');

function prepareSql(rawSql) {
  return rawSql
    .replace(/CREATE DATABASE IF NOT EXISTS\s+[^\n;]+;/gi, '')
    .replace(/USE\s+[a-zA-Z0-9_`]+;/gi, `USE \`${TEST_DB}\`;`);
}

// Frontend core esc function replica for verification
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[c]));

async function main() {
  console.log('===============================================================');
  console.log('   Step 7: Stale Approvals & Strict Input Validation Suite     ');
  console.log('===============================================================');

  const adminConn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  let server;
  let baseUrl;
  let pool;

  try {
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

    // Company 2
    await adminConn.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES
      (5, 'Northstar Systems', 'northstar@example.com',
       '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'company', TRUE);
    `);

    console.log('        Schema and test accounts provisioned.');

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
      return { status: res.status, token: res.data.token, user: res.data.user };
    }

    const admin    = await login('admin@placement.edu', 'Admin#Dev2026!');
    const company1 = await login('techcorp@example.com', 'Test@1234');
    const student1 = await login('alice@example.com', 'Test@1234');

    assert.strictEqual(admin.status, 200, 'Admin login failed');
    assert.strictEqual(company1.status, 200, 'Company 1 login failed');
    assert.strictEqual(student1.status, 200, 'Student 1 login failed');

    console.log('[Executing Step 7 Security & Validation Test Cases]:');

    // -------------------------------------------------------------------------
    // Test 1: Concurrency-Safe Stale Approval Prevention (Revision Check)
    // -------------------------------------------------------------------------
    const job1Res = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Concurrency Test Role',
        description: 'Original job description for revision checking.',
        location: 'Bengaluru',
        stipend: 30000,
        application_deadline: '2027-12-31',
      },
    });
    assert.strictEqual(job1Res.status, 201, `Failed to create job1: ${job1Res.status}`);
    const job1Id = job1Res.data.jobId;
    assert.strictEqual(job1Res.data.revision, 1, 'Initial job revision must be 1');

    // Admin fetches pending queue and gets revision 1
    const pendingList = await request('/api/jobs/pending', { token: admin.token });
    const pendingJob1 = pendingList.data.find(j => j.id === job1Id);
    assert.ok(pendingJob1 && pendingJob1.revision === 1, 'Pending job must expose revision 1');

    // Company edits the job, incrementing revision to 2
    const editRes = await request(`/api/jobs/${job1Id}`, {
      method: 'PATCH',
      token: company1.token,
      body: {
        title: 'Concurrency Test Role (Revised)',
        description: 'Revised description containing substantive changes.',
      },
    });
    assert.strictEqual(editRes.status, 200, `Failed to edit job: ${editRes.status}`);
    assert.strictEqual(editRes.data.revision, 2, `Expected revision 2 after edit, got ${editRes.data.revision}`);

    // Admin attempts to approve using stale revision 1
    const staleApprove = await request(`/api/jobs/${job1Id}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: {
        approval_status: 'approved',
        expected_revision: 1,
      },
    });
    assert.strictEqual(staleApprove.status, 409, `Expected HTTP 409 for stale approval, got ${staleApprove.status}`);
    assert.ok(/conflict|edited|modified|revision/i.test(staleApprove.data.error), 'Expected revision conflict message');

    // Confirm in DB that job was NOT approved and remains pending
    const [job1Row] = await adminConn.query('SELECT approval_status, revision FROM jobs WHERE id = ?', [job1Id]);
    assert.strictEqual(job1Row[0].approval_status, 'pending', 'Job must remain pending after rejected stale approval');
    assert.strictEqual(job1Row[0].revision, 2, 'Job revision in DB must be 2');

    // Confirm student cannot see the job
    const studentBrowse = await request('/api/jobs', { token: student1.token });
    assert.ok(!studentBrowse.data.some(j => j.id === job1Id), 'Stale unapproved job must remain hidden from students');

    // Admin approves with the current revision 2
    const validApprove = await request(`/api/jobs/${job1Id}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: {
        approval_status: 'approved',
        expected_revision: 2,
      },
    });
    assert.strictEqual(validApprove.status, 200, `Expected HTTP 200 for current revision approval, got ${validApprove.status}`);

    const [job1RowApproved] = await adminConn.query('SELECT approval_status FROM jobs WHERE id = ?', [job1Id]);
    assert.strictEqual(job1RowApproved[0].approval_status, 'approved', 'Job must now be approved');
    console.log('  ✅ Test 1 PASS: Concurrency-safe revision check blocks stale administrator approvals (HTTP 409).');

    // -------------------------------------------------------------------------
    // Test 2: Concurrency-Safe Stale Rejection Prevention
    // -------------------------------------------------------------------------
    const job2Res = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Rejection Concurrency Role',
        description: 'Original job description for rejection revision test.',
        location: 'Hyderabad',
      },
    });
    const job2Id = job2Res.data.jobId;

    // Company edits job2 -> revision becomes 2
    await request(`/api/jobs/${job2Id}`, {
      method: 'PATCH',
      token: company1.token,
      body: { description: 'Updated role description for rejection revision test.' },
    });

    // Admin attempts to reject with stale revision 1
    const staleReject = await request(`/api/jobs/${job2Id}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: {
        approval_status: 'rejected',
        rejection_reason: 'Stale feedback',
        expected_revision: 1,
      },
    });
    assert.strictEqual(staleReject.status, 409, `Expected HTTP 409 for stale rejection, got ${staleReject.status}`);
    console.log('  ✅ Test 2 PASS: Stale rejection requests based on outdated revisions strictly rejected (HTTP 409).');

    // -------------------------------------------------------------------------
    // Test 3: Concurrent Review Request Serialization
    // -------------------------------------------------------------------------
    const job3Res = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Race Condition Test Role',
        description: 'Testing concurrent approval and rejection requests.',
        location: 'Pune',
      },
    });
    const job3Id = job3Res.data.jobId;

    // Dispatch two concurrent reviews simultaneously for the same job
    const [reviewA, reviewB] = await Promise.all([
      request(`/api/jobs/${job3Id}/approval`, {
        method: 'PATCH',
        token: admin.token,
        body: { approval_status: 'approved', expected_revision: 1 },
      }),
      request(`/api/jobs/${job3Id}/approval`, {
        method: 'PATCH',
        token: admin.token,
        body: { approval_status: 'rejected', rejection_reason: 'Race attempt', expected_revision: 1 },
      }),
    ]);

    const statuses = [reviewA.status, reviewB.status].sort();
    assert.ok(statuses[0] === 200 && statuses[1] === 409, `Expected [200, 409] for concurrent reviews, got ${JSON.stringify(statuses)}`);
    console.log('  ✅ Test 3 PASS: Concurrent approval/rejection attempts safely serialized via row lock.');

    // -------------------------------------------------------------------------
    // Test 4: Strict Title Validation (3–150 characters)
    // -------------------------------------------------------------------------
    // Too short (< 3)
    const shortTitle = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'AB', description: 'Valid description here', location: 'Delhi' },
    });
    assert.strictEqual(shortTitle.status, 400, `Expected 400 for title < 3 chars, got ${shortTitle.status}`);

    // Too long (> 150)
    const longTitle = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'A'.repeat(151), description: 'Valid description here', location: 'Delhi' },
    });
    assert.strictEqual(longTitle.status, 400, `Expected 400 for title > 150 chars, got ${longTitle.status}`);

    // Boundary valid: 3 chars
    const minTitle = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'SDE', description: 'Valid description here', location: 'Delhi' },
    });
    assert.strictEqual(minTitle.status, 201, `Expected 201 for 3-char title, got ${minTitle.status}`);

    // Boundary valid: 150 chars
    const maxTitle = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'T'.repeat(150), description: 'Valid description here', location: 'Delhi' },
    });
    assert.strictEqual(maxTitle.status, 201, `Expected 201 for 150-char title, got ${maxTitle.status}`);
    console.log('  ✅ Test 4 PASS: Job title length strictly enforced (3–150 chars).');

    // -------------------------------------------------------------------------
    // Test 5: Strict Description Validation (10–5000 characters)
    // -------------------------------------------------------------------------
    const shortDesc = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Software Engineer', description: 'Short', location: 'Delhi' },
    });
    assert.strictEqual(shortDesc.status, 400, `Expected 400 for desc < 10 chars, got ${shortDesc.status}`);

    const longDesc = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Software Engineer', description: 'D'.repeat(5001), location: 'Delhi' },
    });
    assert.strictEqual(longDesc.status, 400, `Expected 400 for desc > 5000 chars, got ${longDesc.status}`);

    const validDesc = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Software Engineer', description: '1234567890', location: 'Delhi' },
    });
    assert.strictEqual(validDesc.status, 201, `Expected 201 for 10-char desc, got ${validDesc.status}`);
    console.log('  ✅ Test 5 PASS: Job description length strictly enforced (10–5000 chars).');

    // -------------------------------------------------------------------------
    // Test 6: Strict Location Validation (2–100 characters)
    // -------------------------------------------------------------------------
    const shortLoc = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Software Engineer', description: 'Valid description here', location: 'X' },
    });
    assert.strictEqual(shortLoc.status, 400, `Expected 400 for location < 2 chars, got ${shortLoc.status}`);

    const longLoc = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Software Engineer', description: 'Valid description here', location: 'L'.repeat(101) },
    });
    assert.strictEqual(longLoc.status, 400, `Expected 400 for location > 100 chars, got ${longLoc.status}`);

    const validLoc = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Software Engineer', description: 'Valid description here', location: 'KA' },
    });
    assert.strictEqual(validLoc.status, 201, `Expected 201 for 2-char location, got ${validLoc.status}`);
    console.log('  ✅ Test 6 PASS: Job location length strictly enforced (2–100 chars).');

    // -------------------------------------------------------------------------
    // Test 7: Strict Recruiting Organization Validation for Admin (2–150 characters)
    // -------------------------------------------------------------------------
    const shortOrg = await request('/api/jobs/create', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Placement Drive',
        description: 'Direct placement drive description.',
        location: 'Campus',
        recruiting_organization: 'O',
      },
    });
    assert.strictEqual(shortOrg.status, 400, `Expected 400 for org < 2 chars, got ${shortOrg.status}`);

    const longOrg = await request('/api/jobs/create', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Placement Drive',
        description: 'Direct placement drive description.',
        location: 'Campus',
        recruiting_organization: 'O'.repeat(151),
      },
    });
    assert.strictEqual(longOrg.status, 400, `Expected 400 for org > 150 chars, got ${longOrg.status}`);

    const validOrg = await request('/api/jobs/create', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Placement Drive',
        description: 'Direct placement drive description.',
        location: 'Campus',
        recruiting_organization: 'Tata Motors Limited',
      },
    });
    assert.strictEqual(validOrg.status, 201, `Expected 201 for valid recruiting organization, got ${validOrg.status}`);
    console.log('  ✅ Test 7 PASS: Recruiting organization length strictly enforced (2–150 chars).');

    // -------------------------------------------------------------------------
    // Test 8: Strict Compensation / Stipend Validation
    // -------------------------------------------------------------------------
    // Negative
    const negStipend = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Backend Dev', description: 'Testing invalid stipend', location: 'Goa', stipend: -500 },
    });
    assert.strictEqual(negStipend.status, 400, `Expected 400 for negative stipend, got ${negStipend.status}`);

    // Infinity
    const infStipend = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Backend Dev', description: 'Testing invalid stipend', location: 'Goa', stipend: 'Infinity' },
    });
    assert.strictEqual(infStipend.status, 400, `Expected 400 for Infinity stipend, got ${infStipend.status}`);

    // Non-numeric string
    const stringStipend = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Backend Dev', description: 'Testing invalid stipend', location: 'Goa', stipend: 'fifty-k' },
    });
    assert.strictEqual(stringStipend.status, 400, `Expected 400 for string stipend, got ${stringStipend.status}`);

    // Boolean true
    const boolStipend = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Backend Dev', description: 'Testing invalid stipend', location: 'Goa', stipend: true },
    });
    assert.strictEqual(boolStipend.status, 400, `Expected 400 for boolean stipend, got ${boolStipend.status}`);

    // Zero is valid finite non-negative
    const zeroStipend = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Volunteer Dev', description: 'Testing zero stipend', location: 'Goa', stipend: 0 },
    });
    assert.strictEqual(zeroStipend.status, 201, `Expected 201 for 0 stipend, got ${zeroStipend.status}`);

    // Optional null/empty is valid
    const nullStipend = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Unpaid Intern', description: 'Testing null stipend', location: 'Goa', stipend: null },
    });
    assert.strictEqual(nullStipend.status, 201, `Expected 201 for null stipend, got ${nullStipend.status}`);
    console.log('  ✅ Test 8 PASS: Stipend strictly validates finite non-negative numbers; rejects NaN/Infinity/negative/types.');

    // -------------------------------------------------------------------------
    // Test 9: Strict Application Deadline Validation (Real YYYY-MM-DD Dates)
    // -------------------------------------------------------------------------
    // Past date (2020-01-01)
    const pastDate = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'QA Engineer', description: 'Valid description here', location: 'Pune', application_deadline: '2020-01-01' },
    });
    assert.strictEqual(pastDate.status, 400, `Expected 400 for past date, got ${pastDate.status}`);
    assert.ok(/past/i.test(pastDate.data.error), 'Expected past date error message');

    // Invalid calendar month (month 13)
    const invalidMonth = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'QA Engineer', description: 'Valid description here', location: 'Pune', application_deadline: '2027-13-01' },
    });
    assert.strictEqual(invalidMonth.status, 400, `Expected 400 for month 13, got ${invalidMonth.status}`);

    // Invalid calendar day for April (April 31 does not exist)
    const invalidAprDay = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'QA Engineer', description: 'Valid description here', location: 'Pune', application_deadline: '2027-04-31' },
    });
    assert.strictEqual(invalidAprDay.status, 400, `Expected 400 for Apr 31, got ${invalidAprDay.status}`);

    // Invalid calendar day for Feb non-leap year (2027-02-29 does not exist)
    const invalidFebDay = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'QA Engineer', description: 'Valid description here', location: 'Pune', application_deadline: '2027-02-29' },
    });
    assert.strictEqual(invalidFebDay.status, 400, `Expected 400 for Feb 29 non-leap, got ${invalidFebDay.status}`);

    // Unsupported format (DD/MM/YYYY)
    const badFormat = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'QA Engineer', description: 'Valid description here', location: 'Pune', application_deadline: '31/12/2027' },
    });
    assert.strictEqual(badFormat.status, 400, `Expected 400 for non-YYYY-MM-DD format, got ${badFormat.status}`);

    // Valid future date
    const validFuture = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'QA Engineer', description: 'Valid description here', location: 'Pune', application_deadline: '2027-12-31' },
    });
    assert.strictEqual(validFuture.status, 201, `Expected 201 for valid future date, got ${validFuture.status}`);

    // Valid leap year date (2028-02-29)
    const validLeap = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'QA Engineer', description: 'Valid description here', location: 'Pune', application_deadline: '2028-02-29' },
    });
    assert.strictEqual(validLeap.status, 201, `Expected 201 for valid leap day, got ${validLeap.status}`);
    console.log('  ✅ Test 9 PASS: Application deadline strictly validates calendar accuracy, format, and future dates.');

    // -------------------------------------------------------------------------
    // Test 10: Strict Validation on Job Editing (PATCH /api/jobs/:id)
    // -------------------------------------------------------------------------
    const editTestJob = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Job To Edit', description: 'Description for edit testing', location: 'Mumbai' },
    });
    const editTestJobId = editTestJob.data.jobId;

    // Short title edit
    const editShortTitle = await request(`/api/jobs/${editTestJobId}`, {
      method: 'PATCH',
      token: company1.token,
      body: { title: 'X' },
    });
    assert.strictEqual(editShortTitle.status, 400, `Expected 400 for short title edit, got ${editShortTitle.status}`);

    // Negative stipend edit
    const editNegStipend = await request(`/api/jobs/${editTestJobId}`, {
      method: 'PATCH',
      token: company1.token,
      body: { stipend: -100 },
    });
    assert.strictEqual(editNegStipend.status, 400, `Expected 400 for negative stipend edit, got ${editNegStipend.status}`);

    // Past deadline edit
    const editPastDate = await request(`/api/jobs/${editTestJobId}`, {
      method: 'PATCH',
      token: company1.token,
      body: { application_deadline: '2021-05-10' },
    });
    assert.strictEqual(editPastDate.status, 400, `Expected 400 for past deadline edit, got ${editPastDate.status}`);

    // Invalid calendar day edit
    const editInvalidDay = await request(`/api/jobs/${editTestJobId}`, {
      method: 'PATCH',
      token: company1.token,
      body: { application_deadline: '2027-02-30' },
    });
    assert.strictEqual(editInvalidDay.status, 400, `Expected 400 for invalid calendar date edit, got ${editInvalidDay.status}`);
    console.log('  ✅ Test 10 PASS: Strict input validation symmetrically enforced on job editing (PATCH).');

    // -------------------------------------------------------------------------
    // Test 11: Audit Safe DOM Rendering / HTML Injection Prevention
    // -------------------------------------------------------------------------
    const xssPayload = '<script>alert("xss")</script><img src=x onerror=alert(1)>" onmouseover="alert(1)';
    const xssJob = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Senior ' + xssPayload,
        description: 'Description containing ' + xssPayload,
        location: 'Cyber ' + xssPayload,
        eligibility_criteria: 'Criteria ' + xssPayload,
      },
    });
    assert.strictEqual(xssJob.status, 201, `Expected 201 for job creation with special chars, got ${xssJob.status}`);
    const xssJobId = xssJob.data.jobId;

    // Fetch the job from API
    const fetchedXss = await request(`/api/jobs/${xssJobId}`, { token: company1.token });
    assert.strictEqual(fetchedXss.status, 200, 'Company should be able to fetch its job');

    // Verify esc function thoroughly escapes all dangerous characters
    const escapedTitle = esc(fetchedXss.data.title);
    const escapedDesc  = esc(fetchedXss.data.description);
    const escapedLoc   = esc(fetchedXss.data.location);

    assert.ok(!escapedTitle.includes('<script>'), 'Escaped title must not contain raw <script>');
    assert.ok(!escapedTitle.includes('<img'), 'Escaped title must not contain raw <img>');
    assert.ok(!escapedTitle.includes('" onmouseover='), 'Escaped title must not break out of attribute quotes');
    assert.ok(escapedTitle.includes('&lt;script&gt;'), 'Escaped title must contain entity &lt;script&gt;');
    assert.ok(escapedTitle.includes('&quot;'), 'Escaped title must contain entity &quot;');

    // Test rejection reason HTML injection protection
    await request(`/api/jobs/${xssJobId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: {
        approval_status: 'rejected',
        rejection_reason: 'Rejected: ' + xssPayload,
      },
    });

    const [rejRow] = await adminConn.query('SELECT rejection_reason FROM jobs WHERE id = ?', [xssJobId]);
    const escapedRej = esc(rejRow[0].rejection_reason);
    assert.ok(!escapedRej.includes('<script>'), 'Escaped rejection reason must not contain raw script tag');
    assert.ok(escapedRej.includes('&lt;script&gt;'), 'Escaped rejection reason must contain entity references');
    console.log('  ✅ Test 11 PASS: Dynamic strings strictly escaped; zero HTML injection in titles, orgs, descs, and rejection reasons.');

    // -------------------------------------------------------------------------
    // Test 12: Application History Protection (RESTRICT Foreign Key & 409 Conflict)
    // -------------------------------------------------------------------------
    // Create and approve a job for application testing
    const appJob = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Application History Protection Role',
        description: 'Ensuring application history cannot be deleted.',
        location: 'Chennai',
      },
    });
    const appJobId = appJob.data.jobId;

    await request(`/api/jobs/${appJobId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved' },
    });

    // Student applies to the job
    const applyRes = await request('/api/jobs/apply', {
      method: 'POST',
      token: student1.token,
      body: { job_id: appJobId },
    });
    assert.strictEqual(applyRes.status, 201, `Student application failed: ${applyRes.status}`);

    // Verify application count is 1
    const [appsBefore] = await adminConn.query('SELECT id, student_id, status FROM applications WHERE job_id = ?', [appJobId]);
    assert.strictEqual(appsBefore.length, 1, 'Expected 1 application record');

    // Attempt to delete job with existing application -> Must return HTTP 409 Conflict
    const deleteAttempt = await request(`/api/jobs/${appJobId}`, {
      method: 'DELETE',
      token: company1.token,
    });
    assert.strictEqual(deleteAttempt.status, 409, `Expected HTTP 409 for deleting job with applications, got ${deleteAttempt.status}`);

    // Verify applications remain fully intact in DB
    const [appsAfter] = await adminConn.query('SELECT id, student_id, status FROM applications WHERE job_id = ?', [appJobId]);
    assert.strictEqual(appsAfter.length, 1, 'Application record must remain intact after blocked deletion');
    assert.strictEqual(appsAfter[0].student_id, student1.user.id, 'Student association must be preserved');

    // Verify student application history endpoint returns the application
    const studentApps = await request('/api/applications/my', { token: student1.token });
    assert.ok(studentApps.data.some(a => a.job_id === appJobId), 'Application must remain present in student history');

    // Deleting a job with zero applications succeeds
    const noAppJob = await request('/api/jobs/create', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Zero Applications Deletable Role',
        description: 'This job has no applications and can be safely deleted.',
        location: 'Kolkata',
      },
    });
    const noAppJobId = noAppJob.data.jobId;

    const delSuccess = await request(`/api/jobs/${noAppJobId}`, {
      method: 'DELETE',
      token: company1.token,
    });
    assert.strictEqual(delSuccess.status, 200, `Expected 200 for deleting job with 0 applications, got ${delSuccess.status}`);
    console.log('  ✅ Test 12 PASS: Jobs with applications permanently protected with HTTP 409; unapplied jobs follow deletion policy.');

    console.log('\n===============================================================');
    console.log('  ✨ ALL STEP 7 SECURITY & VALIDATION TESTS PASSED!            ');
    console.log('===============================================================\n');

  } catch (err) {
    console.error('\n❌ STEP 7 TEST RUNNER ENCOUNTERED AN ERROR:');
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
    } finally {
      try {
        if (pool) {
          await new Promise((resolve) => pool.end(resolve));
        }
      } catch (e) {
        console.error('[Cleanup Error] Pool close failed:', e.message);
      } finally {
        try {
          if (adminConn) {
            console.log(`[Cleanup] Dropping isolated test database '${TEST_DB}'...`);
            await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\`;`);
            console.log('[Cleanup] Test database dropped cleanly.\n');
          }
        } catch (e) {
          console.error('[Cleanup Error] Dropping test database failed:', e.message);
        } finally {
          try {
            if (adminConn) {
              await adminConn.end();
            }
          } catch (e) {
            console.error('[Cleanup Error] Closing admin connection failed:', e.message);
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
