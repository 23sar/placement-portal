/**
 * Step 9: Multiple Student Resumes and Application-Specific Resume Snapshots Suite
 * Validates multiple saved resumes, default resume switching, isolation,
 * immutable application resume snapshots, recruiter & admin permissions,
 * and edge case handling.
 */
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const assert = require('node:assert/strict');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const TEST_DB = 'placement_portal_test_step9_resumes';
const TEST_STORAGE = path.join(os.tmpdir(), `placement-portal-step9-${process.pid}`);
process.env.DB_NAME = TEST_DB;
process.env.RESUME_STORAGE_DIR = TEST_STORAGE;
const mysql = require('mysql2/promise');

function prepareSql(rawSql) {
  return rawSql
    .replace(/CREATE DATABASE IF NOT EXISTS\s+[^\n;]+;/gi, '')
    .replace(/USE\s+[a-zA-Z0-9_`]+;/gi, `USE \`${TEST_DB}\`;`);
}

function uploadForm(filename, mime, bytes, label, isDefault) {
  const body = new FormData();
  body.append('resume', new Blob([bytes], { type: mime }), filename);
  if (label !== undefined) body.append('label', label);
  if (isDefault !== undefined) body.append('is_default', String(isDefault));
  return body;
}

async function main() {
  console.log('===============================================================');
  console.log('   Step 9: Multiple Resumes & Application Snapshots Suite      ');
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

  try {
    // 1. Provision isolated test database
    await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
    await adminConn.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await adminConn.query(`USE \`${TEST_DB}\``);

    const schema = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
    await adminConn.query(prepareSql(schema));
    const seed = fs.readFileSync(path.resolve(__dirname, '../../database/seed.sql'), 'utf8');
    await adminConn.query(prepareSql(seed));

    // Provision a second company (Company 2: InnoTech) for cross-tenant testing
    await adminConn.query(`
      INSERT INTO users (id, name, email, password, role, is_active) VALUES
      (4, 'InnoTech Labs', 'innotech@example.com',
       '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'company', TRUE),
      (5, 'Charlie Outsider', 'charlie@example.com',
       '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'student', TRUE)
    `);

    // Ensure admin user exists (id 99)
    await adminConn.query(`
      INSERT IGNORE INTO users (id, name, email, password, role, is_active) VALUES
      (99, 'Placement Cell Officer', 'admin@placement.edu',
       '$2b$10$1C0jodYxHHgSd85y.jQlcuvUdYStlG4.TR6nKHLfqcE4NcdBoApGi', 'admin', TRUE)
    `);

    await fsp.mkdir(TEST_STORAGE, { recursive: true });

    const app = require('../src/app');
    pool = require('../src/config/db');
    await new Promise(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        console.log(`[Setup] Isolated database and storage ready; server at ${baseUrl}`);
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
      const data = contentType.includes('application/json')
        ? await response.json()
        : Buffer.from(await response.arrayBuffer());
      return { status: response.status, data, headers: response.headers };
    }

    async function login(email) {
      return request('/api/auth/login', { method: 'POST', body: { email, password: 'Test@1234' } });
    }

    const alice = await login('alice@example.com');
    const bob = await login('bob@example.com');
    const company1 = await login('techcorp@example.com');
    const company2 = await login('innotech@example.com');
    const charlie = await login('charlie@example.com');
    const admin = await login('admin@placement.edu');

    assert.equal(alice.status, 200, 'Alice login failed');
    assert.equal(bob.status, 200, 'Bob login failed');
    assert.equal(company1.status, 200, 'Company 1 login failed');
    assert.equal(company2.status, 200, 'Company 2 login failed');
    assert.equal(charlie.status, 200, 'Charlie login failed');
    assert.equal(admin.status, 200, 'Admin login failed');

    // -------------------------------------------------------------------------
    // Scenario 1: Multiple saved resumes owned by one student
    // -------------------------------------------------------------------------
    const pdf1Bytes = Buffer.from('%PDF-1.7\nAlice Software Engineering Resume\n%%EOF\n');
    const pdf2Bytes = Buffer.from('%PDF-1.7\nAlice Data Science Resume\n%%EOF\n');
    const pdf3Bytes = Buffer.from('%PDF-1.7\nAlice DevOps Engineering Resume\n%%EOF\n');

    let res = await request('/api/profile/resumes', {
      method: 'POST',
      token: alice.data.token,
      body: uploadForm('alice_swe.pdf', 'application/pdf', pdf1Bytes, 'Software Engineering Resume', true),
    });
    assert.equal(res.status, 201, `First resume upload failed: ${JSON.stringify(res.data)}`);
    const resume1 = res.data.resume;
    assert.equal(resume1.label, 'Software Engineering Resume');
    assert.equal(Boolean(resume1.is_default), true, 'First resume should be default');

    res = await request('/api/profile/resumes', {
      method: 'POST',
      token: alice.data.token,
      body: uploadForm('alice_ds.pdf', 'application/pdf', pdf2Bytes, 'Data Science Resume', false),
    });
    assert.equal(res.status, 201, `Second resume upload failed: ${JSON.stringify(res.data)}`);
    const resume2 = res.data.resume;
    assert.equal(resume2.label, 'Data Science Resume');
    assert.equal(Boolean(resume2.is_default), false, 'Second resume should not be default');

    res = await request('/api/profile/resumes', {
      method: 'POST',
      token: alice.data.token,
      body: uploadForm('alice_devops.pdf', 'application/pdf', pdf3Bytes, 'DevOps Resume', false),
    });
    assert.equal(res.status, 201, `Third resume upload failed: ${JSON.stringify(res.data)}`);
    const resume3 = res.data.resume;

    // List resumes
    const listRes = await request('/api/profile/resumes', { token: alice.data.token });
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data.resumes.length, 3, 'Alice should have exactly 3 resumes');
    console.log('  PASS: Multiple saved resumes uploaded and listed successfully.');

    // -------------------------------------------------------------------------
    // Scenario 2: Default-resume uniqueness and switching
    // -------------------------------------------------------------------------
    res = await request(`/api/profile/resumes/${resume2.id}/default`, {
      method: 'PATCH',
      token: alice.data.token,
    });
    assert.equal(res.status, 200, `Setting default failed: ${JSON.stringify(res.data)}`);
    assert.equal(Boolean(res.data.resume.is_default), true);

    const [dbDefaultRows] = await adminConn.query(
      'SELECT id, is_default FROM student_resumes WHERE user_id = 2 AND is_default = TRUE'
    );
    assert.equal(dbDefaultRows.length, 1, 'Exactly one resume must have is_default = TRUE');
    assert.equal(dbDefaultRows[0].id, resume2.id, 'Resume 2 must be the default in database');
    console.log('  PASS: Default-resume switching maintains exactly one default resume per student.');

    // -------------------------------------------------------------------------
    // Scenario 3: Cross-student upload, update, deletion and download isolation
    // -------------------------------------------------------------------------
    // Bob has no resumes yet
    res = await request('/api/profile/resumes', { token: bob.data.token });
    assert.equal(res.status, 200);
    assert.equal(res.data.resumes.length, 0, 'Bob should see 0 resumes');

    // Bob attempts to modify Alice's resume
    res = await request(`/api/profile/resumes/${resume1.id}/default`, {
      method: 'PATCH',
      token: bob.data.token,
    });
    assert.equal(res.status, 404, 'Bob cannot set Alice resume as default');

    res = await request(`/api/profile/resumes/${resume1.id}`, {
      method: 'PATCH',
      token: bob.data.token,
      body: { label: 'Hacked Label' },
    });
    assert.equal(res.status, 404, 'Bob cannot rename Alice resume');

    res = await request(`/api/profile/resumes/${resume1.id}`, {
      method: 'DELETE',
      token: bob.data.token,
    });
    assert.equal(res.status, 404, 'Bob cannot delete Alice resume');

    res = await request(`/api/profile/resumes/${resume1.id}/download`, {
      token: bob.data.token,
    });
    assert.equal(res.status, 404, 'Bob cannot download Alice resume');

    // Bob uploads his own resume
    const bobPdfBytes = Buffer.from('%PDF-1.7\nBob Product Manager Resume\n%%EOF\n');
    res = await request('/api/profile/resumes', {
      method: 'POST',
      token: bob.data.token,
      body: uploadForm('bob_pm.pdf', 'application/pdf', bobPdfBytes, 'Product Manager Resume', true),
    });
    assert.equal(res.status, 201);
    const bobResume = res.data.resume;
    assert.equal(bobResume.user_id, 3);
    console.log('  PASS: Strict tenant isolation between students for resume management.');

    // -------------------------------------------------------------------------
    // Scenario 4: Invalid, oversized, and spoofed PDF uploads
    // -------------------------------------------------------------------------
    res = await request('/api/profile/resumes', {
      method: 'POST',
      token: alice.data.token,
      body: uploadForm('fake.txt', 'text/plain', Buffer.from('plain text')),
    });
    assert.equal(res.status, 400, 'Non-PDF upload must be rejected');

    res = await request('/api/profile/resumes', {
      method: 'POST',
      token: alice.data.token,
      body: uploadForm('fake.pdf', 'application/pdf', Buffer.from('not a real pdf content')),
    });
    assert.equal(res.status, 400, 'Spoofed PDF magic bytes must be rejected');

    const bigBuffer = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(5 * 1024 * 1024 + 100)]);
    res = await request('/api/profile/resumes', {
      method: 'POST',
      token: alice.data.token,
      body: uploadForm('huge.pdf', 'application/pdf', bigBuffer),
    });
    assert.equal(res.status, 413, 'Oversized PDF (> 5 MB) must be rejected with 413');
    console.log('  PASS: Invalid, spoofed, and oversized resume uploads rejected cleanly.');

    // -------------------------------------------------------------------------
    // Scenario 5: Resume rename / label update
    // -------------------------------------------------------------------------
    res = await request(`/api/profile/resumes/${resume1.id}`, {
      method: 'PATCH',
      token: alice.data.token,
      body: { label: 'Full-Stack Software Engineer' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.resume.label, 'Full-Stack Software Engineer');

    res = await request(`/api/profile/resumes/${resume1.id}`, {
      method: 'PATCH',
      token: alice.data.token,
      body: { label: '   ' },
    });
    assert.equal(res.status, 400, 'Empty label must be rejected');
    console.log('  PASS: Resume label update works and validates input.');

    // -------------------------------------------------------------------------
    // Scenario 6: Applying with a selected resume & creating snapshot
    // -------------------------------------------------------------------------
    // Create an approved job owned by Company 1 (TechCorp)
    const [jobRes] = await adminConn.query(`
      INSERT INTO jobs (title, description, location, stipend, created_by, posting_source, recruiting_organization, company_id, approval_status, job_status)
      VALUES ('Data Scientist Intern', 'Python, ML, SQL analytics', 'Remote', 25000, 1, 'company', 'TechCorp Solutions', 1, 'approved', 'open')
    `);
    const jobAId = jobRes.insertId;

    // Alice applies to Job A with Resume 2 (Data Science Resume)
    res = await request('/api/jobs/apply', {
      method: 'POST',
      token: alice.data.token,
      body: {
        job_id: jobAId,
        resume_id: resume2.id,
      },
    });
    assert.equal(res.status, 201, `Applying with resume failed: ${JSON.stringify(res.data)}`);
    const appAId = res.data.applicationId;
    assert.ok(appAId > 0);

    // Verify snapshot in application_resumes table
    const [snapshotARows] = await adminConn.query(
      'SELECT * FROM application_resumes WHERE application_id = ?',
      [appAId]
    );
    assert.equal(snapshotARows.length, 1, 'Snapshot record must exist in application_resumes');
    const snapA = snapshotARows[0];
    assert.equal(snapA.student_id, 2);
    assert.equal(snapA.original_resume_id, resume2.id);
    assert.equal(snapA.original_name, 'alice_ds.pdf');
    assert.ok(snapA.storage_key.startsWith('app_'), 'Snapshot file should use app_ prefix');

    const snapAPath = path.join(TEST_STORAGE, snapA.storage_key);
    assert.ok(fs.existsSync(snapAPath), 'Snapshot file must exist in storage');
    const snapAContents = await fsp.readFile(snapAPath);
    assert.equal(Buffer.compare(snapAContents, pdf2Bytes), 0, 'Snapshot bytes must match original chosen resume');
    console.log('  PASS: Application submitted with selected resume; immutable private snapshot created.');

    // -------------------------------------------------------------------------
    // Scenario 7: Rejecting invalid resume IDs or another student's resume ID
    // -------------------------------------------------------------------------
    const [jobBRes] = await adminConn.query(`
      INSERT INTO jobs (title, description, location, stipend, created_by, posting_source, recruiting_organization, company_id, approval_status, job_status)
      VALUES ('Systems Engineer', 'Linux, Docker, Networking', 'Bangalore', 30000, 1, 'company', 'TechCorp Solutions', 1, 'approved', 'open')
    `);
    const jobBId = jobBRes.insertId;

    // Alice tries to use non-existent resume ID
    res = await request('/api/jobs/apply', {
      method: 'POST',
      token: alice.data.token,
      body: { job_id: jobBId, resume_id: 99999 },
    });
    assert.equal(res.status, 400, 'Non-existent resume ID must be rejected');

    // Alice tries to use Bob's resume ID
    res = await request('/api/jobs/apply', {
      method: 'POST',
      token: alice.data.token,
      body: { job_id: jobBId, resume_id: bobResume.id },
    });
    assert.equal(res.status, 400, 'Using another student resume ID must be rejected');
    console.log('  PASS: Invalid and cross-student resume IDs strictly rejected on application.');

    // -------------------------------------------------------------------------
    // Scenario 7B: Applying with no saved resume fails with HTTP 400
    // -------------------------------------------------------------------------
    // Charlie has no uploaded resumes at all. Attempting to apply with resume_id omitted must fail.
    res = await request('/api/jobs/apply', {
      method: 'POST',
      token: charlie.data.token,
      body: { job_id: jobAId },
    });
    assert.equal(res.status, 400, 'Applying with no resume uploaded must return 400');
    assert.ok(
      res.data.error.includes('resume is required'),
      `Expected error mentioning resume required, got: ${JSON.stringify(res.data)}`
    );

    // Verify database consistency: no application record created for Charlie
    const [charlieApps] = await adminConn.query(
      'SELECT id FROM applications WHERE student_id = 5'
    );
    assert.equal(charlieApps.length, 0, 'No application record should exist for Charlie');
    console.log('  PASS: Applying with no saved resume cleanly rejected with HTTP 400; no records created.');

    // -------------------------------------------------------------------------
    // Scenario 7C: Applying with a missing stored resume file
    // -------------------------------------------------------------------------
    // Insert a resume metadata row for Charlie whose file does NOT exist on disk
    const missingStorageKey = '00000000-0000-4000-8000-000000000001.pdf';
    const [missingRowRes] = await adminConn.query(`
      INSERT INTO student_resumes (user_id, label, original_name, storage_key, mime_type, file_size, sha256, is_default)
      VALUES (5, 'Ghost Resume', 'ghost.pdf', ?, 'application/pdf', 1024, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', TRUE)
    `, [missingStorageKey]);
    const missingResumeId = missingRowRes.insertId;

    const beforeMissingFiles = (await fsp.readdir(TEST_STORAGE)).filter(f => f.startsWith('app_'));

    // Charlie applies with the missing resume file
    res = await request('/api/jobs/apply', {
      method: 'POST',
      token: charlie.data.token,
      body: { job_id: jobAId, resume_id: missingResumeId },
    });
    assert.equal(res.status, 400, 'Applying with missing resume file must return 400');
    assert.ok(
      res.data.error.includes('missing or unreadable'),
      `Expected error about missing file, got: ${JSON.stringify(res.data)}`
    );

    // Charlie applies omitting resume_id (falls back to default resume which is missing)
    res = await request('/api/jobs/apply', {
      method: 'POST',
      token: charlie.data.token,
      body: { job_id: jobAId },
    });
    assert.equal(res.status, 400, 'Applying with default missing resume file must return 400');

    // Verify no orphan files and no application row
    const afterMissingFiles = (await fsp.readdir(TEST_STORAGE)).filter(f => f.startsWith('app_'));
    assert.equal(afterMissingFiles.length, beforeMissingFiles.length, 'No orphaned application snapshot file should remain on missing file error');
    const [charlieAppsMissing] = await adminConn.query('SELECT id FROM applications WHERE student_id = 5');
    assert.equal(charlieAppsMissing.length, 0);

    // Clean up ghost resume row
    await adminConn.query('DELETE FROM student_resumes WHERE id = ?', [missingResumeId]);
    console.log('  PASS: Applying with a missing stored resume file rejected with HTTP 400; zero orphan files.');

    // -------------------------------------------------------------------------
    // Scenario 7D: Applying with an invalid stored resume file (magic bytes & hash mismatch)
    // -------------------------------------------------------------------------
    // Subcase 1: Stored file is not a valid PDF (lacks %PDF- signature)
    const invalidStorageKey = '00000000-0000-4000-8000-000000000002.pdf';
    const invalidTextBytes = Buffer.from('THIS IS PLAIN TEXT NOT A PDF DOCUMENT');
    await fsp.writeFile(path.join(TEST_STORAGE, invalidStorageKey), invalidTextBytes);
    const [invalidRowRes] = await adminConn.query(`
      INSERT INTO student_resumes (user_id, label, original_name, storage_key, mime_type, file_size, sha256, is_default)
      VALUES (5, 'Invalid Text Resume', 'fake.pdf', ?, 'application/pdf', ?, ?, TRUE)
    `, [invalidStorageKey, invalidTextBytes.length, crypto.createHash('sha256').update(invalidTextBytes).digest('hex')]);
    const invalidResumeId = invalidRowRes.insertId;

    res = await request('/api/jobs/apply', {
      method: 'POST',
      token: charlie.data.token,
      body: { job_id: jobAId, resume_id: invalidResumeId },
    });
    assert.equal(res.status, 400, 'Applying with non-PDF stored file must return 400');
    assert.ok(res.data.error.includes('not a valid PDF'));

    // Clean up invalid file and row
    await fsp.unlink(path.join(TEST_STORAGE, invalidStorageKey));
    await adminConn.query('DELETE FROM student_resumes WHERE id = ?', [invalidResumeId]);

    // Subcase 2: Stored file hash does not match metadata
    const tamperedStorageKey = '00000000-0000-4000-8000-000000000003.pdf';
    const tamperedPdfBytes = Buffer.from('%PDF-1.7\nCorrupted content\n%%EOF\n');
    await fsp.writeFile(path.join(TEST_STORAGE, tamperedStorageKey), tamperedPdfBytes);
    const [tamperedRowRes] = await adminConn.query(`
      INSERT INTO student_resumes (user_id, label, original_name, storage_key, mime_type, file_size, sha256, is_default)
      VALUES (5, 'Tampered Resume', 'tampered.pdf', ?, 'application/pdf', ?, 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', TRUE)
    `, [tamperedStorageKey, tamperedPdfBytes.length]);
    const tamperedResumeId = tamperedRowRes.insertId;

    res = await request('/api/jobs/apply', {
      method: 'POST',
      token: charlie.data.token,
      body: { job_id: jobAId, resume_id: tamperedResumeId },
    });
    assert.equal(res.status, 400, 'Applying with hash-tampered stored file must return 400');
    assert.ok(res.data.error.includes('hash does not match'));

    // Clean up tampered file and row
    await fsp.unlink(path.join(TEST_STORAGE, tamperedStorageKey));
    await adminConn.query('DELETE FROM student_resumes WHERE id = ?', [tamperedResumeId]);

    const afterInvalidFiles = (await fsp.readdir(TEST_STORAGE)).filter(f => f.startsWith('app_'));
    assert.equal(afterInvalidFiles.length, beforeMissingFiles.length, 'No orphaned application snapshot file should remain on invalid file error');
    console.log('  PASS: Applying with invalid or tampered stored resume file strictly rejected with HTTP 400.');

    // -------------------------------------------------------------------------
    // Scenario 8: Different resumes selected for different applications
    // -------------------------------------------------------------------------
    // Alice applies to Job B with Resume 1 (Software Engineer)
    res = await request('/api/jobs/apply', {
      method: 'POST',
      token: alice.data.token,
      body: {
        job_id: jobBId,
        resume_id: resume1.id,
      },
    });
    assert.equal(res.status, 201);
    const appBId = res.data.applicationId;

    const [snapshotBRows] = await adminConn.query(
      'SELECT * FROM application_resumes WHERE application_id = ?',
      [appBId]
    );
    assert.equal(snapshotBRows.length, 1);
    const snapB = snapshotBRows[0];
    assert.equal(snapB.original_resume_id, resume1.id);
    assert.notEqual(snapB.storage_key, snapA.storage_key, 'Different applications must have distinct snapshot files');

    const snapBContents = await fsp.readFile(path.join(TEST_STORAGE, snapB.storage_key));
    assert.equal(Buffer.compare(snapBContents, pdf1Bytes), 0);
    console.log('  PASS: Different resumes selected and independently snapshotted for different jobs.');

    // -------------------------------------------------------------------------
    // Scenario 9: Exact application snapshot download
    // -------------------------------------------------------------------------
    // Student downloads their own application snapshots
    res = await request(`/api/applications/${appAId}/resume`, { token: alice.data.token });
    assert.equal(res.status, 200);
    assert.equal(Buffer.compare(res.data, pdf2Bytes), 0, 'Alice downloaded snapshot A mismatch');
    assert.equal(res.headers.get('content-type'), 'application/pdf');

    res = await request(`/api/applications/${appBId}/resume`, { token: alice.data.token });
    assert.equal(res.status, 200);
    assert.equal(Buffer.compare(res.data, pdf1Bytes), 0, 'Alice downloaded snapshot B mismatch');
    console.log('  PASS: Applicant successfully downloads exact submitted snapshot per job application.');

    // -------------------------------------------------------------------------
    // Scenario 10: Snapshot remains available after original profile resume is deleted or modified
    // -------------------------------------------------------------------------
    // Alice renames Resume 1 in her profile
    res = await request(`/api/profile/resumes/${resume1.id}`, {
      method: 'PATCH',
      token: alice.data.token,
      body: { label: 'Principal Software Architect' },
    });
    assert.equal(res.status, 200);

    // Application B snapshot must remain completely unaffected by the profile resume modification
    res = await request(`/api/applications/${appBId}/resume`, { token: alice.data.token });
    assert.equal(res.status, 200);
    assert.equal(Buffer.compare(res.data, pdf1Bytes), 0, 'Snapshot B bytes must remain unaltered after profile resume edit');

    // Alice deletes Resume 2 from her profile
    res = await request(`/api/profile/resumes/${resume2.id}`, {
      method: 'DELETE',
      token: alice.data.token,
    });
    assert.equal(res.status, 200, 'Deleting profile resume should succeed');

    // Confirm Resume 2 is gone from student_resumes
    const [deletedProfileRows] = await adminConn.query(
      'SELECT id FROM student_resumes WHERE id = ?',
      [resume2.id]
    );
    assert.equal(deletedProfileRows.length, 0, 'Profile resume row must be deleted');

    // Application A snapshot must STILL be completely downloadable!
    res = await request(`/api/applications/${appAId}/resume`, { token: alice.data.token });
    assert.equal(res.status, 200, 'Snapshot must remain downloadable after profile resume deletion');
    assert.equal(Buffer.compare(res.data, pdf2Bytes), 0, 'Snapshot contents must be preserved unaltered');

    // In DB, original_resume_id is set to NULL due to ON DELETE SET NULL, but row remains intact
    const [preservedSnap] = await adminConn.query(
      'SELECT original_name, storage_key, original_resume_id FROM application_resumes WHERE application_id = ?',
      [appAId]
    );
    assert.equal(preservedSnap.length, 1);
    assert.equal(preservedSnap[0].original_resume_id, null);
    assert.equal(preservedSnap[0].original_name, 'alice_ds.pdf');
    console.log('  PASS: Application snapshot remains immutable and accessible after profile resume deletion.');

    // -------------------------------------------------------------------------
    // Scenario 11: Authorized recruiting-company access and cross-company denial
    // -------------------------------------------------------------------------
    // TechCorp (Company 1) owns Job A and Job B -> should be allowed
    res = await request(`/api/applications/${appAId}/resume`, { token: company1.data.token });
    assert.equal(res.status, 200, `Company 1 should access application resume: ${res.status}`);
    assert.equal(Buffer.compare(res.data, pdf2Bytes), 0);

    // InnoTech (Company 2) does NOT own Job A or Job B -> must be denied (403)
    res = await request(`/api/applications/${appAId}/resume`, { token: company2.data.token });
    assert.equal(res.status, 403, 'Cross-company resume access must be rejected with 403');

    // Bob (another student) -> must be denied (403)
    res = await request(`/api/applications/${appAId}/resume`, { token: bob.data.token });
    assert.equal(res.status, 403, 'Cross-student application resume access must be rejected with 403');

    // Admin -> authorized
    res = await request(`/api/applications/${appAId}/resume`, { token: admin.data.token });
    assert.equal(res.status, 200, 'Admin must be authorized to download application resume');
    assert.equal(Buffer.compare(res.data, pdf2Bytes), 0);
    console.log('  PASS: Strict tenant authorization enforced for recruiters, admins, and students.');

    // -------------------------------------------------------------------------
    // Scenario 12: Duplicate application rejection & job eligibility checks
    // -------------------------------------------------------------------------
    const beforeDupSnapshots = (await fsp.readdir(TEST_STORAGE)).filter(f => f.startsWith('app_'));

    // Alice re-applies to Job B
    res = await request('/api/jobs/apply', {
      method: 'POST',
      token: alice.data.token,
      body: { job_id: jobBId, resume_id: resume1.id },
    });
    assert.equal(res.status, 409, 'Duplicate application must be rejected with 409 Conflict');
    const afterDupSnapshots = (await fsp.readdir(TEST_STORAGE)).filter(f => f.startsWith('app_'));
    assert.equal(afterDupSnapshots.length, beforeDupSnapshots.length, 'No orphaned application snapshot file should remain after duplicate rejection');

    // Apply to non-existent job
    res = await request('/api/jobs/apply', {
      method: 'POST',
      token: alice.data.token,
      body: { job_id: 99999, resume_id: resume1.id },
    });
    assert.equal(res.status, 404, 'Non-existent job application must return 404');
    console.log('  PASS: Duplicate applications and non-existent jobs handled correctly.');

    // -------------------------------------------------------------------------
    // Scenario 13: Old applications without a snapshot remain readable
    // -------------------------------------------------------------------------
    // Seed has application id = 1 (Alice applied to Job 1, created before step 9)
    res = await request('/api/jobs/applicants/1', { token: company1.data.token });
    assert.equal(res.status, 200);
    const applicantRow = res.data.find(a => Number(a.application_id) === 1);
    assert.ok(applicantRow, 'Old application must be returned in applicants list');
    assert.equal(Boolean(applicantRow.has_resume), false, 'Old application has_resume should be false');

    // Attempting to download snapshot for old application without snapshot
    res = await request('/api/applications/1/resume', { token: company1.data.token });
    assert.equal(res.status, 404, 'Old application without snapshot should return 404');

    // Student view of old applications
    res = await request('/api/applications/my', { token: alice.data.token });
    assert.equal(res.status, 200);
    const myOldApp = res.data.find(a => Number(a.id) === 1);
    assert.ok(myOldApp);
    assert.equal(Boolean(myOldApp.has_resume), false);
    console.log('  PASS: Historical applications without resume snapshots remain readable without breaking.');

    // -------------------------------------------------------------------------
    // Scenario 14: Default resume reassignment when deleting default resume
    // -------------------------------------------------------------------------
    // Alice currently has resume1 and resume3
    // Set resume3 as default
    await request(`/api/profile/resumes/${resume3.id}/default`, {
      method: 'PATCH',
      token: alice.data.token,
    });
    // Delete resume3
    await request(`/api/profile/resumes/${resume3.id}`, {
      method: 'DELETE',
      token: alice.data.token,
    });
    // Remaining resume (resume1) should automatically become default
    const [finalDefault] = await adminConn.query(
      'SELECT id, is_default FROM student_resumes WHERE user_id = 2'
    );
    assert.equal(finalDefault.length, 1);
    assert.equal(finalDefault[0].id, resume1.id);
    assert.equal(Boolean(finalDefault[0].is_default), true, 'Remaining resume should be set as default');
    console.log('  PASS: Deleting default resume safely reassigns default to remaining resume.');

    console.log('\n===============================================================');
    console.log('  ALL STEP 9 MULTIPLE RESUMES & SNAPSHOT TESTS PASSED!         ');
    console.log('===============================================================');
  } finally {
    // -------------------------------------------------------------------------
    // Teardown: Close all resources reliably
    // -------------------------------------------------------------------------
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    if (pool) {
      await pool.promise().end();
    }
    try {
      await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
      await adminConn.end();
      console.log(`[Cleanup] Dropped isolated test database '${TEST_DB}'.`);
    } catch (cleanupErr) {
      console.warn('[Cleanup] DB cleanup error:', cleanupErr.message);
    }
    try {
      if (fs.existsSync(TEST_STORAGE)) {
        await fsp.rm(TEST_STORAGE, { recursive: true, force: true });
        console.log(`[Cleanup] Cleaned up temporary test storage directory.`);
      }
    } catch (cleanupErr) {
      console.warn('[Cleanup] Storage cleanup error:', cleanupErr.message);
    }
  }
}

main().catch(err => {
  console.error('\n❌ STEP 9 TEST SUITE FAILED:', err);
  process.exit(1);
});
