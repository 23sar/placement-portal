const db = require('../config/db');

exports.applyJob = (req, res) => {
  const { job_id }   = req.body;
  const student_id   = req.user.id;

  if (!job_id) return res.status(400).json({ error: 'job_id is required.' });

  db.query('SELECT id FROM jobs WHERE id = ?', [job_id], (err, jobs) => {
    if (err) {
      console.error('[applyJob] job check error:', err.message);
      return res.status(500).json({ error: 'Application failed. Please try again.' });
    }
    if (jobs.length === 0) return res.status(404).json({ error: 'Job not found.' });

    db.query(
      'SELECT id FROM applications WHERE job_id = ? AND student_id = ?',
      [job_id, student_id],
      (err2, existing) => {
        if (err2) {
          console.error('[applyJob] duplicate check error:', err2.message);
          return res.status(500).json({ error: 'Application failed. Please try again.' });
        }
        if (existing.length > 0) {
          return res.status(409).json({ error: 'You have already applied for this job.' });
        }

        db.query(
          'INSERT INTO applications (job_id, student_id) VALUES (?, ?)',
          [job_id, student_id],
          (err3, result) => {
            if (err3) {
              if (err3.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: 'You have already applied for this job.' });
              }
              console.error('[applyJob] insert error:', err3.message);
              return res.status(500).json({ error: 'Application failed. Please try again.' });
            }
            return res.status(201).json({
              message: 'Application submitted successfully.',
              applicationId: result.insertId,
            });
          },
        );
      },
    );
  });
};

/** Company: list applicants for one of their own jobs. */
exports.getApplicants = (req, res) => {
  const job_id     = req.params.jobId;
  const company_id = req.user.id;

  // Verify ownership first
  db.query(
    'SELECT id FROM jobs WHERE id = ? AND company_id = ?',
    [job_id, company_id],
    (err, jobs) => {
      if (err) {
        console.error('[getApplicants] ownership check error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch applicants.' });
      }
      if (jobs.length === 0) {
        return res.status(404).json({ error: 'Job not found or you do not have access to it.' });
      }

      const sql = `
        SELECT
          applications.id   AS application_id,
          applications.status,
          applications.created_at,
          users.id          AS student_id,
          users.name,
          users.email
        FROM applications
        JOIN users ON applications.student_id = users.id
        WHERE applications.job_id = ?
        ORDER BY applications.created_at DESC
      `;
      db.query(sql, [job_id], (err2, rows) => {
        if (err2) {
          console.error('[getApplicants] fetch error:', err2.message);
          return res.status(500).json({ error: 'Failed to fetch applicants.' });
        }
        return res.status(200).json(rows);
      });
    },
  );
};

/** Student: list their own applications. */
exports.getMyApplications = (req, res) => {
  const sql = `
    SELECT
      applications.id,
      applications.status,
      applications.created_at,
      jobs.id     AS job_id,
      jobs.title,
      jobs.location,
      jobs.stipend,
      users.name  AS company
    FROM applications
    JOIN jobs  ON applications.job_id      = jobs.id
    JOIN users ON jobs.company_id          = users.id
    WHERE applications.student_id = ?
    ORDER BY applications.created_at DESC
  `;
  db.query(sql, [req.user.id], (err, rows) => {
    if (err) {
      console.error('[getMyApplications] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch applications.' });
    }
    return res.status(200).json(rows);
  });
};

/** Company: update the status of an application they own. */
exports.updateApplicationStatus = (req, res) => {
  const { applicationId } = req.params;
  const { status }        = req.body;
  const company_id        = req.user.id;

  const VALID = ['pending', 'shortlisted', 'rejected'];
  if (!status || !VALID.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${VALID.join(', ')}.` });
  }

  const sql = `
    UPDATE applications
    SET status = ?
    WHERE id = ?
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
      return res.status(404).json({ error: 'Application not found or you do not have access.' });
    }
    return res.status(200).json({ message: 'Status updated successfully.' });
  });
};

/** Per-role dashboard statistics. */
exports.getDashboardStats = (req, res) => {
  const { id, role } = req.user;

  if (role === 'student') {
    const sql = `
      SELECT
        COUNT(*)                                                    AS total,
        SUM(CASE WHEN status = 'shortlisted' THEN 1 ELSE 0 END)   AS shortlisted,
        SUM(CASE WHEN status = 'rejected'    THEN 1 ELSE 0 END)   AS rejected,
        SUM(CASE WHEN status = 'pending'     THEN 1 ELSE 0 END)   AS pending
      FROM applications
      WHERE student_id = ?
    `;
    db.query(sql, [id], (err, rows) => {
      if (err) {
        console.error('[getDashboardStats/student] DB error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch stats.' });
      }
      return res.status(200).json(rows[0]);
    });
  } else if (role === 'company') {
    const sql = `
      SELECT
        COUNT(DISTINCT jobs.id)                                              AS total_jobs,
        COUNT(applications.id)                                               AS total_applications,
        SUM(CASE WHEN applications.status = 'shortlisted' THEN 1 ELSE 0 END) AS shortlisted,
        SUM(CASE WHEN applications.status = 'pending'     THEN 1 ELSE 0 END) AS pending
      FROM jobs
      LEFT JOIN applications ON jobs.id = applications.job_id
      WHERE jobs.company_id = ?
    `;
    db.query(sql, [id], (err, rows) => {
      if (err) {
        console.error('[getDashboardStats/company] DB error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch stats.' });
      }
      return res.status(200).json(rows[0]);
    });
  } else {
    return res.status(403).json({ error: 'Access forbidden.' });
  }
};
