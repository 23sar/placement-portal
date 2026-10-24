const db = require('../config/db');

exports.createJob = (req, res) => {
  const { title, description, location, stipend } = req.body;
  const company_id = req.user.id;

  if (!title || !description || !location) {
    return res.status(400).json({ error: 'title, description, and location are required.' });
  }

  db.query(
    'INSERT INTO jobs (title, description, location, stipend, company_id) VALUES (?, ?, ?, ?, ?)',
    [title, description, location, stipend || null, company_id],
    (err, result) => {
      if (err) {
        console.error('[createJob] DB error:', err.message);
        return res.status(500).json({ error: 'Failed to create job. Please try again.' });
      }
      return res.status(201).json({ message: 'Job created successfully.', jobId: result.insertId });
    },
  );
};

exports.getJobs = (req, res) => {
  const sql = `
    SELECT
      jobs.id,
      jobs.title,
      jobs.description,
      jobs.location,
      jobs.stipend,
      jobs.company_id,
      users.name AS company
    FROM jobs
    JOIN users ON jobs.company_id = users.id
    ORDER BY jobs.id DESC
  `;
  db.query(sql, (err, rows) => {
    if (err) {
      console.error('[getJobs] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch jobs.' });
    }
    return res.status(200).json(rows);
  });
};

exports.getJobById = (req, res) => {
  const sql = `
    SELECT
      jobs.id,
      jobs.title,
      jobs.description,
      jobs.location,
      jobs.stipend,
      jobs.company_id,
      users.name AS company
    FROM jobs
    JOIN users ON jobs.company_id = users.id
    WHERE jobs.id = ?
  `;
  db.query(sql, [req.params.id], (err, rows) => {
    if (err) {
      console.error('[getJobById] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch job.' });
    }
    if (rows.length === 0) return res.status(404).json({ error: 'Job not found.' });
    return res.status(200).json(rows[0]);
  });
};

/** Returns only jobs posted by the authenticated company. */
exports.getMyJobs = (req, res) => {
  const sql = `
    SELECT
      jobs.id,
      jobs.title,
      jobs.location,
      jobs.stipend,
      jobs.created_at,
      COUNT(applications.id) AS application_count
    FROM jobs
    LEFT JOIN applications ON jobs.id = applications.job_id
    WHERE jobs.company_id = ?
    GROUP BY jobs.id
    ORDER BY jobs.id DESC
  `;
  db.query(sql, [req.user.id], (err, rows) => {
    if (err) {
      console.error('[getMyJobs] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch your jobs.' });
    }
    return res.status(200).json(rows);
  });
};

exports.deleteJob = (req, res) => {
  db.query(
    'DELETE FROM jobs WHERE id = ? AND company_id = ?',
    [req.params.id, req.user.id],
    (err, result) => {
      if (err) {
        console.error('[deleteJob] DB error:', err.message);
        return res.status(500).json({ error: 'Failed to delete job.' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Job not found or you do not own it.' });
      }
      return res.status(200).json({ message: 'Job deleted successfully.' });
    },
  );
};
