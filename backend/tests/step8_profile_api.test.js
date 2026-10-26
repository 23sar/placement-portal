/**
 * Step 8.1 Student Profile API Suite
 * Runs against the isolated placement_portal_test_step8_profile database.
 * This suite never targets the normal development database.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const TEST_DB = 'placement_portal_test_step8_profile';
process.env.DB_NAME = TEST_DB;
const mysql = require('mysql2/promise');

function prepareSql(rawSql) {
  return rawSql
    .replace(/CREATE DATABASE IF NOT EXISTS\s+[^\n;]+;/gi, '')
    .replace(/USE\s+[a-zA-Z0-9_`]+;/gi, `USE \`${TEST_DB}\`;`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log('===============================================================');
  console.log('   Step 8.1: Student Profile Schema & API Suite');
  console.log('===============================================================');

  const adminConn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  let server;
  let pool;
  let baseUrl;
  let failed = false;

  try {
    console.log(`\n[Setup] Provisioning isolated database '${TEST_DB}'...`);
    await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    await adminConn.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await adminConn.query(`USE \`${TEST_DB}\``);

    const schema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
    await adminConn.query(prepareSql(schema));
    const seed = fs.readFileSync(path.resolve(__dirname, '../../database/seed.sql'), 'utf8');
    await adminConn.query(prepareSql(seed));
    const adminSeedPath = path.resolve(__dirname, '../../database/seed_admin_dev.sql');
    if (fs.existsSync(adminSeedPath)) {
      const adminSeed = fs.readFileSync(adminSeedPath, 'utf8');
      await adminConn.query(prepareSql(adminSeed));
    }

    // Require the DB pool only after TEST_DB is set.
    const app = require('../src/app');
    pool = require('../src/config/db');
    await new Promise(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        console.log('        Schema and seed accounts provisioned.');
        console.log(`        Test server listening at ${baseUrl}`);
        resolve();
      });
    });

    async function request(route, { method = 'GET', body, token } = {}) {
      const headers = {};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${baseUrl}${route}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, data };
    }
    async function login(email, password = 'Test@1234') {
      return request('/api/auth/login', { method: 'POST', body: { email, password } });
    }

    const alice = await login('alice@example.com');
    const bob = await login('bob@example.com');
    const company = await login('techcorp@example.com');
    assert(alice.status === 200 && alice.data.token, `Alice login failed (${alice.status})`);
    assert(bob.status === 200 && bob.data.token, `Bob login failed (${bob.status})`);
    assert(company.status === 200 && company.data.token, `Company login failed (${company.status})`);

    console.log('[Running profile API scenarios]');

    const unauth = await request('/api/profile/me');
    assert(unauth.status === 401, `Unauthenticated GET should be 401, got ${unauth.status}`);
    console.log('  PASS: Unauthenticated access is rejected.');

    const companyDenied = await request('/api/profile/me', { token: company.data.token });
    assert(companyDenied.status === 403, `Company access should be 403, got ${companyDenied.status}`);
    console.log('  PASS: Non-student roles cannot access student profile endpoints.');

    const initial = await request('/api/profile/me', { token: alice.data.token });
    assert(initial.status === 200, `Initial profile GET failed (${initial.status})`);
    assert(initial.data.profile.email === 'alice@example.com', 'Profile should expose account email as read-only account data');
    assert(initial.data.profile.department === null, 'New profile fields should be null before first save');
    console.log('  PASS: Student can fetch their own profile even before creating profile fields.');

    const update = await request('/api/profile/me', {
      method: 'PATCH', token: alice.data.token,
      body: {
        phone: '+91 98765 43210',
        department: 'Computer Science and Technology',
        degree_program: 'B.Tech',
        graduation_year: 2027,
        roll_number: '23CS001',
        cgpa: 8.75,
        backlog_count: 0,
        technical_interests: 'Backend engineering, data systems',
        github_url: 'https://github.com/23sar',
        linkedin_url: 'https://www.linkedin.com/in/example',
        portfolio_url: 'https://example.com',
      },
    });
    assert(update.status === 200, `Valid profile PATCH failed (${update.status}): ${JSON.stringify(update.data)}`);
    assert(update.data.profile.department === 'Computer Science and Technology', 'Department not persisted');
    assert(Number(update.data.profile.cgpa) === 8.75, 'CGPA not persisted');
    console.log('  PASS: Valid profile fields can be created and saved.');

    const partial = await request('/api/profile/me', {
      method: 'PATCH', token: alice.data.token, body: { cgpa: 9.1 },
    });
    assert(partial.status === 200, `Partial update failed (${partial.status})`);
    assert(partial.data.profile.department === 'Computer Science and Technology', 'Partial update erased an omitted field');
    assert(Number(partial.data.profile.cgpa) === 9.1, 'Updated CGPA not returned');
    console.log('  PASS: Partial updates preserve omitted profile fields.');

    const bobProfile = await request('/api/profile/me', { token: bob.data.token });
    assert(bobProfile.status === 200, `Bob profile GET failed (${bobProfile.status})`);
    assert(bobProfile.data.profile.department === null, 'Alice profile data leaked to Bob');
    console.log('  PASS: Profile records are isolated per authenticated student.');

    const invalids = [
      [{ cgpa: 10.5 }, 'CGPA above 10'],
      [{ cgpa: 'Infinity' }, 'non-finite CGPA'],
      [{ graduation_year: 1999 }, 'out-of-range graduation year'],
      [{ backlog_count: -1 }, 'negative backlog count'],
      [{ phone: 'abc' }, 'invalid phone'],
      [{ github_url: 'javascript:alert(1)' }, 'unsafe URL protocol'],
      [{ department: 'X'.repeat(101) }, 'oversized department'],
      [{ degree_program: 'B' }, 'too-short degree program'],
    ];
    for (const [body, label] of invalids) {
      const result = await request('/api/profile/me', { method: 'PATCH', token: alice.data.token, body });
      assert(result.status === 400, `${label} should be HTTP 400, got ${result.status}`);
    }
    console.log('  PASS: Profile field validation rejects invalid values and lengths.');

    for (const body of [
      { role: 'admin' }, { email: 'attacker@example.com' }, { user_id: 2 }, { is_active: false },
    ]) {
      const result = await request('/api/profile/me', { method: 'PATCH', token: alice.data.token, body });
      assert(result.status === 400, `Protected field ${Object.keys(body)[0]} should be rejected, got ${result.status}`);
    }
    console.log('  PASS: Account identity and protected fields cannot be changed through the profile API.');

    const empty = await request('/api/profile/me', { method: 'PATCH', token: alice.data.token, body: {} });
    assert(empty.status === 400, `Empty update should be 400, got ${empty.status}`);
    console.log('  PASS: Empty updates are rejected.');

    // Confirm the API did not alter account role or email.
    const [userRows] = await adminConn.query('SELECT role, email FROM users WHERE email = ?', ['alice@example.com']);
    assert(userRows[0].role === 'student' && userRows[0].email === 'alice@example.com', 'Profile edit mutated account identity');
    console.log('  PASS: Profile updates leave authentication identity unchanged.');
    console.log('\n  ALL STEP 8.1 PROFILE API SCENARIOS PASSED.');
  } catch (err) {
    failed = true;
    console.error('\n  STEP 8.1 PROFILE API SUITE FAILED:', err.stack || err.message);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) {
      try { await pool.promise().end(); } catch (err) { console.error('[Cleanup] Pool close warning:', err.message); }
    }
    try {
      await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
      console.log(`[Cleanup] Isolated database '${TEST_DB}' dropped.`);
    } catch (err) {
      failed = true;
      console.error('[Cleanup] Could not drop isolated test database:', err.message);
    }
    await adminConn.end();
  }
  if (failed) process.exitCode = 1;
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
