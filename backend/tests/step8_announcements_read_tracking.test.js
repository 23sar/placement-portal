/**
 * Step 8.8: Announcements Persistent Read/Unread Tracking Test Suite
 * Covers per-student read state, unread counts, idempotent mark-as-read,
 * tenant isolation between students, and protection against unauthorized reads.
 *
 * Runs against isolated temporary database: placement_portal_test_step8_read_tracking
 * Never modifies normal development or production databases.
 */

const path = require('path');
const fs   = require('fs');
const assert = require('node:assert/strict');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const TEST_DB = 'placement_portal_test_step8_read_tracking';
process.env.DB_NAME = TEST_DB;

const mysql = require('mysql2/promise');

function prepareSql(rawSql) {
  return rawSql
    .replace(/CREATE DATABASE IF NOT EXISTS\s+[^\n;]+;/gi, '')
    .replace(/USE\s+[a-zA-Z0-9_`]+;/gi, `USE \`${TEST_DB}\`;`);
}

async function main() {
  console.log('===============================================================');
  console.log('   Step 8.8: Announcements Read/Unread Tracking Test Suite     ');
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

    // Provision Deactivated Student (id: 7)
    await adminConn.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES
      (7, 'Deactivated Student', 'deactivated@example.com',
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
    const company  = await login('techcorp@example.com', 'Test@1234');
    const student1 = await login('alice@example.com', 'Test@1234');
    const student2 = await login('bob@example.com', 'Test@1234');

    assert.strictEqual(admin.status, 200, 'Admin login failed');
    assert.strictEqual(company.status, 200, 'Company login failed');
    assert.strictEqual(student1.status, 200, 'Student 1 login failed');
    assert.strictEqual(student2.status, 200, 'Student 2 login failed');

    console.log('[Executing Step 8.8 Read Tracking Test Cases]:');

    // -------------------------------------------------------------------------
    // Test 1: Unauthenticated Requests & Deactivated Accounts
    // -------------------------------------------------------------------------
    const unauthCount = await request('/api/announcements/unread-count');
    assert.strictEqual(unauthCount.status, 401, 'Unauthenticated GET unread-count must return 401');

    const unauthRead = await request('/api/announcements/1/read', { method: 'POST' });
    assert.strictEqual(unauthRead.status, 401, 'Unauthenticated POST mark-as-read must return 401');

    const unauthReadAll = await request('/api/announcements/read-all', { method: 'POST' });
    assert.strictEqual(unauthReadAll.status, 401, 'Unauthenticated POST read-all must return 401');

    const deactLogin = await login('deactivated@example.com', 'Test@1234');
    assert.strictEqual(deactLogin.status, 403, 'Deactivated account login must return HTTP 403');

    console.log('  ✅ Test 1 PASS: Unauthenticated and deactivated requests strictly rejected.');

    // -------------------------------------------------------------------------
    // Test 2: Role Restrictions (Only students may use read tracking)
    // -------------------------------------------------------------------------
    const compCount = await request('/api/announcements/unread-count', { token: company.token });
    assert.strictEqual(compCount.status, 403, 'Company cannot access unread-count (HTTP 403)');

    const adminCount = await request('/api/announcements/unread-count', { token: admin.token });
    assert.strictEqual(adminCount.status, 403, 'Admin cannot access unread-count (HTTP 403)');

    const compRead = await request('/api/announcements/1/read', { method: 'POST', token: company.token });
    assert.strictEqual(compRead.status, 403, 'Company cannot mark announcement as read (HTTP 403)');

    const adminRead = await request('/api/announcements/1/read', { method: 'POST', token: admin.token });
    assert.strictEqual(adminRead.status, 403, 'Admin cannot mark announcement as read (HTTP 403)');

    console.log('  ✅ Test 2 PASS: Companies and administrators strictly forbidden from read-tracking endpoints.');

    // -------------------------------------------------------------------------
    // Test 3: Setup Announcements & Visibility Verification
    // -------------------------------------------------------------------------
    // 1. Direct Admin Announcement (Published immediately)
    const adminAnn = await request('/api/announcements', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Campus Placement Orientation 2026',
        content: 'Orientation session schedule for all final year eligible students.',
        category: 'general',
      },
    });
    assert.strictEqual(adminAnn.status, 201, 'Admin announcement creation failed');
    const ann1Id = adminAnn.data.announcement.id;

    // 2. Company Pending Announcement (Pending)
    const compPendingAnn = await request('/api/announcements', {
      method: 'POST',
      token: company.token,
      body: {
        title: 'Upcoming TechCorp Hackathon',
        content: 'Join TechCorp internal recruitment hackathon. Awaiting approval.',
      },
    });
    assert.strictEqual(compPendingAnn.status, 201, 'Company pending creation failed');
    const annPendingId = compPendingAnn.data.announcement.id;

    // 3. Company Rejected Announcement
    const compRejAnn = await request('/api/announcements', {
      method: 'POST',
      token: company.token,
      body: {
        title: 'Draft Incomplete Announcement',
        content: 'This announcement will be rejected by admin.',
      },
    });
    const annRejId = compRejAnn.data.announcement.id;
    await request(`/api/announcements/${annRejId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'rejected', rejection_reason: 'Incomplete content.' },
    });

    // Student feed must only contain the 1 published announcement
    const s1Feed = await request('/api/announcements', { token: student1.token });
    assert.strictEqual(s1Feed.status, 200, 'Student feed retrieval failed');
    assert.strictEqual(s1Feed.data.length, 1, 'Student feed must only have approved announcements');
    assert.strictEqual(s1Feed.data[0].id, ann1Id, 'Only approved announcement must appear');

    console.log('  ✅ Test 3 PASS: Student feed strictly excludes pending and rejected announcements.');

    // -------------------------------------------------------------------------
    // Test 4: Initial Read State & Unread Count
    // -------------------------------------------------------------------------
    assert.strictEqual(s1Feed.data[0].is_read, false, 'Newly published announcement must initially be unread');
    assert.strictEqual(s1Feed.data[0].read_at, null, 'Initial read_at must be null');

    const s1InitialCount = await request('/api/announcements/unread-count', { token: student1.token });
    assert.strictEqual(s1InitialCount.status, 200, 'Unread count fetch failed');
    assert.strictEqual(s1InitialCount.data.unread_count, 1, 'Initial unread count must be 1');

    console.log('  ✅ Test 4 PASS: Published announcements start as unread (is_read=false, unread_count=1).');

    // -------------------------------------------------------------------------
    // Test 5: Mark Announcement as Read
    // -------------------------------------------------------------------------
    const markReadRes = await request(`/api/announcements/${ann1Id}/read`, {
      method: 'POST',
      token: student1.token,
    });
    assert.strictEqual(markReadRes.status, 200, 'Mark as read must return 200');
    assert.strictEqual(markReadRes.data.is_read, true, 'Mark as read response should indicate is_read: true');

    // Student 1 unread count is now 0
    const s1CountAfterRead = await request('/api/announcements/unread-count', { token: student1.token });
    assert.strictEqual(s1CountAfterRead.data.unread_count, 0, 'Unread count must be 0 after marking as read');

    // Student 1 feed reflects is_read: true
    const s1FeedAfterRead = await request('/api/announcements', { token: student1.token });
    assert.strictEqual(s1FeedAfterRead.data[0].is_read, true, 'Feed item is_read must now be true');
    assert.ok(s1FeedAfterRead.data[0].read_at !== null, 'Feed item read_at must now be populated');

    console.log('  ✅ Test 5 PASS: Marking announcement as read updates feed state and decrements unread count.');

    // -------------------------------------------------------------------------
    // Test 6: Idempotent Mark as Read
    // -------------------------------------------------------------------------
    const repeatReadRes = await request(`/api/announcements/${ann1Id}/read`, {
      method: 'POST',
      token: student1.token,
    });
    assert.strictEqual(repeatReadRes.status, 200, 'Repeated mark as read must succeed idempotently');

    const s1CountRepeat = await request('/api/announcements/unread-count', { token: student1.token });
    assert.strictEqual(s1CountRepeat.data.unread_count, 0, 'Unread count remains 0 on idempotent repeated read');

    console.log('  ✅ Test 6 PASS: Repeated mark-as-read requests are completely idempotent.');

    // -------------------------------------------------------------------------
    // Test 7: Tenant Isolation Between Students
    // -------------------------------------------------------------------------
    // Student 2 has NOT marked the announcement as read yet
    const s2Count = await request('/api/announcements/unread-count', { token: student2.token });
    assert.strictEqual(s2Count.data.unread_count, 1, 'Student 2 unread count must remain 1');

    const s2Feed = await request('/api/announcements', { token: student2.token });
    assert.strictEqual(s2Feed.data[0].is_read, false, 'Student 2 feed must show is_read: false');

    // Student 2 marks it as read
    await request(`/api/announcements/${ann1Id}/read`, { method: 'POST', token: student2.token });
    const s2CountAfter = await request('/api/announcements/unread-count', { token: student2.token });
    assert.strictEqual(s2CountAfter.data.unread_count, 0, 'Student 2 unread count now 0');

    console.log('  ✅ Test 7 PASS: Strict per-student isolation; one student reading does not affect another.');

    // -------------------------------------------------------------------------
    // Test 8: Pending and Rejected Announcements Cannot Be Read
    // -------------------------------------------------------------------------
    // Attempting to mark pending announcement as read -> 404
    const markPending = await request(`/api/announcements/${annPendingId}/read`, {
      method: 'POST',
      token: student1.token,
    });
    assert.strictEqual(markPending.status, 404, 'Cannot mark pending announcement as read (HTTP 404)');

    // Attempting to mark rejected announcement as read -> 404
    const markRejected = await request(`/api/announcements/${annRejId}/read`, {
      method: 'POST',
      token: student1.token,
    });
    assert.strictEqual(markRejected.status, 404, 'Cannot mark rejected announcement as read (HTTP 404)');

    console.log('  ✅ Test 8 PASS: Pending and rejected announcements cannot be marked as read.');

    // -------------------------------------------------------------------------
    // Test 9: Malformed and Non-existent IDs
    // -------------------------------------------------------------------------
    const malformedRead = await request('/api/announcements/invalid-id/read', {
      method: 'POST',
      token: student1.token,
    });
    assert.strictEqual(malformedRead.status, 400, 'Malformed ID must return HTTP 400');

    const nonExistRead = await request('/api/announcements/999999/read', {
      method: 'POST',
      token: student1.token,
    });
    assert.strictEqual(nonExistRead.status, 404, 'Non-existent ID must return HTTP 404');

    console.log('  ✅ Test 9 PASS: Malformed and non-existent announcement IDs return 400 / 404.');

    // -------------------------------------------------------------------------
    // Test 10: Mark All as Read
    // -------------------------------------------------------------------------
    // Admin publishes 2 more announcements
    const ann2 = await request('/api/announcements', {
      method: 'POST',
      token: admin.token,
      body: { title: 'Announcement Batch 2', content: 'Content for batch test 2.' },
    });
    const ann3 = await request('/api/announcements', {
      method: 'POST',
      token: admin.token,
      body: { title: 'Announcement Batch 3', content: 'Content for batch test 3.' },
    });
    assert.strictEqual(ann2.status, 201);
    assert.strictEqual(ann3.status, 201);

    // Student 1 now has 2 unread announcements
    const s1BatchCount = await request('/api/announcements/unread-count', { token: student1.token });
    assert.strictEqual(s1BatchCount.data.unread_count, 2, 'Student 1 unread count must be 2');

    // Student 1 calls mark-all
    const readAllRes = await request('/api/announcements/read-all', {
      method: 'POST',
      token: student1.token,
    });
    assert.strictEqual(readAllRes.status, 200, 'mark-all must return 200');

    // Student 1 count is now 0, all feed items marked read
    const s1AfterAllCount = await request('/api/announcements/unread-count', { token: student1.token });
    assert.strictEqual(s1AfterAllCount.data.unread_count, 0, 'Student 1 count must be 0 after mark-all');

    const s1FeedAll = await request('/api/announcements', { token: student1.token });
    assert.ok(s1FeedAll.data.every(a => a.is_read === true), 'All feed items must be marked is_read: true');

    // Student 2 was unaffected by Student 1's mark-all
    const s2BatchCount = await request('/api/announcements/unread-count', { token: student2.token });
    assert.strictEqual(s2BatchCount.data.unread_count, 2, 'Student 2 unread count remains 2');

    console.log('  ✅ Test 10 PASS: Mark all as read clears student unread count while preserving isolation.');

    // -------------------------------------------------------------------------
    // Test 11: End-to-end Approval publishes to Student feed & updates unread count
    // -------------------------------------------------------------------------
    // Approve the pending company announcement from Test 3
    const approveComp = await request(`/api/announcements/${annPendingId}/approval`, {
      method: 'PATCH',
      token: admin.token,
      body: { approval_status: 'approved', expected_revision: 1 },
    });
    assert.strictEqual(approveComp.status, 200, 'Company announcement approval failed');

    // Both students now have 1 unread announcement (the newly approved one)
    const s1CountFinal = await request('/api/announcements/unread-count', { token: student1.token });
    assert.strictEqual(s1CountFinal.data.unread_count, 1, 'Newly approved announcement increments unread count');

    const s1FeedFinal = await request('/api/announcements', { token: student1.token });
    const newlyApprovedItem = s1FeedFinal.data.find(a => a.id === annPendingId);
    assert.ok(newlyApprovedItem, 'Newly approved announcement must now appear in student feed');
    assert.strictEqual(newlyApprovedItem.is_read, false, 'Newly approved announcement must be unread');

    console.log('  ✅ Test 11 PASS: Company approval seamlessly publishes to student feed and updates unread count.');

    console.log('\n===============================================================');
    console.log('  ✨ ALL STEP 8.8 ANNOUNCEMENTS READ-TRACKING TESTS PASSED!    ');
    console.log('===============================================================\n');

  } catch (err) {
    console.error('\n❌ STEP 8.8 TEST RUNNER ENCOUNTERED AN ERROR:');
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
