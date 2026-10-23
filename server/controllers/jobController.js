const db = require('../config/db');

exports.createJob = (req, res) => {
  const { title, description, location, stipend } = req.body;
  const company_id = req.user.id;

  // --- Input validation ---
  if (!title || !description || !location) {
    return res.status(400).json({ error: 'title, description, and location are required.' });
  }

  const sql = 'INSERT INTO jobs (title, description, location, stipend, company_id) VALUES (?, ?, ?, ?, ?)';

  db.query(sql, [title, description, location, stipend || null, company_id], (err, result) => {
    if (err) {
      console.error('[createJob] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to create job. Please try again.' });
    }
    return res.status(201).json({ message: 'Job created successfully.', jobId: result.insertId });
  });
};

exports.getJobs = (req, res) => {
  // Join users table to get the company name; avoid SELECT *
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

  db.query(sql, (err, result) => {
    if (err) {
      console.error('[getJobs] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch jobs. Please try again.' });
    }
    return res.status(200).json(result);
  });
};

exports.getJobById = (req, res) => {
  const jobId = req.params.id;

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

  db.query(sql, [jobId], (err, result) => {
    if (err) {
      console.error('[getJobById] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch job.' });
    }
    if (result.length === 0) {
      return res.status(404).json({ error: 'Job not found.' });
    }
    return res.status(200).json(result[0]);
  });
};

exports.deleteJob = (req, res) => {
  const jobId = req.params.id;
  const company_id = req.user.id;

  // Only the owning company can delete the job
  const sql = 'DELETE FROM jobs WHERE id = ? AND company_id = ?';

  db.query(sql, [jobId, company_id], (err, result) => {
    if (err) {
      console.error('[deleteJob] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to delete job.' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Job not found or you do not own it.' });
    }
    return res.status(200).json({ message: 'Job deleted successfully.' });
  });
};