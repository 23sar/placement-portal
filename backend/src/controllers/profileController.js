const db = require('../config/db');

// Only placement-related fields belong in this profile API. Account identity
// (name, email, role, password, is_active) remains controlled by auth/admin flows.
const EDITABLE_FIELDS = {
  phone: { kind: 'phone', max: 25 },
  department: { kind: 'text', min: 2, max: 100 },
  degree_program: { kind: 'text', min: 2, max: 120 },
  graduation_year: { kind: 'year' },
  roll_number: { kind: 'text', min: 1, max: 50 },
  cgpa: { kind: 'cgpa' },
  backlog_count: { kind: 'backlogs' },
  technical_interests: { kind: 'text', min: 1, max: 1000 },
  github_url: { kind: 'url' },
  linkedin_url: { kind: 'url' },
  portfolio_url: { kind: 'url' },
};


function validationError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function normalizeField(field, value) {
  const rule = EDITABLE_FIELDS[field];
  if (!rule) throw validationError(`Field '${field}' cannot be updated through this endpoint.`);

  // These are optional fields. Empty strings clear a value; they never bypass
  // validation for a non-empty value.
  if (value === null || value === '') return null;

  if (rule.kind === 'text') {
    if (typeof value !== 'string') throw validationError(`${field} must be a string.`);
    const clean = value.trim();
    if (!clean && field !== 'technical_interests') throw validationError(`${field} cannot be empty.`);
    if (!clean) return null;
    if (clean.length < rule.min || clean.length > rule.max) {
      throw validationError(`${field} must be between ${rule.min} and ${rule.max} characters.`);
    }
    return clean;
  }

  if (rule.kind === 'phone') {
    if (typeof value !== 'string') throw validationError('phone must be a string.');
    const clean = value.trim();
    if (!clean) return null;
    if (clean.length > rule.max || !/^\+?[0-9][0-9\s().-]{5,23}$/.test(clean)) {
      throw validationError('phone must be a valid phone number (7–25 characters).');
    }
    return clean;
  }

  if (rule.kind === 'year') {
    const n = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() ? Number(value) : NaN);
    if (!Number.isInteger(n) || n < 2000 || n > 2100) {
      throw validationError('graduation_year must be a whole year between 2000 and 2100.');
    }
    return n;
  }

  if (rule.kind === 'cgpa') {
    const n = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() ? Number(value) : NaN);
    if (!Number.isFinite(n) || n < 0 || n > 10 || Math.round(n * 100) !== n * 100) {
      throw validationError('cgpa must be a finite number between 0 and 10 with at most 2 decimal places.');
    }
    return n;
  }

  if (rule.kind === 'backlogs') {
    const n = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() ? Number(value) : NaN);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      throw validationError('backlog_count must be a whole number between 0 and 100.');
    }
    return n;
  }

  if (rule.kind === 'url') {
    if (typeof value !== 'string') throw validationError(`${field} must be a URL string.`);
    const clean = value.trim();
    if (!clean) return null;
    if (clean.length > 255) throw validationError(`${field} must be 255 characters or fewer.`);
    let parsed;
    try { parsed = new URL(clean); } catch { throw validationError(`${field} must be a valid URL.`); }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      throw validationError(`${field} must be an http or https URL without embedded credentials.`);
    }
    return parsed.toString();
  }

  throw validationError(`Unsupported value for ${field}.`);
}

