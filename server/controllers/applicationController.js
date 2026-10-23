const db = require('../config/db');

exports.applyJob = (req, res) => {
  const { job_id } = req.body;
  const student_id = req.user.id;

  if (!job_id) {
    return res.status(400).json({ error: 'job_id is required.' });
  }

  // First verify job exists
  db.query('SELECT id FROM jobs WHERE id = ?', [job_id], (err, jobs) => {
    if (err) {
      console.error('[applyJob] DB error checking job:', err.message);
      return res.status(500).json({ error: 'Application failed. Please try again.' });
    }
    if (jobs.length === 0) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    // Check for duplicate application
    db.query(
      'SELECT id FROM applications WHERE job_id = ? AND student_id = ?',
      [job_id, student_id],
      (err2, existing) => {
        if (err2) {
          console.error('[applyJob] DB error checking duplicate:', err2.message);
          return res.status(500).json({ error: 'Application failed. Please try again.' });
        }
        if (existing.length > 0) {
          return res.status(409).json({ error: 'You have already applied for this job.' });
        }

        // Insert application
        db.query(
          'INSERT INTO applications (job_id, student_id) VALUES (?, ?)',
          [job_id, student_id],
          (err3, result) => {
            if (err3) {
              // Catch DB-level unique constraint as well
              if (err3.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: 'You have already applied for this job.' });
              }
              console.error('[applyJob] DB error inserting:', err3.message);
              return res.status(500).json({ error: 'Application failed. Please try again.' });
            }
            return res.status(201).json({ message: 'Application submitted successfully.', applicationId: result.insertId });
          }
        );
      }
    );
  });
};

/**
 * Get applicants for a specific job.
 * SECURITY FIX: Verifies the requesting company owns the job before returning data.
 */
exports.getApplicants = (req, res) => {
  const job_id = req.params.jobId;
  const company_id = req.user.id;

  // Verify ownership first
  db.query('SELECT id FROM jobs WHERE id = ? AND company_id = ?', [job_id, company_id], (err, jobs) => {
    if (err) {
      console.error('[getApplicants] DB ownership check error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch applicants.' });
    }
    if (jobs.length === 0) {
      // Returns 404 whether job doesn't exist OR company doesn't own it (avoids job ID enumeration)
      return res.status(404).json({ error: 'Job not found or you do not have access to it.' });
    }

    const sql = `
      SELECT
        applications.id AS application_id,
        applications.status,
        applications.created_at,
        users.id AS student_id,
        users.name,
        users.email
      FROM applications
      JOIN users ON applications.student_id = users.id
      WHERE applications.job_id = ?
      ORDER BY applications.created_at DESC
    `;

    db.query(sql, [job_id], (err2, result) => {
      if (err2) {
        console.error('[getApplicants] DB error fetching applicants:', err2.message);
        return res.status(500).json({ error: 'Failed to fetch applicants.' });
      }
      return res.status(200).json(result);
    });
  });
};

/**
 * Get all applications for the authenticated student.
 */
exports.getMyApplications = (req, res) => {
  const student_id = req.user.id;

  const sql = `
    SELECT
      applications.id,
      applications.status,
      applications.created_at,
      jobs.id AS job_id,
      jobs.title,
      jobs.location,
      jobs.stipend,
      users.name AS company
    FROM applications
    JOIN jobs ON applications.job_id = jobs.id
    JOIN users ON jobs.company_id = users.id
    WHERE applications.student_id = ?
    ORDER BY applications.created_at DESC
  `;

  db.query(sql, [student_id], (err, result) => {
    if (err) {
      console.error('[getMyApplications] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch applications.' });
    }
    return res.status(200).json(result);
  });
};

/**
 * Update application status (company only).
 * SECURITY: Verifies the company owns the job associated with the application.
 */
exports.updateApplicationStatus = (req, res) => {
  const { applicationId } = req.params;
  const { status } = req.body;
  const company_id = req.user.id;

  const ALLOWED_STATUSES = ['pending', 'shortlisted', 'rejected'];
  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}.` });
  }

  // Verify the company owns the job linked to this application
  const sql = `
    UPDATE applications
    SET status = ?
    WHERE applications.id = ?
      AND EXISTS (
        SELECT 1 FROM jobs
        WHERE jobs.id = applications.job_id
          AND jobs.company_id = ?
      )
  `;

  db.query(sql, [status, applicationId, company_id], (err, result) => {
    if (err) {
      console.error('[updateApplicationStatus] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to update status.' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Application not found or you do not have access to it.' });
    }
    return res.status(200).json({ message: 'Application status updated successfully.' });
  });
};

/**
 * Get dashboard stats for the authenticated user.
 * Returns real data from DB based on user role.
 */
exports.getDashboardStats = (req, res) => {
  const { id, role } = req.user;

  if (role === 'student') {
    const sql = `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'shortlisted' THEN 1 ELSE 0 END) AS shortlisted,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
      FROM applications
      WHERE student_id = ?
    `;
    db.query(sql, [id], (err, result) => {
      if (err) {
        console.error('[getDashboardStats] DB error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch stats.' });
      }
      return res.status(200).json(result[0]);
    });
  } else if (role === 'company') {
    const sql = `
      SELECT
        COUNT(DISTINCT jobs.id) AS total_jobs,
        COUNT(applications.id) AS total_applications,
        SUM(CASE WHEN applications.status = 'shortlisted' THEN 1 ELSE 0 END) AS shortlisted,
        SUM(CASE WHEN applications.status = 'pending' THEN 1 ELSE 0 END) AS pending
      FROM jobs
      LEFT JOIN applications ON jobs.id = applications.job_id
      WHERE jobs.company_id = ?
    `;
    db.query(sql, [id], (err, result) => {
      if (err) {
        console.error('[getDashboardStats] DB error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch stats.' });
      }
      return res.status(200).json(result[0]);
    });
  } else {
    return res.status(403).json({ error: 'Access forbidden.' });
  }
};