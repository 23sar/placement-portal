/**
 * Step 8.2 Student Profile Details API Suite
 * (Skills, Projects, Internships, Achievements)
 *
 * Runs against isolated temporary database: placement_portal_test_step8_details
 * Never targets normal development or production records.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const TEST_DB = 'placement_portal_test_step8_details';
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
  console.log('   Step 8.2: Student Profile Details API Suite                 ');
  console.log('   (Skills, Projects, Internships & Achievements)              ');
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

    const app = require('../src/app');
    pool = require('../src/config/db');
    await new Promise(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        console.log('        Schema and seed accounts provisioned.');
        console.log(`        Test server listening at ${baseUrl}\n`);
        resolve();
      });
    });

    async function request(route, { method = 'GET', body, token } = {}) {
      const headers = {};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
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
    const admin = await login('admin@placement.edu', 'Admin#Dev2026!');

    assert(alice.status === 200 && alice.data.token, `Alice login failed (${alice.status})`);
    assert(bob.status === 200 && bob.data.token, `Bob login failed (${bob.status})`);
    assert(company.status === 200 && company.data.token, `Company login failed (${company.status})`);
    assert(admin.status === 200 && admin.data.token, `Admin login failed (${admin.status})`);

    console.log('[Executing Step 8.2 Test Scenarios]:');

    // -------------------------------------------------------------------------
    // Scenario 1: Authenticated students can list their own empty records
    // -------------------------------------------------------------------------
    const initSkills = await request('/api/profile/me/skills', { token: alice.data.token });
    assert(initSkills.status === 200, `Expected 200 for GET skills, got ${initSkills.status}`);
    assert(Array.isArray(initSkills.data.skills) && initSkills.data.skills.length === 0, 'Initial skills should be empty array');

    const initProjects = await request('/api/profile/me/projects', { token: alice.data.token });
    assert(initProjects.status === 200, `Expected 200 for GET projects, got ${initProjects.status}`);
    assert(Array.isArray(initProjects.data.projects) && initProjects.data.projects.length === 0, 'Initial projects should be empty array');

    const initInternships = await request('/api/profile/me/internships', { token: alice.data.token });
    assert(initInternships.status === 200, `Expected 200 for GET internships, got ${initInternships.status}`);
    assert(Array.isArray(initInternships.data.internships) && initInternships.data.internships.length === 0, 'Initial internships should be empty array');

    const initAchievements = await request('/api/profile/me/achievements', { token: alice.data.token });
    assert(initAchievements.status === 200, `Expected 200 for GET achievements, got ${initAchievements.status}`);
    assert(Array.isArray(initAchievements.data.achievements) && initAchievements.data.achievements.length === 0, 'Initial achievements should be empty array');
    console.log('  ✅ 1. PASS: Authenticated students can list their own profile sections.');

    // -------------------------------------------------------------------------
    // Scenario 2: Students can create valid records in all four categories
    // -------------------------------------------------------------------------
    // 2a. Skill
    const skillRes = await request('/api/profile/me/skills', {
      method: 'POST',
      token: alice.data.token,
      body: { skill_name: 'JavaScript', proficiency: 'advanced' },
    });
    assert(skillRes.status === 201, `Expected 201 for POST skill, got ${skillRes.status}`);
    assert(skillRes.data.skill.skill_name === 'JavaScript', 'Skill name mismatch');
    assert(skillRes.data.skill.proficiency === 'advanced', 'Proficiency mismatch');
    const skillId = skillRes.data.skill.id;

    // 2b. Project
    const projRes = await request('/api/profile/me/projects', {
      method: 'POST',
      token: alice.data.token,
      body: {
        title: 'Placement Portal System',
        description: 'Comprehensive campus placement management system built with Express and MySQL.',
        technologies: 'Node.js, Express, MySQL',
        project_url: 'https://github.com/alice/placement-portal',
        start_date: '2025-01-10',
        end_date: '2025-05-20',
      },
    });
    assert(projRes.status === 201, `Expected 201 for POST project, got ${projRes.status}`);
    assert(projRes.data.project.title === 'Placement Portal System', 'Project title mismatch');
    assert(projRes.data.project.start_date === '2025-01-10', 'Project start_date mismatch');
    const projId = projRes.data.project.id;

    // 2c. Internship
    const internRes = await request('/api/profile/me/internships', {
      method: 'POST',
      token: alice.data.token,
      body: {
        organization: 'Acme Technologies',
        role: 'Full Stack Intern',
        description: 'Developed internal tooling and microservices using Node.js.',
        start_date: '2025-06-01',
        end_date: '2025-08-31',
        experience_url: 'https://acme.example.com/interns/alice',
      },
    });
    assert(internRes.status === 201, `Expected 201 for POST internship, got ${internRes.status}`);
    assert(internRes.data.internship.organization === 'Acme Technologies', 'Internship organization mismatch');
    const internId = internRes.data.internship.id;

    // 2d. Achievement
    const achRes = await request('/api/profile/me/achievements', {
      method: 'POST',
      token: alice.data.token,
      body: {
        title: 'National Hackathon Winner',
        issuer: 'Open Source Initiative',
        description: 'First place out of 120 teams for building an accessible student portal.',
        achieved_on: '2025-09-15',
        credential_url: 'https://credentials.example.org/hackathon-2025',
      },
    });
    assert(achRes.status === 201, `Expected 201 for POST achievement, got ${achRes.status}`);
    assert(achRes.data.achievement.title === 'National Hackathon Winner', 'Achievement title mismatch');
    const achId = achRes.data.achievement.id;

    console.log('  ✅ 2. PASS: Students can create valid records in all four categories.');

    // -------------------------------------------------------------------------
    // Scenario 3: Students can update their own records
    // -------------------------------------------------------------------------
    // 3a. Update Skill
    const updateSkillRes = await request(`/api/profile/me/skills/${skillId}`, {
      method: 'PATCH',
      token: alice.data.token,
      body: { proficiency: 'expert' },
    });
    assert(updateSkillRes.status === 200, `Expected 200 for PATCH skill, got ${updateSkillRes.status}`);
    assert(updateSkillRes.data.skill.proficiency === 'expert', 'Skill proficiency was not updated');

    // 3b. Update Project
    const updateProjRes = await request(`/api/profile/me/projects/${projId}`, {
      method: 'PATCH',
      token: alice.data.token,
      body: { title: 'Placement Portal Enterprise' },
    });
    assert(updateProjRes.status === 200, `Expected 200 for PATCH project, got ${updateProjRes.status}`);
    assert(updateProjRes.data.project.title === 'Placement Portal Enterprise', 'Project title was not updated');
    assert(updateProjRes.data.project.description.includes('Comprehensive'), 'Omitted fields should be preserved');

    // 3c. Update Internship
    const updateInternRes = await request(`/api/profile/me/internships/${internId}`, {
      method: 'PATCH',
      token: alice.data.token,
      body: { role: 'Lead Backend Intern' },
    });
    assert(updateInternRes.status === 200, `Expected 200 for PATCH internship, got ${updateInternRes.status}`);
    assert(updateInternRes.data.internship.role === 'Lead Backend Intern', 'Internship role was not updated');

    // 3d. Update Achievement
    const updateAchRes = await request(`/api/profile/me/achievements/${achId}`, {
      method: 'PATCH',
      token: alice.data.token,
      body: { issuer: 'Global Tech Foundation' },
    });
    assert(updateAchRes.status === 200, `Expected 200 for PATCH achievement, got ${updateAchRes.status}`);
    assert(updateAchRes.data.achievement.issuer === 'Global Tech Foundation', 'Achievement issuer was not updated');

    console.log('  ✅ 3. PASS: Students can update their own records across all categories.');

    // -------------------------------------------------------------------------
    // Scenario 4: Students can delete their own records
    // -------------------------------------------------------------------------
    // Create temporary skill to delete
    const tempSkill = await request('/api/profile/me/skills', {
      method: 'POST',
      token: alice.data.token,
      body: { skill_name: 'Python', proficiency: 'intermediate' },
    });
    const tempSkillId = tempSkill.data.skill.id;

    const delSkillRes = await request(`/api/profile/me/skills/${tempSkillId}`, {
      method: 'DELETE',
      token: alice.data.token,
    });
    assert(delSkillRes.status === 200, `Expected 200 for DELETE skill, got ${delSkillRes.status}`);

    const verifyDel = await request('/api/profile/me/skills', { token: alice.data.token });
    assert(!verifyDel.data.skills.some(s => s.id === tempSkillId), 'Deleted skill should no longer appear in list');

    console.log('  ✅ 4. PASS: Students can delete their own records.');

    // -------------------------------------------------------------------------
    // Scenario 5: Cross-student authorization isolation (Bob cannot access/edit Alice's items)
    // -------------------------------------------------------------------------
    // Bob tries to update Alice's skill
    const bobUpdateSkill = await request(`/api/profile/me/skills/${skillId}`, {
      method: 'PATCH',
      token: bob.data.token,
      body: { proficiency: 'beginner' },
    });
    assert(bobUpdateSkill.status === 404, `Expected 404 for cross-student skill update, got ${bobUpdateSkill.status}`);

    // Bob tries to delete Alice's project
    const bobDelProj = await request(`/api/profile/me/projects/${projId}`, {
      method: 'DELETE',
      token: bob.data.token,
    });
    assert(bobDelProj.status === 404, `Expected 404 for cross-student project delete, got ${bobDelProj.status}`);

    // Bob lists his own skills: Alice's skills must not appear
    const bobSkills = await request('/api/profile/me/skills', { token: bob.data.token });
    assert(bobSkills.data.skills.length === 0, "Bob's skills list should not contain Alice's records");

    console.log('  ✅ 5. PASS: Strict tenant isolation prevents cross-student access or modification.');

    // -------------------------------------------------------------------------
    // Scenario 6: Requests from unauthenticated users are denied (401)
    // -------------------------------------------------------------------------
    const unauthGet = await request('/api/profile/me/skills');
    assert(unauthGet.status === 401, `Expected 401 for unauthenticated GET, got ${unauthGet.status}`);

    const unauthPost = await request('/api/profile/me/projects', {
      method: 'POST',
      body: { title: 'Hack', description: 'Unauthorized attempt' },
    });
    assert(unauthPost.status === 401, `Expected 401 for unauthenticated POST, got ${unauthPost.status}`);

    console.log('  ✅ 6. PASS: Unauthenticated requests are rejected with HTTP 401.');

    // -------------------------------------------------------------------------
    // Scenario 7: Non-student roles are denied (403 for company, admin)
    // -------------------------------------------------------------------------
    const coSkills = await request('/api/profile/me/skills', { token: company.data.token });
    assert(coSkills.status === 403, `Expected 403 for company accessing student details, got ${coSkills.status}`);

    const admProjects = await request('/api/profile/me/projects', { token: admin.data.token });
    assert(admProjects.status === 403, `Expected 403 for admin accessing student details, got ${admProjects.status}`);

    console.log('  ✅ 7. PASS: Non-student roles (company, admin) are forbidden with HTTP 403.');

    // -------------------------------------------------------------------------
    // Scenario 8: Invalid, oversized or malformed fields are rejected (400)
    // -------------------------------------------------------------------------
    // Missing skill_name
    const noSkillName = await request('/api/profile/me/skills', {
      method: 'POST',
      token: alice.data.token,
      body: { proficiency: 'expert' },
    });
    assert(noSkillName.status === 400, `Expected 400 for missing skill_name, got ${noSkillName.status}`);

    // Oversized title (> 150)
    const longProjTitle = await request('/api/profile/me/projects', {
      method: 'POST',
      token: alice.data.token,
      body: {
        title: 'P'.repeat(151),
        description: 'Valid description with over ten characters.',
      },
    });
    assert(longProjTitle.status === 400, `Expected 400 for project title > 150 chars, got ${longProjTitle.status}`);

    // Short project description (< 10)
    const shortProjDesc = await request('/api/profile/me/projects', {
      method: 'POST',
      token: alice.data.token,
      body: {
        title: 'Project Title',
        description: 'Too short',
      },
    });
    assert(shortProjDesc.status === 400, `Expected 400 for description < 10 chars, got ${shortProjDesc.status}`);

    // Empty update body
    const emptyPatch = await request(`/api/profile/me/skills/${skillId}`, {
      method: 'PATCH',
      token: alice.data.token,
      body: {},
    });
    assert(emptyPatch.status === 400, `Expected 400 for empty PATCH, got ${emptyPatch.status}`);

    console.log('  ✅ 8. PASS: Missing required fields, oversized lengths, and empty payloads rejected with HTTP 400.');

    // -------------------------------------------------------------------------
    // Scenario 9: Invalid dates and end dates before start dates are rejected
    // -------------------------------------------------------------------------
    // End date before start date
    const invertedDates = await request('/api/profile/me/projects', {
      method: 'POST',
      token: alice.data.token,
      body: {
        title: 'Date Order Test',
        description: 'Valid description for date order testing.',
        start_date: '2025-06-01',
        end_date: '2025-05-01',
      },
    });
    assert(invertedDates.status === 400, `Expected 400 for end_date < start_date, got ${invertedDates.status}`);
    assert(/precede/i.test(invertedDates.data.error), 'Expected error to mention end_date cannot precede start_date');

    // Invalid calendar day (April 31)
    const invalidApr = await request('/api/profile/me/internships', {
      method: 'POST',
      token: alice.data.token,
      body: {
        organization: 'Acme Corp',
        role: 'Intern',
        start_date: '2025-04-31',
      },
    });
    assert(invalidApr.status === 400, `Expected 400 for invalid calendar date (2025-04-31), got ${invalidApr.status}`);

    // Malformed date string
    const malformedDate = await request('/api/profile/me/achievements', {
      method: 'POST',
      token: alice.data.token,
      body: {
        title: 'Award',
        achieved_on: '31-12-2025',
      },
    });
    assert(malformedDate.status === 400, `Expected 400 for malformed date, got ${malformedDate.status}`);

    console.log('  ✅ 9. PASS: Invalid calendar dates and end dates before start dates are rejected.');

    // -------------------------------------------------------------------------
    // Scenario 10: Invalid URLs and unsupported proficiency values are rejected
    // -------------------------------------------------------------------------
    // Invalid URL protocol
    const badUrl = await request('/api/profile/me/projects', {
      method: 'POST',
      token: alice.data.token,
      body: {
        title: 'Valid Project',
        description: 'Valid description for bad URL testing.',
        project_url: 'ftp://files.example.com/project',
      },
    });
    assert(badUrl.status === 400, `Expected 400 for ftp URL, got ${badUrl.status}`);

    // Invalid proficiency enum value
    const badProf = await request('/api/profile/me/skills', {
      method: 'POST',
      token: alice.data.token,
      body: { skill_name: 'Rust', proficiency: 'godlike' },
    });
    assert(badProf.status === 400, `Expected 400 for unsupported proficiency, got ${badProf.status}`);

    console.log('  ✅ 10. PASS: Invalid URLs and unsupported proficiency levels are rejected.');

    // -------------------------------------------------------------------------
    // Scenario 11: Protected fields and client-supplied user IDs cannot forge ownership
    // -------------------------------------------------------------------------
    const forgedPost = await request('/api/profile/me/skills', {
      method: 'POST',
      token: alice.data.token,
      body: {
        skill_name: 'Go',
        proficiency: 'intermediate',
        user_id: 999, // Attempt to assign to another user
      },
    });
    assert(forgedPost.status === 400, `Expected 400 for protected field 'user_id', got ${forgedPost.status}`);

    const forgedPatch = await request(`/api/profile/me/projects/${projId}`, {
      method: 'PATCH',
      token: alice.data.token,
      body: { user_id: 999 },
    });
    assert(forgedPatch.status === 400, `Expected 400 for protected field on update, got ${forgedPatch.status}`);

    console.log('  ✅ 11. PASS: Protected fields (user_id, id) strictly rejected and ownership cannot be forged.');

    // -------------------------------------------------------------------------
    // Scenario 12: Duplicate skills are handled consistently (409 Conflict)
    // -------------------------------------------------------------------------
    // Try to add 'JavaScript' again (case-insensitive check)
    const dupSkill = await request('/api/profile/me/skills', {
      method: 'POST',
      token: alice.data.token,
      body: { skill_name: 'javascript', proficiency: 'intermediate' },
    });
    assert(dupSkill.status === 409, `Expected 409 for duplicate skill name, got ${dupSkill.status}`);
    assert(/already exists/i.test(dupSkill.data.error), 'Expected duplicate error message');

    console.log('  ✅ 12. PASS: Duplicate skills for the same student are prevented with HTTP 409 Conflict.');

    // -------------------------------------------------------------------------
    // Scenario 13: Partial profile updates and Part 8.1 profile API continue to work
    // -------------------------------------------------------------------------
    const p81Update = await request('/api/profile/me', {
      method: 'PATCH',
      token: alice.data.token,
      body: { department: 'Computer Science & Engineering', cgpa: 9.25 },
    });
    assert(p81Update.status === 200, `Expected 200 for Part 8.1 profile update, got ${p81Update.status}`);
    assert(p81Update.data.profile.department === 'Computer Science & Engineering', 'Department mismatch');
    assert(Number(p81Update.data.profile.cgpa) === 9.25, 'CGPA mismatch');

    const p81Get = await request('/api/profile/me', { token: alice.data.token });
    assert(p81Get.status === 200, `Expected 200 for Part 8.1 profile get, got ${p81Get.status}`);
    assert(p81Get.data.profile.email === 'alice@example.com', 'Core account email preserved');

    console.log('  ✅ 13. PASS: Part 8.1 core profile API continues working alongside details.');

    // -------------------------------------------------------------------------
    // Scenario 14: Non-existent IDs return 404 cleanly
    // -------------------------------------------------------------------------
    const badIdGet = await request('/api/profile/me/skills/999999', {
      method: 'DELETE',
      token: alice.data.token,
    });
    assert(badIdGet.status === 404, `Expected 404 for deleting non-existent skill, got ${badIdGet.status}`);

    const invalidIdFormat = await request('/api/profile/me/skills/invalid-id', {
      method: 'PATCH',
      token: alice.data.token,
      body: { proficiency: 'beginner' },
    });
    assert(invalidIdFormat.status === 400, `Expected 400 for invalid ID format, got ${invalidIdFormat.status}`);

    console.log('  ✅ 14. PASS: Non-existent IDs return HTTP 404 and malformed IDs return HTTP 400.');

    // -------------------------------------------------------------------------
    // Scenario 15: Frontend-compatible /api/profile/details endpoint
    // -------------------------------------------------------------------------
    const detailsRes = await request('/api/profile/details', { token: alice.data.token });
    assert(detailsRes.status === 200, `Expected 200 for /api/profile/details, got ${detailsRes.status}`);
    assert(detailsRes.data.details && typeof detailsRes.data.details === 'object', 'Missing details object in response');
    assert(Array.isArray(detailsRes.data.details.skills), 'details.skills must be an array');
    assert(Array.isArray(detailsRes.data.details.projects), 'details.projects must be an array');
    assert(Array.isArray(detailsRes.data.details.internships), 'details.internships must be an array');
    assert(Array.isArray(detailsRes.data.details.achievements), 'details.achievements must be an array');
    assert(Array.isArray(detailsRes.data.skills), 'top-level skills must be an array');

    // Section CRUD through /api/profile/details/:section
    const secAdd = await request('/api/profile/details/skills', {
      method: 'POST',
      token: alice.data.token,
      body: { skill_name: 'GraphQL', proficiency: 'intermediate' },
    });
    assert(secAdd.status === 201, `Expected 201 for POST /api/profile/details/skills, got ${secAdd.status}`);
    const secSkillId = secAdd.data.skill.id;

    const secUpdate = await request(`/api/profile/details/skills/${secSkillId}`, {
      method: 'PATCH',
      token: alice.data.token,
      body: { proficiency: 'expert' },
    });
    assert(secUpdate.status === 200, `Expected 200 for PATCH /api/profile/details/skills/:id, got ${secUpdate.status}`);
    assert(secUpdate.data.skill.proficiency === 'expert', 'Expected updated proficiency to be expert');

    const secList = await request('/api/profile/details/skills', { token: alice.data.token });
    assert(secList.status === 200, `Expected 200 for GET /api/profile/details/skills, got ${secList.status}`);
    assert(secList.data.skills.some(s => s.id === secSkillId), 'Newly added skill must be present in section list');

    const secDelete = await request(`/api/profile/details/skills/${secSkillId}`, {
      method: 'DELETE',
      token: alice.data.token,
    });
    assert(secDelete.status === 200, `Expected 200 for DELETE /api/profile/details/skills/:id, got ${secDelete.status}`);

    // Invalid section returns 404
    const badSec = await request('/api/profile/details/invalid_section', { token: alice.data.token });
    assert(badSec.status === 404, `Expected 404 for invalid section, got ${badSec.status}`);

    // Unauthenticated access rejected
    const unauthDetails = await request('/api/profile/details');
    assert(unauthDetails.status === 401, `Expected 401 for unauthenticated /details, got ${unauthDetails.status}`);

    // Non-student access forbidden
    const companyDetails = await request('/api/profile/details', { token: company.data.token });
    assert(companyDetails.status === 403, `Expected 403 for company access to /details, got ${companyDetails.status}`);

    console.log('  ✅ 15. PASS: Frontend-compatible /api/profile/details and /details/:section endpoints verified.');

    console.log('\n===============================================================');
    console.log('  ✨ ALL STEP 8.2 PROFILE DETAILS API TESTS PASSED!             ');
    console.log('===============================================================\n');

  } catch (err) {
    console.error('\n❌ STEP 8.2 TEST RUNNER ENCOUNTERED AN ERROR:');
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
            await adminConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
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