async function selectOwnProfile(userId) {
  const [rows] = await db.promise().query(
    `SELECT
       u.id AS user_id, u.name, u.email,
       p.phone, p.department, p.degree_program, p.graduation_year,
       p.roll_number, p.cgpa, p.backlog_count, p.technical_interests,
       p.github_url, p.linkedin_url, p.portfolio_url,
       p.created_at AS profile_created_at, p.updated_at AS profile_updated_at
     FROM users u
     LEFT JOIN student_profiles p ON p.user_id = u.id
     WHERE u.id = ? AND u.role = 'student' AND u.is_active = TRUE
     LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

exports.getMyProfile = async (req, res) => {
  try {
    const profile = await selectOwnProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Student account not found.' });
    return res.status(200).json({ profile });
  } catch (err) {
    console.error('[getMyProfile] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to load student profile.' });
  }
};

exports.updateMyProfile = async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object.' });
  }

  const keys = Object.keys(body);
  if (!keys.length) return res.status(400).json({ error: 'Provide at least one profile field to update.' });

  const unknown = keys.filter(key => !Object.prototype.hasOwnProperty.call(EDITABLE_FIELDS, key));
  if (unknown.length) {
    return res.status(400).json({ error: `Unsupported or protected profile field(s): ${unknown.join(', ')}.` });
  }

  const normalized = {};
  try {
    for (const key of keys) normalized[key] = normalizeField(key, body[key]);

    // Select first to distinguish a new profile from a partial update. Only the
    // explicitly supplied columns are updated so omitted fields are preserved.
    const [existingRows] = await db.promise().query(
      'SELECT user_id FROM student_profiles WHERE user_id = ? LIMIT 1',
      [req.user.id],
    );

    if (existingRows.length) {
      const columns = keys.map(key => `\`${key}\` = ?`).join(', ');
      const values = keys.map(key => normalized[key]);
      await db.promise().query(
        `UPDATE student_profiles SET ${columns} WHERE user_id = ?`,
        [...values, req.user.id],
      );
    } else {
      // Column names are selected from the static allowlist above.
      const columns = ['user_id', ...keys];
      const placeholders = columns.map(() => '?').join(', ');
      await db.promise().query(
        `INSERT INTO student_profiles (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${placeholders})`,
        [req.user.id, ...keys.map(key => normalized[key])],
      );
    }

    const profile = await selectOwnProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'Student account not found.' });
    return res.status(200).json({ message: 'Student profile updated.', profile });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Profile was updated concurrently. Reload it and retry.' });
    }
    console.error('[updateMyProfile] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to update student profile.' });
  }
};

/* =============================================================================
 * Helper Functions for Profile Details (Skills, Projects, Internships, Achievements)
 * ============================================================================= */

const ALLOWED_PROFICIENCIES = ['beginner', 'intermediate', 'advanced', 'expert'];

function parseIdParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw validationError('Invalid record ID provided.');
  }
  return id;
}

function checkBodyKeys(body, allowedKeys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw validationError('Request body must be a JSON object.');
  }
  const keys = Object.keys(body);
  if (!keys.length) {
    throw validationError('Request body cannot be empty.');
  }
  const unknown = keys.filter(k => !allowedKeys.includes(k));
  if (unknown.length) {
    throw validationError(`Unsupported or protected field(s): ${unknown.join(', ')}.`);
  }
}

function parseText(field, val, { min = 1, max = 255, required = false } = {}) {
  if (val === undefined || val === null || val === '') {
    if (required) throw validationError(`${field} is required.`);
    return null;
  }
  if (typeof val !== 'string') throw validationError(`${field} must be a string.`);
  const clean = val.trim();
  if (!clean) {
    if (required) throw validationError(`${field} cannot be empty.`);
    return null;
  }
  if (clean.length < min || clean.length > max) {
    throw validationError(`${field} must be between ${min} and ${max} characters.`);
  }
  return clean;
}

function parseProficiency(val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val !== 'string') throw validationError(`proficiency must be one of: ${ALLOWED_PROFICIENCIES.join(', ')}.`);
  const clean = val.trim().toLowerCase();
  if (!clean) return null;
  if (!ALLOWED_PROFICIENCIES.includes(clean)) {
    throw validationError(`proficiency must be one of: ${ALLOWED_PROFICIENCIES.join(', ')}.`);
  }
  return clean;
}

function parseDate(field, val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val !== 'string') throw validationError(`${field} must be a valid date string (YYYY-MM-DD).`);
  const trimmed = val.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw validationError(`${field} must be in YYYY-MM-DD format.`);

  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);

  if (m < 1 || m > 12) throw validationError(`${field} contains an invalid month.`);

  const isLeap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d < 1 || d > daysInMonth[m - 1]) throw validationError(`${field} contains an invalid day for the given month/year.`);

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseUrl(field, val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val !== 'string') throw validationError(`${field} must be a URL string.`);
  const clean = val.trim();
  if (!clean) return null;
  if (clean.length > 255) throw validationError(`${field} must be 255 characters or fewer.`);
  let parsed;
  try { parsed = new URL(clean); } catch { throw validationError(`${field} must be a valid URL.`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw validationError(`${field} must be an http or https URL without embedded credentials.`);
  }
  return parsed.toString();
}

