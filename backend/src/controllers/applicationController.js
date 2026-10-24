const db = require('../config/db');

/**
 * applyJob — Student applies for an approved and open job posting.
 * Rejects applications if:
 *   - Job is not approved (pending or rejected)
 *   - Job is closed
 *   - Job deadline has expired
 * Preserves duplicate application prevention.
 */
exports.applyJob = async (req, res) => {
  const { job_id } = req.body;
  const student_id = req.user.id;

  if (!job_id) return res.status(400).json({ error: 'job_id is required.' });
  const parsedJobId = Number(job_id);
  if (isNaN(parsedJobId) || parsedJobId <= 0) {
    return res.status(400).json({ error: 'Invalid job_id provided.' });
  }

  try {
    const [jobs] = await db.promise().query(
      'SELECT id, approval_status, job_status, application_deadline FROM jobs WHERE id = ?',
      [parsedJobId]
    );

    if (!jobs || jobs.length === 0) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const job = jobs[0];

    // 1. Approval Check: Only approved jobs accept applications
    if (job.approval_status !== 'approved') {
      return res.status(400).json({ error: 'Cannot apply to a job that is not approved by the Placement Cell.' });
    }

    // 2. Availability Check: Only open jobs accept applications
    if (job.job_status !== 'open') {
      return res.status(400).json({ error: 'This job posting is closed for applications.' });
    }

    // 3. Deadline Check: Missing/NULL deadline means open indefinitely
    if (job.application_deadline && new Date(job.application_deadline) < new Date()) {
      return res.status(400).json({ error: 'The application deadline for this job has passed.' });
    }

    // 4. Duplicate Check
    const [existing] = await db.promise().query(
      'SELECT id FROM applications WHERE job_id = ? AND student_id = ?',
      [parsedJobId, student_id]
    );

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'You have already applied for this job.' });
    }

    // 5. Submit application
    const [result] = await db.promise().query(
      'INSERT INTO applications (job_id, student_id) VALUES (?, ?)',
      [parsedJobId, student_id]
    );

    return res.status(201).json({
      message: 'Application submitted successfully.',
      applicationId: result.insertId,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'You have already applied for this job.' });
    }
    console.error('[applyJob] DB error:', err.message);
    return res.status(500).json({ error: 'Application failed. Please try again.' });
  }
};

/**
 * getApplicants — Company can view applicants for their own job; Admin can view all.
 */
exports.getApplicants = async (req, res) => {
  const job_id = req.params.jobId;
  const user   = req.user;

  try {
    if (user.role !== 'admin') {
      const [jobs] = await db.promise().query(
        'SELECT id FROM jobs WHERE id = ? AND company_id = ?',
        [job_id, user.id]
      );
      if (!jobs || jobs.length === 0) {
        return res.status(404).json({ error: 'Job not found or you do not have access to it.' });
      }
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
    const [rows] = await db.promise().query(sql, [job_id]);
    return res.status(200).json(rows);
  } catch (err) {
    console.error('[getApplicants] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch applicants.' });
  }
};

/**
 * getMyApplications — Student views their own applications.
 * Uses recruiting_organization to support both internal and external companies.
 */
exports.getMyApplications = async (req, res) => {
  const sql = `
    SELECT
      applications.id,
      applications.status,
      applications.created_at,
      jobs.id     AS job_id,
      jobs.title,
      jobs.location,
      jobs.stipend,
      jobs.recruiting_organization AS company
    FROM applications
    JOIN jobs ON applications.job_id = jobs.id
    WHERE applications.student_id = ?
    ORDER BY applications.created_at DESC
  `;
  try {
    const [rows] = await db.promise().query(sql, [req.user.id]);
    return res.status(200).json(rows);
  } catch (err) {
    console.error('[getMyApplications] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch applications.' });
  }
};

/**
 * updateApplicationStatus — Company updates applicant review status (pending, shortlisted, rejected).
 */
exports.updateApplicationStatus = async (req, res) => {
  const { applicationId } = req.params;
  const { status }        = req.body;
  const user              = req.user;

  const VALID = ['pending', 'shortlisted', 'rejected'];
  if (!status || !VALID.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${VALID.join(', ')}.` });
  }

  try {
    let result;
    if (user.role === 'admin') {
      [result] = await db.promise().query(
        'UPDATE applications SET status = ? WHERE id = ?',
        [status, applicationId]
      );
    } else {
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
      [result] = await db.promise().query(sql, [status, applicationId, user.id]);
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Application not found or you do not have access.' });
    }
    return res.status(200).json({ message: 'Status updated successfully.', status });
  } catch (err) {
    console.error('[updateApplicationStatus] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to update status.' });
  }
};

/**
 * getDashboardStats — Per-role metrics.
 */
exports.getDashboardStats = async (req, res) => {
  const { id, role } = req.user;

  try {
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
      const [rows] = await db.promise().query(sql, [id]);
      return res.status(200).json(rows[0]);

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
      const [rows] = await db.promise().query(sql, [id]);
      return res.status(200).json(rows[0]);

    } else if (role === 'admin') {
      const [jobRows] = await db.promise().query(`
        SELECT
          COUNT(*)                                                               AS total_jobs,
          SUM(CASE WHEN posting_source = 'company' AND approval_status = 'pending' THEN 1 ELSE 0 END) AS total_jobs_awaiting_approval,
          SUM(CASE WHEN posting_source = 'company' AND approval_status = 'pending' THEN 1 ELSE 0 END) AS pending_approvals,
          SUM(CASE WHEN approval_status = 'approved' THEN 1 ELSE 0 END)          AS total_approved_jobs,
          SUM(CASE WHEN approval_status = 'approved' THEN 1 ELSE 0 END)          AS approved_jobs,
          SUM(CASE WHEN approval_status = 'approved' AND job_status = 'open' AND (application_deadline IS NULL OR application_deadline >= NOW()) THEN 1 ELSE 0 END) AS open_approved_jobs,
          SUM(CASE WHEN approval_status = 'rejected' THEN 1 ELSE 0 END)          AS rejected_jobs
        FROM jobs
      `);
      const [companyRows] = await db.promise().query(
        "SELECT COUNT(*) AS total_active_companies FROM users WHERE role = 'company' AND is_active = TRUE"
      );
      const [appRows] = await db.promise().query('SELECT COUNT(*) AS total_applications FROM applications');

      return res.status(200).json({
        total_jobs: Number(jobRows[0].total_jobs || 0),
        total_jobs_awaiting_approval: Number(jobRows[0].total_jobs_awaiting_approval || 0),
        pending_approvals: Number(jobRows[0].pending_approvals || 0),
        total_approved_jobs: Number(jobRows[0].total_approved_jobs || 0),
        approved_jobs: Number(jobRows[0].approved_jobs || 0),
        open_approved_jobs: Number(jobRows[0].open_approved_jobs || 0),
        rejected_jobs: Number(jobRows[0].rejected_jobs || 0),
        total_active_companies: Number(companyRows[0].total_active_companies || 0),
        active_companies: Number(companyRows[0].total_active_companies || 0),
        total_applications: Number(appRows[0].total_applications || 0),
      });

    } else {
      return res.status(403).json({ error: 'Access forbidden.' });
    }
  } catch (err) {
    console.error('[getDashboardStats] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats.' });
  }
};
