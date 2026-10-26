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