/* =============================================================================
 * 1. Skills Endpoints
 * ============================================================================= */

const SKILL_FIELDS = ['skill_name', 'proficiency'];

exports.getSkills = async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      'SELECT id, user_id, skill_name, proficiency, created_at, updated_at FROM student_skills WHERE user_id = ? ORDER BY id ASC',
      [req.user.id]
    );
    return res.status(200).json({ skills: rows });
  } catch (err) {
    console.error('[getSkills] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to load skills.' });
  }
};

exports.addSkill = async (req, res) => {
  try {
    checkBodyKeys(req.body, SKILL_FIELDS);
    const skillName = parseText('skill_name', req.body.skill_name, { min: 1, max: 100, required: true });
    const proficiency = parseProficiency(req.body.proficiency);

    // Duplicate check
    const [existing] = await db.promise().query(
      'SELECT id FROM student_skills WHERE user_id = ? AND LOWER(skill_name) = LOWER(?)',
      [req.user.id, skillName]
    );
    if (existing.length) {
      return res.status(409).json({ error: `Skill '${skillName}' already exists in your profile.` });
    }

    const [result] = await db.promise().query(
      'INSERT INTO student_skills (user_id, skill_name, proficiency) VALUES (?, ?, ?)',
      [req.user.id, skillName, proficiency]
    );

    const [rows] = await db.promise().query(
      'SELECT id, user_id, skill_name, proficiency, created_at, updated_at FROM student_skills WHERE id = ?',
      [result.insertId]
    );
    return res.status(201).json({ message: 'Skill added.', skill: rows[0] });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Skill already exists in your profile.' });
    }
    console.error('[addSkill] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to add skill.' });
  }
};

exports.updateSkill = async (req, res) => {
  try {
    const id = parseIdParam(req);
    checkBodyKeys(req.body, SKILL_FIELDS);

    const [existing] = await db.promise().query(
      'SELECT id, user_id, skill_name, proficiency FROM student_skills WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (!existing.length) {
      return res.status(404).json({ error: 'Skill not found.' });
    }

    const updates = {};
    if (req.body.skill_name !== undefined) {
      const newName = parseText('skill_name', req.body.skill_name, { min: 1, max: 100, required: true });
      const [dup] = await db.promise().query(
        'SELECT id FROM student_skills WHERE user_id = ? AND LOWER(skill_name) = LOWER(?) AND id != ?',
        [req.user.id, newName, id]
      );
      if (dup.length) {
        return res.status(409).json({ error: `Skill '${newName}' already exists in your profile.` });
      }
      updates.skill_name = newName;
    }
    if (req.body.proficiency !== undefined) {
      updates.proficiency = parseProficiency(req.body.proficiency);
    }

    const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
    const values = Object.values(updates);
    await db.promise().query(
      `UPDATE student_skills SET ${setClauses} WHERE id = ? AND user_id = ?`,
      [...values, id, req.user.id]
    );

    const [rows] = await db.promise().query(
      'SELECT id, user_id, skill_name, proficiency, created_at, updated_at FROM student_skills WHERE id = ?',
      [id]
    );
    return res.status(200).json({ message: 'Skill updated.', skill: rows[0] });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Skill already exists in your profile.' });
    }
    console.error('[updateSkill] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to update skill.' });
  }
};

exports.deleteSkill = async (req, res) => {
  try {
    const id = parseIdParam(req);
    const [result] = await db.promise().query(
      'DELETE FROM student_skills WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Skill not found.' });
    }
    return res.status(200).json({ message: 'Skill deleted.' });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[deleteSkill] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to delete skill.' });
  }
};

/* =============================================================================
 * 2. Projects Endpoints
 * ============================================================================= */

const PROJECT_FIELDS = ['title', 'description', 'technologies', 'project_url', 'start_date', 'end_date'];

