/**
 * Step 8.4 Resume API security / lifecycle tests.
 * Uses an isolated database and temporary private storage directory only.
 */
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const TEST_DB = 'placement_portal_test_step8_resume';
const TEST_STORAGE = path.join(os.tmpdir(), `placement-portal-resume-test-${process.pid}`);
process.env.DB_NAME = TEST_DB;
process.env.RESUME_STORAGE_DIR = TEST_STORAGE;
const mysql = require('mysql2/promise');

function prepareSql(rawSql) {
  return rawSql
    .replace(/CREATE DATABASE IF NOT EXISTS\s+[^\n;]+;/gi, '')
    .replace(/USE\s+[a-zA-Z0-9_`]+;/gi, `USE \`${TEST_DB}\`;`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function uploadForm(filename, mime, bytes) {
  const body = new FormData();
  body.append('resume', new Blob([bytes], { type: mime }), filename);
  return body;
}

async function main() {
  console.log('===============================================================');
  console.log('   Step 8.4: Private Student Resume API Suite');
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
    await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    await adminConn.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await adminConn.query(`USE \`${TEST_DB}\``);

    const schema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
    await adminConn.query(prepareSql(schema));
    const seed = fs.readFileSync(path.resolve(__dirname, '../../database/seed.sql'), 'utf8');
    await adminConn.query(prepareSql(seed));
    // This student has no application and is used to verify company isolation.
    await adminConn.query(
      `INSERT INTO users (id, name, email, password, role, is_active) VALUES
       (5, 'Unrelated Student', 'outsider@example.com',
        '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'student', TRUE)`,
    );
    const adminSeedPath = path.resolve(__dirname, '../../database/seed_admin_dev.sql');
    if (fs.existsSync(adminSeedPath)) {
      await adminConn.query(prepareSql(fs.readFileSync(adminSeedPath, 'utf8')));
    }

    const app = require('../src/app');
    pool = require('../src/config/db');
    await new Promise(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        console.log(`[Setup] Isolated database ready; server at ${baseUrl}`);
        resolve();
      });
    });

    async function request(route, { method = 'GET', body, token } = {}) {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      let requestBody;
      if (body !== undefined) {
        if (typeof FormData !== 'undefined' && body instanceof FormData) {
          requestBody = body;
        } else {
          headers['Content-Type'] = 'application/json';
          requestBody = JSON.stringify(body);
        }
      }
      const response = await fetch(`${baseUrl}${route}`, { method, headers, body: requestBody });
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
      return { status: response.status, data, headers: response.headers };
    }
    async function login(email) {
      return request('/api/auth/login', { method: 'POST', body: { email, password: 'Test@1234' } });
    }

    const alice = await login('alice@example.com');
    const bob = await login('bob@example.com');
    const company = await login('techcorp@example.com');
    const outsider = await login('outsider@example.com');
    assert(alice.status === 200 && alice.data.token, 'Alice login failed');
    assert(bob.status === 200 && bob.data.token, 'Bob login failed');
    assert(company.status === 200 && company.data.token, 'Company login failed');
    assert(outsider.status === 200 && outsider.data.token, 'Unrelated student login failed');

    let result = await request('/api/profile/resume');
    assert(result.status === 401, `Unauthenticated metadata should be 401, got ${result.status}`);
    console.log('  PASS: Unauthenticated access is rejected.');

    result = await request('/api/profile/resume', { token: company.data.token });
    assert(result.status === 403, `Company metadata access should be 403, got ${result.status}`);
    result = await request('/api/profile/resume', {
      method: 'POST', token: company.data.token,
      body: uploadForm('company.pdf', 'application/pdf', Buffer.from('%PDF-1.7\nprivate')),
    });
    assert(result.status === 403, `Company upload should be 403, got ${result.status}`);
    console.log('  PASS: Company accounts cannot access student resume endpoints.');

    result = await request('/api/profile/resume', { token: alice.data.token });
    assert(result.status === 200 && result.data.resume === null, 'New student should have no resume metadata');
    result = await request('/api/profile/resume/download', { token: alice.data.token });
    assert(result.status === 404, 'Downloading without an uploaded resume should return 404');
    console.log('  PASS: Students without a resume receive an empty status and 404 on download.');

    result = await request('/api/profile/resume', {
      method: 'POST', token: alice.data.token,
      body: uploadForm('resume.txt', 'text/plain', Buffer.from('plain text')),
    });
    assert(result.status === 400, `Non-PDF extension/MIME should be 400, got ${result.status}`);
    result = await request('/api/profile/resume', {
      method: 'POST', token: alice.data.token,
      body: uploadForm('fake.pdf', 'application/pdf', Buffer.from('not a PDF')),
    });
    assert(result.status === 400, `Invalid PDF signature should be 400, got ${result.status}`);
    result = await request('/api/profile/resume', {
      method: 'POST', token: alice.data.token,
      body: uploadForm('large.pdf', 'application/pdf', Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(5 * 1024 * 1024)])),
    });
    assert(result.status === 413, `Oversized upload should be 413, got ${result.status}`);
    console.log('  PASS: Non-PDF, spoofed-signature, and oversized uploads are rejected.');

    const firstBytes = Buffer.from('%PDF-1.7\nAlice first private resume\n%%EOF\n');
    result = await request('/api/profile/resume', {
      method: 'POST', token: alice.data.token,
      body: uploadForm('../../Alice Resume.pdf', 'application/pdf', firstBytes),
    });
    assert(result.status === 201, `First upload should be 201, got ${result.status}: ${JSON.stringify(result.data)}`);
    assert(result.data.resume.original_name === 'Alice Resume.pdf', `Filename was not safely normalized: ${result.data.resume.original_name}`);
    assert(!Object.hasOwn(result.data.resume, 'storage_key'), 'Storage key must not be exposed in API metadata');
    console.log('  PASS: Valid PDF is stored privately and only safe metadata is returned.');

    const [storedRows] = await adminConn.query('SELECT storage_key, sha256, file_size FROM student_resumes WHERE user_id = 2');
    assert(storedRows.length === 1, 'Expected one row for Alice resume');
    const firstPath = path.join(TEST_STORAGE, storedRows[0].storage_key);
    assert(fs.existsSync(firstPath), 'Private resume file was not written');
    assert(storedRows[0].sha256.length === 64, 'Expected SHA-256 digest');

    result = await request('/api/profile/resume/download', { token: bob.data.token });
    assert(result.status === 404, `Bob must not download Alice resume (expected 404, got ${result.status})`);
    result = await request('/api/profile/resume/students/2/download', { token: company.data.token });
    assert(result.status === 200, `Company should access an applicant resume for its job (got ${result.status})`);
    assert(Buffer.compare(result.data, firstBytes) === 0, 'Company applicant download bytes mismatch');
    result = await request('/api/profile/resume/students/4/download', { token: company.data.token });
    assert(result.status === 403, `Company must be denied access to unrelated student (got ${result.status})`);
    result = await request('/api/profile/resume/students/3/download', { token: alice.data.token });
    assert(result.status === 403, `Student must not download another student resume (got ${result.status})`);
    result = await request('/api/profile/resume/download', { token: alice.data.token });
    assert(result.status === 200, `Alice download failed (${result.status})`);
    assert(Buffer.compare(result.data, firstBytes) === 0, 'Downloaded PDF bytes do not match uploaded bytes');
    assert(result.headers.get('content-type') === 'application/pdf', 'Download should use application/pdf content type');
    assert(result.headers.get('x-content-type-options') === 'nosniff', 'Download should set nosniff');
    assert((result.headers.get('content-disposition') || '').includes('attachment;'), 'Download must force attachment');
    assert((result.headers.get('cache-control') || '').includes('no-store'), 'Private download should not be cached');
    console.log('  PASS: Owner download works; company access requires a real application relationship.');

    const secondBytes = Buffer.from('%PDF-1.7\nAlice replacement resume\n%%EOF\n');
    result = await request('/api/profile/resume', {
      method: 'POST', token: alice.data.token,
      body: uploadForm('updated.pdf', 'application/pdf', secondBytes),
    });
    assert(result.status === 200, `Replacement should return 200, got ${result.status}`);
    assert(result.data.resume.original_name === 'updated.pdf', 'Replacement metadata not updated');
    assert(!fs.existsSync(firstPath), 'Previous file should be removed after replacement');
    const [updatedRows] = await adminConn.query('SELECT storage_key FROM student_resumes WHERE user_id = 2');
    const secondPath = path.join(TEST_STORAGE, updatedRows[0].storage_key);
    assert(fs.existsSync(secondPath), 'Replacement file missing from private storage');
    assert((await request('/api/profile/resume/download', { token: alice.data.token })).data.equals(secondBytes), 'Replacement download did not return new file');
    console.log('  PASS: Replacement updates metadata and removes the previous private file.');

    result = await request('/api/profile/resume', { method: 'DELETE', token: alice.data.token });
    assert(result.status === 200, `Delete should return 200, got ${result.status}`);
    assert(!fs.existsSync(secondPath), 'Deleted resume file should be removed');
    const [remainingRows] = await adminConn.query('SELECT id FROM student_resumes WHERE user_id = 2');
    assert(remainingRows.length === 0, 'Resume metadata should be deleted');
    result = await request('/api/profile/resume', { method: 'DELETE', token: alice.data.token });
    assert(result.status === 404, 'Deleting nonexistent resume should return 404');
    console.log('  PASS: Delete removes metadata and private bytes; repeat delete returns 404.');

    console.log('\n  ALL STEP 8.4 RESUME API SCENARIOS PASSED.');
  } catch (err) {
    failed = true;
    console.error('\n  STEP 8.4 RESUME API SUITE FAILED:', err.stack || err.message);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) {
      try { await pool.promise().end(); }
      catch (err) { failed = true; console.error('[Cleanup] Application pool close failed:', err.message); }
    }
    try {
      await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
      console.log(`[Cleanup] Isolated database '${TEST_DB}' dropped.`);
    } catch (err) {
      failed = true;
      console.error('[Cleanup] Could not drop isolated database:', err.message);
    }
    try { await fsp.rm(TEST_STORAGE, { recursive: true, force: true }); }
    catch (err) { failed = true; console.error('[Cleanup] Could not remove temporary resume storage:', err.message); }
    await adminConn.end();
  }
  if (failed) process.exitCode = 1;
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
