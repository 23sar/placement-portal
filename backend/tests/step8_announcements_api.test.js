/**
 * Step 8.6: Announcements API Test Suite
 * Concurrency-Safe Approvals, Role Segregation, Strict Input Validation & Tenant Isolation
 *
 * Runs against isolated temporary database: placement_portal_test_step8_announcements
 * Never modifies normal development or production databases.
 */

const path = require('path');
const fs   = require('fs');
const assert = require('node:assert/strict');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const TEST_DB = 'placement_portal_test_step8_announcements';
process.env.DB_NAME = TEST_DB;

const mysql = require('mysql2/promise');

function prepareSql(rawSql) {
  return rawSql
    .replace(/CREATE DATABASE IF NOT EXISTS\s+[^\n;]+;/gi, '')
    .replace(/USE\s+[a-zA-Z0-9_`]+;/gi, `USE \`${TEST_DB}\`;`);
}

async function main() {
  console.log('===============================================================');
  console.log('   Step 8.6: Announcements Backend & Approval Workflow Suite   ');
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
    console.log(`\n[Setup] Provisioning isolated database '${TEST_DB}'...`);
    await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\`;`);
    await adminConn.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await adminConn.query(`USE \`${TEST_DB}\`;`);

    // Schema
    const schema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
    await adminConn.query(prepareSql(schema));

    // Seeds
    const seed = fs.readFileSync(path.resolve(__dirname, '../../database/seed.sql'), 'utf8');
    await adminConn.query(prepareSql(seed));

    const adminSeedPath = path.resolve(__dirname, '../../database/seed_admin_dev.sql');
    if (fs.existsSync(adminSeedPath)) {
      const adminSeed = fs.readFileSync(adminSeedPath, 'utf8');
      await adminConn.query(prepareSql(adminSeed));
    }

    // Provision Company 2 (Northstar Systems, id: 5)
    await adminConn.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES
      (5, 'Northstar Systems', 'northstar@example.com',
       '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'company', TRUE);
    `);

    // Provision Deactivated Student (id: 6)
    await adminConn.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES
      (6, 'Deactivated Student', 'deactivated@example.com',
       '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'student', FALSE);
    `);

    console.log('        Schema and seed accounts provisioned.');

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
      const headers = {};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
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
    const company2 = await login('northstar@example.com', 'Test@1234');
    const student1 = await login('alice@example.com', 'Test@1234');

    assert.strictEqual(admin.status, 200, 'Admin login failed');
    assert.strictEqual(company1.status, 200, 'Company 1 login failed');
    assert.strictEqual(company2.status, 200, 'Company 2 login failed');
    assert.strictEqual(student1.status, 200, 'Student 1 login failed');

    console.log('[Executing Step 8.6 Announcements Test Cases]:');

    // -------------------------------------------------------------------------
    // Test 1: Unauthenticated Requests & Deactivated Accounts
    // -------------------------------------------------------------------------
    const unauthGet = await request('/api/announcements');
    assert.strictEqual(unauthGet.status, 401, 'Unauthenticated GET /api/announcements must be 401');

    const unauthPost = await request('/api/announcements', {
      method: 'POST',
      body: { title: 'Test Title', content: 'Test Content long enough' },
    });
    assert.strictEqual(unauthPost.status, 401, 'Unauthenticated POST /api/announcements must be 401');

    const unauthPending = await request('/api/announcements/pending');
    assert.strictEqual(unauthPending.status, 401, 'Unauthenticated pending queue access must be 401');

    // Deactivated user sign in rejected
    const deactLogin = await login('deactivated@example.com', 'Test@1234');
    assert.strictEqual(deactLogin.status, 403, 'Deactivated account login must return HTTP 403');

    console.log('  ✅ Test 1 PASS: Unauthenticated and deactivated requests strictly rejected.');

    // -------------------------------------------------------------------------
    // Test 2: Role Restrictions (Students and Companies cannot bypass controls)
    // -------------------------------------------------------------------------
    // Student cannot create announcements
    const studentCreate = await request('/api/announcements', {
      method: 'POST',
      token: student1.token,
      body: { title: 'Student Post', content: 'This should be forbidden for students' },
    });
    assert.strictEqual(studentCreate.status, 403, 'Student cannot create announcements (HTTP 403)');

    // Student cannot access pending queue
    const studentPending = await request('/api/announcements/pending', { token: student1.token });
    assert.strictEqual(studentPending.status, 403, 'Student cannot access pending queue (HTTP 403)');

    // Company cannot access pending queue
    const companyPending = await request('/api/announcements/pending', { token: company1.token });
    assert.strictEqual(companyPending.status, 403, 'Company cannot access pending queue (HTTP 403)');

    // Student cannot review approval
    const studentReview = await request('/api/announcements/1/approval', {
      method: 'PATCH',
      token: student1.token,
      body: { approval_status: 'approved' },
    });
    assert.strictEqual(studentReview.status, 403, 'Student cannot review approvals (HTTP 403)');

    // Company cannot review approval
    const companyReview = await request('/api/announcements/1/approval', {
      method: 'PATCH',
      token: company1.token,
      body: { approval_status: 'approved' },
    });
    assert.strictEqual(companyReview.status, 403, 'Company cannot review approvals (HTTP 403)');

    console.log('  ✅ Test 2 PASS: Role boundaries enforced: students and companies restricted from privileged endpoints.');

    // -------------------------------------------------------------------------
    // Test 3: Company Announcement Submission & Pending Approval Lifecycle
    // -------------------------------------------------------------------------
    const co1Submit = await request('/api/announcements', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'TechCorp Campus Drive 2026',
        content: 'TechCorp is conducting on-campus recruitment for Software Engineers.',
        category: 'placement_drive',
      },
    });
    assert.strictEqual(co1Submit.status, 201, `Expected 201 for company announcement submission, got ${co1Submit.status}`);
    const co1AnnId = co1Submit.data.announcement.id;
    assert.strictEqual(co1Submit.data.announcement.approval_status, 'pending', 'Company submission must default to pending');
    assert.strictEqual(co1Submit.data.announcement.posting_source, 'company', 'posting_source must be company');
    assert.strictEqual(co1Submit.data.announcement.company_id, company1.user.id, 'company_id must match authenticated user');

    // Pending submission must remain hidden from students
    const studentFeed1 = await request('/api/announcements', { token: student1.token });
    assert.strictEqual(studentFeed1.status, 200, 'Student feed retrieval must succeed');
    assert.ok(!studentFeed1.data.some(a => a.id === co1AnnId), 'Pending company announcement must not appear in student feed');

    // Direct fetch by student must return 404
    const studentDirectGet = await request(`/api/announcements/${co1AnnId}`, { token: student1.token });
    assert.strictEqual(studentDirectGet.status, 404, 'Direct get by student of pending announcement must return 404');

    // Submitting company can view their own announcement under /api/announcements/my
    const co1MyList = await request('/api/announcements/my', { token: company1.token });
    assert.strictEqual(co1MyList.status, 200, 'Company should be able to fetch their own announcements');
    const myAnn = co1MyList.data.find(a => a.id === co1AnnId);
    assert.ok(myAnn, 'Submitted announcement must be in company my list');
    assert.strictEqual(myAnn.approval_status, 'pending', 'Status in company my list must be pending');

    // Admin pending queue lists the submission with submitting company information
    const adminPendingList = await request('/api/announcements/pending', { token: admin.token });
    assert.strictEqual(adminPendingList.status, 200, 'Admin pending queue fetch must succeed');
    const pendingItem = adminPendingList.data.find(a => a.id === co1AnnId);
    assert.ok(pendingItem, 'Company announcement must appear in admin pending queue');
    assert.strictEqual(pendingItem.submitting_company_name, company1.user.name, 'Submitting company name must be joined');

    console.log('  ✅ Test 3 PASS: Company announcement creates with status pending, hidden from students, visible to creator & admin.');

    // -------------------------------------------------------------------------
    // Test 4: Administrator Direct Announcement Publication
    // -------------------------------------------------------------------------
    const adminPost = await request('/api/announcements', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Placement Season Kickoff Announcement',
        content: 'Placement Cell announces the official schedule for upcoming recruitment drives.',
        category: 'general',
      },
    });
    assert.strictEqual(adminPost.status, 201, `Expected 201 for admin announcement, got ${adminPost.status}`);
    const adminAnnId = adminPost.data.announcement.id;
    assert.strictEqual(adminPost.data.announcement.approval_status, 'approved', 'Admin announcement must be immediately approved');
    assert.strictEqual(adminPost.data.announcement.posting_source, 'placement_cell', 'posting_source must be placement_cell');

    // Admin direct announcement must NOT appear in pending approval queue
    const adminPendingAfter = await request('/api/announcements/pending', { token: admin.token });
    assert.ok(!adminPendingAfter.data.some(a => a.id === adminAnnId), 'Admin announcement must never enter pending queue');

    // Admin direct announcement must immediately appear in student feed
    const studentFeed2 = await request('/api/announcements', { token: student1.token });
    assert.ok(studentFeed2.data.some(a => a.id === adminAnnId), 'Admin announcement must immediately appear in student feed');

    console.log('  ✅ Test 4 PASS: Admin directly creates and publishes announcements; immediately available to students.');

    // -------------------------------------------------------------------------
    // Test 5: Admin Approves Company Announcement
    // -------------------------------------------------------------------------
    const approveRes = await request(`/api/announcements/${co1AnnId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved' },
    });
    assert.strictEqual(approveRes.status, 200, `Expected 200 for approving announcement, got ${approveRes.status}`);

    // Verify in database that approval status, reviewer, and published_at are set
    const [co1Row] = await adminConn.query('SELECT approval_status, reviewed_by, published_at FROM announcements WHERE id = ?', [co1AnnId]);
    assert.strictEqual(co1Row[0].approval_status, 'approved', 'Database approval_status must be approved');
    assert.strictEqual(co1Row[0].reviewed_by, admin.user.id, 'reviewed_by must match admin ID');
    assert.ok(co1Row[0].published_at !== null, 'published_at must be populated upon approval');

    // Approved company announcement must now appear in student feed
    const studentFeed3 = await request('/api/announcements', { token: student1.token });
    assert.ok(studentFeed3.data.some(a => a.id === co1AnnId), 'Approved company announcement must now be visible in student feed');

    // Approved announcement must be removed from pending queue
    const adminPendingAfterApprove = await request('/api/announcements/pending', { token: admin.token });
    assert.ok(!adminPendingAfterApprove.data.some(a => a.id === co1AnnId), 'Approved announcement must be removed from pending queue');

    console.log('  ✅ Test 5 PASS: Admin approval publishes company announcement and updates audit timestamps.');

    // -------------------------------------------------------------------------
    // Test 6: Admin Rejection With Mandatory Rejection Reason
    // -------------------------------------------------------------------------
    const co1Submit2 = await request('/api/announcements', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'TechCorp Off-Campus Pool Drive',
        content: 'Incomplete announcement description for rejection verification test.',
      },
    });
    const co1AnnId2 = co1Submit2.data.announcement.id;

    // Reject without rejection reason -> Must return HTTP 400
    const rejectNoReason = await request(`/api/announcements/${co1AnnId2}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'rejected' },
    });
    assert.strictEqual(rejectNoReason.status, 400, 'Rejection without reason must fail with HTTP 400');

    // Reject with empty whitespace reason -> Must return HTTP 400
    const rejectEmptyReason = await request(`/api/announcements/${co1AnnId2}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'rejected', rejection_reason: '   ' },
    });
    assert.strictEqual(rejectEmptyReason.status, 400, 'Rejection with empty whitespace reason must fail with HTTP 400');

    // Reject with valid reason -> Must succeed (HTTP 200)
    const rejectValid = await request(`/api/announcements/${co1AnnId2}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: {
        approval_status: 'rejected',
        rejection_reason: 'Please specify the exact target branches and registration deadline.',
      },
    });
    assert.strictEqual(rejectValid.status, 200, 'Rejection with valid reason must succeed with HTTP 200');

    // Rejected announcement remains hidden from students
    const studentFeed4 = await request('/api/announcements', { token: student1.token });
    assert.ok(!studentFeed4.data.some(a => a.id === co1AnnId2), 'Rejected announcement must remain hidden from students');

    // Submitting company sees rejection reason in their dashboard
    const co1MyList2 = await request('/api/announcements/my', { token: company1.token });
    const rejItem = co1MyList2.data.find(a => a.id === co1AnnId2);
    assert.ok(rejItem, 'Rejected announcement must be in company my list');
    assert.strictEqual(rejItem.approval_status, 'rejected', 'Status must be rejected');
    assert.strictEqual(rejItem.rejection_reason, 'Please specify the exact target branches and registration deadline.', 'Rejection reason must be visible to submitting company');

    console.log('  ✅ Test 6 PASS: Rejection strictly requires meaningful reason and exposes feedback to submitting company.');

    // -------------------------------------------------------------------------
    // Test 7: Cross-Company Isolation
    // -------------------------------------------------------------------------
    const co2MyList = await request('/api/announcements/my', { token: company2.token });
    assert.strictEqual(co2MyList.status, 200, 'Company 2 my list should return 200');
    assert.ok(!co2MyList.data.some(a => a.id === co1AnnId2), 'Company 2 must not see Company 1 rejected announcement');

    // Company 2 cannot delete Company 1 announcement
    const co2DeleteCo1 = await request(`/api/announcements/${co1AnnId}`, {
      method: 'DELETE',
      token: company2.token,
    });
    assert.strictEqual(co2DeleteCo1.status, 403, 'Company 2 cannot delete Company 1 announcement (HTTP 403)');

    console.log('  ✅ Test 7 PASS: Strict tenant isolation between different companies.');

    // -------------------------------------------------------------------------
    // Test 8: Protected-Field Tampering & Ownership Forgery Prevention
    // -------------------------------------------------------------------------
    const forgeAttempt = await request('/api/announcements', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Tampering Attempt Announcement',
        content: 'Attempting to inject admin privileges and bypass approval.',
        created_by: 1, // Attempt to forge admin user
        posting_source: 'placement_cell', // Attempt to forge source
        approval_status: 'approved', // Attempt to self-approve
        company_id: 5, // Attempt to assign to company 2
      },
    });
    assert.strictEqual(forgeAttempt.status, 201, 'Request should create, but with server-sanitized attributes');
    const forgedId = forgeAttempt.data.announcement.id;

    // Verify in database that forged fields were ignored
    const [forgedRow] = await adminConn.query('SELECT created_by, posting_source, approval_status, company_id FROM announcements WHERE id = ?', [forgedId]);
    assert.strictEqual(forgedRow[0].created_by, company1.user.id, 'created_by must be authenticated company ID');
    assert.strictEqual(forgedRow[0].posting_source, 'company', 'posting_source must be company');
    assert.strictEqual(forgedRow[0].approval_status, 'pending', 'approval_status must be pending');
    assert.strictEqual(forgedRow[0].company_id, company1.user.id, 'company_id must be authenticated company ID');

    console.log('  ✅ Test 8 PASS: Protected fields cannot be overridden by client request bodies.');

    // -------------------------------------------------------------------------
    // Test 9: Concurrency-Safe Reviews & Repeated Review Prevention
    // -------------------------------------------------------------------------
    // 1. Repeated review on already approved announcement must return HTTP 409 Conflict
    const repeatApprove = await request(`/api/announcements/${co1AnnId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved' },
    });
    assert.strictEqual(repeatApprove.status, 409, 'Repeated review on already approved announcement must return HTTP 409 Conflict');

    // 2. Repeated review on already rejected announcement must return HTTP 409 Conflict
    const repeatReject = await request(`/api/announcements/${co1AnnId2}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'rejected', rejection_reason: 'Another reason' },
    });
    assert.strictEqual(repeatReject.status, 409, 'Repeated review on already rejected announcement must return HTTP 409 Conflict');

    // 3. Stale revision review check
    const co1Submit3 = await request('/api/announcements', {
      method: 'POST',
      token: company1.token,
      body: {
        title: 'Concurrency Review Announcement',
        content: 'Testing concurrency revision check on announcement review.',
      },
    });
    const co1AnnId3 = co1Submit3.data.announcement.id;

    const staleReview = await request(`/api/announcements/${co1AnnId3}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: {
        approval_status: 'approved',
        expected_revision: 999, // Stale revision
      },
    });
    assert.strictEqual(staleReview.status, 409, 'Stale revision approval must return HTTP 409 Conflict');

    console.log('  ✅ Test 9 PASS: Stale and repeated review requests rejected with HTTP 409 Conflict.');

    // -------------------------------------------------------------------------
    // Test 10: Input Validation & Nonexistent ID Handling
    // -------------------------------------------------------------------------
    // Missing title
    const noTitle = await request('/api/announcements', {
      method: 'POST',
      token: company1.token,
      body: { content: 'Valid description text here' },
    });
    assert.strictEqual(noTitle.status, 400, 'Missing title must return HTTP 400');

    // Title too short (< 3)
    const shortTitle = await request('/api/announcements', {
      method: 'POST',
      token: company1.token,
      body: { title: 'AB', content: 'Valid description text here' },
    });
    assert.strictEqual(shortTitle.status, 400, 'Title < 3 chars must return HTTP 400');

    // Title too long (> 150)
    const longTitle = await request('/api/announcements', {
      method: 'POST',
      token: company1.token,
      body: { title: 'T'.repeat(151), content: 'Valid description text here' },
    });
    assert.strictEqual(longTitle.status, 400, 'Title > 150 chars must return HTTP 400');

    // Content too short (< 10)
    const shortContent = await request('/api/announcements', {
      method: 'POST',
      token: company1.token,
      body: { title: 'Valid Title', content: 'Short' },
    });
    assert.strictEqual(shortContent.status, 400, 'Content < 10 chars must return HTTP 400');

    // Non-existent ID for approval
    const nonExistApproval = await request('/api/announcements/999999/approval', {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved' },
    });
    assert.strictEqual(nonExistApproval.status, 404, 'Non-existent ID on review must return HTTP 404');

    // Malformed ID
    const malformedId = await request('/api/announcements/invalid-id', { token: admin.token });
    assert.strictEqual(malformedId.status, 400, 'Malformed ID must return HTTP 400');

    console.log('  ✅ Test 10 PASS: Input validation and non-existent IDs handled cleanly.');

    // -------------------------------------------------------------------------
    // Test 11: Deletion Lifecycle
    // -------------------------------------------------------------------------
    // Company deletes its own announcement
    const coDelete = await request(`/api/announcements/${co1AnnId3}`, {
      method: 'DELETE',
      token: company1.token,
    });
    assert.strictEqual(coDelete.status, 200, 'Company should be able to delete its own announcement');

    // Verify it is gone
    const getDeleted = await request(`/api/announcements/${co1AnnId3}`, { token: admin.token });
    assert.strictEqual(getDeleted.status, 404, 'Deleted announcement must return HTTP 404');

    // Admin can delete any announcement
    const adminDelete = await request(`/api/announcements/${forgedId}`, {
      method: 'DELETE',
      token: admin.token,
    });
    assert.strictEqual(adminDelete.status, 200, 'Admin should be able to delete announcement');

    console.log('  ✅ Test 11 PASS: Deletion controls properly enforced for company and administrator.');

    console.log('\n===============================================================');
    console.log('  ✨ ALL STEP 8.6 ANNOUNCEMENTS API TESTS PASSED!              ');
    console.log('===============================================================\n');

  } catch (err) {
    console.error('\n❌ STEP 8.6 TEST RUNNER ENCOUNTERED AN ERROR:');
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