exports.getProjects = async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT id, user_id, title, description, technologies, project_url,
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
              created_at, updated_at
       FROM student_projects
       WHERE user_id = ?
       ORDER BY start_date DESC, id DESC`,
      [req.user.id]
    );
    return res.status(200).json({ projects: rows });
  } catch (err) {
    console.error('[getProjects] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to load projects.' });
  }
};

exports.addProject = async (req, res) => {
  try {
    checkBodyKeys(req.body, PROJECT_FIELDS);
    const title = parseText('title', req.body.title, { min: 2, max: 150, required: true });
    const description = parseText('description', req.body.description, { min: 10, max: 5000, required: true });
    const technologies = parseText('technologies', req.body.technologies, { min: 1, max: 255, required: false });
    const projectUrl = parseUrl('project_url', req.body.project_url);
    const startDate = parseDate('start_date', req.body.start_date);
    const endDate = parseDate('end_date', req.body.end_date);

    if (startDate && endDate && endDate < startDate) {
      throw validationError('end_date cannot precede start_date.');
    }

    const [result] = await db.promise().query(
      `INSERT INTO student_projects
        (user_id, title, description, technologies, project_url, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, title, description, technologies, projectUrl, startDate, endDate]
    );

    const [rows] = await db.promise().query(
      `SELECT id, user_id, title, description, technologies, project_url,
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
              created_at, updated_at
       FROM student_projects WHERE id = ?`,
      [result.insertId]
    );
    return res.status(201).json({ message: 'Project added.', project: rows[0] });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[addProject] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to add project.' });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const id = parseIdParam(req);
    checkBodyKeys(req.body, PROJECT_FIELDS);

    const [existing] = await db.promise().query(
      `SELECT id, user_id, title, description, technologies, project_url,
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
       FROM student_projects WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    if (!existing.length) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const current = existing[0];
    const updates = {};

    if (req.body.title !== undefined) {
      updates.title = parseText('title', req.body.title, { min: 2, max: 150, required: true });
    }
    if (req.body.description !== undefined) {
      updates.description = parseText('description', req.body.description, { min: 10, max: 5000, required: true });
    }
    if (req.body.technologies !== undefined) {
      updates.technologies = parseText('technologies', req.body.technologies, { min: 1, max: 255, required: false });
    }
    if (req.body.project_url !== undefined) {
      updates.project_url = parseUrl('project_url', req.body.project_url);
    }

    const effectiveStart = req.body.start_date !== undefined ? parseDate('start_date', req.body.start_date) : current.start_date;
    const effectiveEnd = req.body.end_date !== undefined ? parseDate('end_date', req.body.end_date) : current.end_date;

    if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
      throw validationError('end_date cannot precede start_date.');
    }

    if (req.body.start_date !== undefined) updates.start_date = effectiveStart;
    if (req.body.end_date !== undefined) updates.end_date = effectiveEnd;

    const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
    const values = Object.values(updates);
    await db.promise().query(
      `UPDATE student_projects SET ${setClauses} WHERE id = ? AND user_id = ?`,
      [...values, id, req.user.id]
    );

    const [rows] = await db.promise().query(
      `SELECT id, user_id, title, description, technologies, project_url,
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
              created_at, updated_at
       FROM student_projects WHERE id = ?`,
      [id]
    );
    return res.status(200).json({ message: 'Project updated.', project: rows[0] });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[updateProject] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to update project.' });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const id = parseIdParam(req);
    const [result] = await db.promise().query(
      'DELETE FROM student_projects WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    return res.status(200).json({ message: 'Project deleted.' });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[deleteProject] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to delete project.' });
  }
};

/* =============================================================================
 * 3. Internships Endpoints
 * ============================================================================= */

const INTERNSHIP_FIELDS = ['organization', 'role', 'description', 'start_date', 'end_date', 'experience_url'];

exports.getInternships = async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT id, user_id, organization, role, description,
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
              experience_url, created_at, updated_at
       FROM student_internships
       WHERE user_id = ?
       ORDER BY start_date DESC, id DESC`,
      [req.user.id]
    );
    return res.status(200).json({ internships: rows });
  } catch (err) {
    console.error('[getInternships] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to load internships.' });
  }
};

exports.addInternship = async (req, res) => {
  try {
    checkBodyKeys(req.body, INTERNSHIP_FIELDS);
    const organization = parseText('organization', req.body.organization, { min: 2, max: 150, required: true });
    const role = parseText('role', req.body.role, { min: 2, max: 100, required: true });
    const description = parseText('description', req.body.description, { min: 1, max: 5000, required: false });
    const experienceUrl = parseUrl('experience_url', req.body.experience_url);
    const startDate = parseDate('start_date', req.body.start_date);
    const endDate = parseDate('end_date', req.body.end_date);

    if (startDate && endDate && endDate < startDate) {
      throw validationError('end_date cannot precede start_date.');
    }

    const [result] = await db.promise().query(
      `INSERT INTO student_internships
        (user_id, organization, role, description, start_date, end_date, experience_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, organization, role, description, startDate, endDate, experienceUrl]
    );

    const [rows] = await db.promise().query(
      `SELECT id, user_id, organization, role, description,
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
              experience_url, created_at, updated_at
       FROM student_internships WHERE id = ?`,
      [result.insertId]
    );
    return res.status(201).json({ message: 'Internship added.', internship: rows[0] });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[addInternship] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to add internship.' });
  }
};

exports.updateInternship = async (req, res) => {
  try {
    const id = parseIdParam(req);
    checkBodyKeys(req.body, INTERNSHIP_FIELDS);

    const [existing] = await db.promise().query(
      `SELECT id, user_id, organization, role, description,
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
              experience_url
       FROM student_internships WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    if (!existing.length) {
      return res.status(404).json({ error: 'Internship not found.' });
    }

    const current = existing[0];
    const updates = {};

    if (req.body.organization !== undefined) {
      updates.organization = parseText('organization', req.body.organization, { min: 2, max: 150, required: true });
    }
    if (req.body.role !== undefined) {
      updates.role = parseText('role', req.body.role, { min: 2, max: 100, required: true });
    }
    if (req.body.description !== undefined) {
      updates.description = parseText('description', req.body.description, { min: 1, max: 5000, required: false });
    }
    if (req.body.experience_url !== undefined) {
      updates.experience_url = parseUrl('experience_url', req.body.experience_url);
    }

    const effectiveStart = req.body.start_date !== undefined ? parseDate('start_date', req.body.start_date) : current.start_date;
    const effectiveEnd = req.body.end_date !== undefined ? parseDate('end_date', req.body.end_date) : current.end_date;

    if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
      throw validationError('end_date cannot precede start_date.');
    }

    if (req.body.start_date !== undefined) updates.start_date = effectiveStart;
    if (req.body.end_date !== undefined) updates.end_date = effectiveEnd;

    const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
    const values = Object.values(updates);
    await db.promise().query(
      `UPDATE student_internships SET ${setClauses} WHERE id = ? AND user_id = ?`,
      [...values, id, req.user.id]
    );

    const [rows] = await db.promise().query(
      `SELECT id, user_id, organization, role, description,
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
              experience_url, created_at, updated_at
       FROM student_internships WHERE id = ?`,
      [id]
    );
    return res.status(200).json({ message: 'Internship updated.', internship: rows[0] });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[updateInternship] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to update internship.' });
  }
};

exports.deleteInternship = async (req, res) => {
  try {
    const id = parseIdParam(req);
    const [result] = await db.promise().query(
      'DELETE FROM student_internships WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Internship not found.' });
    }
    return res.status(200).json({ message: 'Internship deleted.' });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[deleteInternship] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to delete internship.' });
  }
};

/* =============================================================================
 * 4. Achievements Endpoints
 * ============================================================================= */

const ACHIEVEMENT_FIELDS = ['title', 'issuer', 'description', 'achieved_on', 'credential_url'];

exports.getAchievements = async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT id, user_id, title, issuer, description,
              DATE_FORMAT(achieved_on, '%Y-%m-%d') AS achieved_on,
              credential_url, created_at, updated_at
       FROM student_achievements
       WHERE user_id = ?
       ORDER BY achieved_on DESC, id DESC`,
      [req.user.id]
    );
    return res.status(200).json({ achievements: rows });
  } catch (err) {
    console.error('[getAchievements] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to load achievements.' });
  }
};

exports.addAchievement = async (req, res) => {
  try {
    checkBodyKeys(req.body, ACHIEVEMENT_FIELDS);
    const title = parseText('title', req.body.title, { min: 2, max: 150, required: true });
    const issuer = parseText('issuer', req.body.issuer, { min: 2, max: 150, required: false });
    const description = parseText('description', req.body.description, { min: 1, max: 5000, required: false });
    const achievedOn = parseDate('achieved_on', req.body.achieved_on);
    const credentialUrl = parseUrl('credential_url', req.body.credential_url);

    const [result] = await db.promise().query(
      `INSERT INTO student_achievements
        (user_id, title, issuer, description, achieved_on, credential_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, title, issuer, description, achievedOn, credentialUrl]
    );

    const [rows] = await db.promise().query(
      `SELECT id, user_id, title, issuer, description,
              DATE_FORMAT(achieved_on, '%Y-%m-%d') AS achieved_on,
              credential_url, created_at, updated_at
       FROM student_achievements WHERE id = ?`,
      [result.insertId]
    );
    return res.status(201).json({ message: 'Achievement added.', achievement: rows[0] });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[addAchievement] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to add achievement.' });
  }
};

exports.updateAchievement = async (req, res) => {
  try {
    const id = parseIdParam(req);
    checkBodyKeys(req.body, ACHIEVEMENT_FIELDS);

    const [existing] = await db.promise().query(
      `SELECT id, user_id, title, issuer, description,
              DATE_FORMAT(achieved_on, '%Y-%m-%d') AS achieved_on,
              credential_url
       FROM student_achievements WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    if (!existing.length) {
      return res.status(404).json({ error: 'Achievement not found.' });
    }

    const updates = {};
    if (req.body.title !== undefined) {
      updates.title = parseText('title', req.body.title, { min: 2, max: 150, required: true });
    }
    if (req.body.issuer !== undefined) {
      updates.issuer = parseText('issuer', req.body.issuer, { min: 2, max: 150, required: false });
    }
    if (req.body.description !== undefined) {
      updates.description = parseText('description', req.body.description, { min: 1, max: 5000, required: false });
    }
    if (req.body.achieved_on !== undefined) {
      updates.achieved_on = parseDate('achieved_on', req.body.achieved_on);
    }
    if (req.body.credential_url !== undefined) {
      updates.credential_url = parseUrl('credential_url', req.body.credential_url);
    }

    const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
    const values = Object.values(updates);
    await db.promise().query(
      `UPDATE student_achievements SET ${setClauses} WHERE id = ? AND user_id = ?`,
      [...values, id, req.user.id]
    );

    const [rows] = await db.promise().query(
      `SELECT id, user_id, title, issuer, description,
              DATE_FORMAT(achieved_on, '%Y-%m-%d') AS achieved_on,
              credential_url, created_at, updated_at
       FROM student_achievements WHERE id = ?`,
      [id]
    );
    return res.status(200).json({ message: 'Achievement updated.', achievement: rows[0] });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[updateAchievement] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to update achievement.' });
  }
};

exports.deleteAchievement = async (req, res) => {
  try {
    const id = parseIdParam(req);
    const [result] = await db.promise().query(
      'DELETE FROM student_achievements WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Achievement not found.' });
    }
    return res.status(200).json({ message: 'Achievement deleted.' });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[deleteAchievement] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to delete achievement.' });
  }
};

/* =============================================================================
 * 5. Aggregated Profile Details Endpoint (for frontend /api/profile/details)
 * ============================================================================= */

exports.getProfileDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const [skills] = await db.promise().query(
      'SELECT id, user_id, skill_name, proficiency, created_at, updated_at FROM student_skills WHERE user_id = ? ORDER BY id ASC',
      [userId]
    );
    const [projects] = await db.promise().query(
      `SELECT id, user_id, title, description, technologies, project_url,
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
              created_at, updated_at
       FROM student_projects
       WHERE user_id = ?
       ORDER BY start_date DESC, id DESC`,
      [userId]
    );
    const [internships] = await db.promise().query(
      `SELECT id, user_id, organization, role, description,
              DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
              DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
              experience_url, created_at, updated_at
       FROM student_internships
       WHERE user_id = ?
       ORDER BY start_date DESC, id DESC`,
      [userId]
    );
    const [achievements] = await db.promise().query(
      `SELECT id, user_id, title, issuer, description,
              DATE_FORMAT(achieved_on, '%Y-%m-%d') AS achieved_on,
              credential_url, created_at, updated_at
       FROM student_achievements
       WHERE user_id = ?
       ORDER BY achieved_on DESC, id DESC`,
      [userId]
    );

    const details = {
      skills,
      projects,
      internships,
      achievements,
    };

    return res.status(200).json({
      details,
      sections: details,
      skills,
      projects,
      internships,
      achievements,
    });
  } catch (err) {
    console.error('[getProfileDetails] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to load profile details.' });
  }
};
