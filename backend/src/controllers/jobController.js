const db = require('../config/db');

/**
 * Helper to validate positive decimal or null for compensation
 */
function parseStipend(val) {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  if (isNaN(num) || num < 0) return NaN;
  return num;
}

/**
 * Helper to validate date string or null
 */
function parseDeadline(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * createJob — Role-specific job creation.
 * Company:
 *   - created_by = req.user.id
 *   - company_id = req.user.id
 *   - recruiting_organization = req.user.name
 *   - posting_source = 'company'
 *   - approval_status = 'pending' (client cannot override)
 *   - job_status = 'open'
 * Admin:
 *   - created_by = req.user.id
 *   - posting_source = 'placement_cell'
 *   - approval_status = 'approved' (published directly)
 *   - job_status = 'open'
 *   - company_id: validated registered company or NULL
 *   - recruiting_organization: required string snapshot
 */
exports.createJob = async (req, res) => {
  const user = req.user;
  const {
    title,
    description,
    location,
    stipend,
    application_deadline,
    eligibility_criteria,
    recruiting_organization,
    company_id,
  } = req.body;

  // 1. Sanitize text fields
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanDesc  = typeof description === 'string' ? description.trim() : '';
  const cleanLoc   = typeof location === 'string' ? location.trim() : '';

  if (!cleanTitle || !cleanDesc || !cleanLoc) {
    return res.status(400).json({ error: 'Title, description, and location are required and cannot be empty.' });
  }

  // 2. Validate stipend
  const parsedStipend = parseStipend(stipend);
  if (Number.isNaN(parsedStipend)) {
    return res.status(400).json({ error: 'Invalid stipend value. Must be a non-negative number.' });
  }

  // 3. Validate deadline
  const parsedDeadline = parseDeadline(application_deadline);
  if (parsedDeadline === false) {
    return res.status(400).json({ error: 'Invalid application_deadline format.' });
  }

  const cleanEligibility = typeof eligibility_criteria === 'string' && eligibility_criteria.trim()
    ? eligibility_criteria.trim()
    : null;

  // 4. Role-Specific Logic
  if (user.role === 'company') {
    // Company user cannot specify approval_status, creator, or different company_id
    const finalCreatedBy = user.id;
    const finalCompanyId = user.id;
    const finalOrg       = user.name;
    const finalSource    = 'company';
    const finalApproval  = 'pending';
    const finalStatus    = 'open';

    try {
      const [result] = await db.promise().query(
        `INSERT INTO jobs (
          title, description, location, stipend,
          created_by, posting_source, recruiting_organization, company_id,
          approval_status, job_status, application_deadline, eligibility_criteria
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cleanTitle, cleanDesc, cleanLoc, parsedStipend,
          finalCreatedBy, finalSource, finalOrg, finalCompanyId,
          finalApproval, finalStatus, parsedDeadline, cleanEligibility,
        ]
      );

      return res.status(201).json({
        message: 'Job submitted successfully and is awaiting Placement Cell approval.',
        jobId: result.insertId,
        approval_status: 'pending',
      });
    } catch (err) {
      console.error('[createJob/company] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to submit job. Please try again.' });
    }

  } else if (user.role === 'admin') {
    // Admin user: published directly as approved
    let targetCompanyId = null;
    let targetOrg = typeof recruiting_organization === 'string' ? recruiting_organization.trim() : '';

    if (company_id !== undefined && company_id !== null && company_id !== '') {
      const coIdNum = Number(company_id);
      if (isNaN(coIdNum) || coIdNum <= 0) {
        return res.status(400).json({ error: 'Invalid company_id provided.' });
      }

      try {
        const [coRows] = await db.promise().query(
          'SELECT id, name, role, is_active FROM users WHERE id = ?',
          [coIdNum]
        );
        if (!coRows || coRows.length === 0 || coRows[0].role !== 'company') {
          return res.status(400).json({ error: 'Selected company_id must belong to a registered company account.' });
        }
        if (!coRows[0].is_active) {
          return res.status(400).json({ error: 'Selected company account is deactivated.' });
        }

        targetCompanyId = coRows[0].id;
        if (!targetOrg) targetOrg = coRows[0].name;
      } catch (err) {
        console.error('[createJob/admin] Company validation error:', err.message);
        return res.status(500).json({ error: 'Failed to validate company account.' });
      }
    }

    if (!targetOrg) {
      return res.status(400).json({ error: 'Recruiting organization name is required.' });
    }

    try {
      const [result] = await db.promise().query(
        `INSERT INTO jobs (
          title, description, location, stipend,
          created_by, posting_source, recruiting_organization, company_id,
          approval_status, job_status, application_deadline, eligibility_criteria
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cleanTitle, cleanDesc, cleanLoc, parsedStipend,
          user.id, 'placement_cell', targetOrg, targetCompanyId,
          'approved', 'open', parsedDeadline, cleanEligibility,
        ]
      );

      return res.status(201).json({
        message: 'Job published successfully.',
        jobId: result.insertId,
        approval_status: 'approved',
      });
    } catch (err) {
      console.error('[createJob/admin] DB error:', err.message);
      return res.status(500).json({ error: 'Failed to publish job. Please try again.' });
    }

  } else {
    return res.status(403).json({ error: 'Access forbidden. Only companies and administrators can create jobs.' });
  }
};

/**
 * getPendingJobs — Administrator Pending Approval Queue.
 * Only returns company-created jobs with approval_status = 'pending'.
 * Includes job details, recruiting organization, submitting company info,
 * creation timestamp, deadline, and eligibility criteria.
 */
exports.getPendingJobs = async (req, res) => {
  const user = req.user;
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Access forbidden. Administrator role required.' });
  }

  const sql = `
    SELECT
      jobs.id,
      jobs.title,
      jobs.description,
      jobs.location,
      jobs.stipend,
      jobs.created_by,
      jobs.posting_source,
      jobs.recruiting_organization,
      jobs.recruiting_organization AS company,
      jobs.company_id,
      jobs.approval_status,
      jobs.job_status,
      jobs.application_deadline,
      jobs.eligibility_criteria,
      jobs.created_at,
      users.name AS submitting_company_name,
      users.email AS submitting_company_email
    FROM jobs
    JOIN users ON jobs.created_by = users.id
    WHERE jobs.posting_source = 'company'
      AND jobs.approval_status = 'pending'
    ORDER BY jobs.created_at ASC
  `;

  try {
    const [rows] = await db.promise().query(sql);
    return res.status(200).json(rows);
  } catch (err) {
    console.error('[getPendingJobs] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch pending jobs.' });
  }
};

/**
 * reviewJobApproval — Administrator Approval and Rejection API.
 * PATCH /api/jobs/:id/approval
 * Request body:
 *   - approval_status: 'approved' | 'rejected'
 *   - rejection_reason: required when rejecting
 */
exports.reviewJobApproval = async (req, res) => {
  const user = req.user;
  const jobId = Number(req.params.id);

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Access forbidden. Administrator role required.' });
  }

  if (isNaN(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Invalid job ID provided.' });
  }

  const { approval_status, rejection_reason } = req.body;

  if (!approval_status || !['approved', 'rejected'].includes(approval_status)) {
    return res.status(400).json({
      error: "Invalid approval_status. Supported values are 'approved' and 'rejected'.",
    });
  }

  let cleanReason = null;
  if (approval_status === 'rejected') {
    cleanReason = typeof rejection_reason === 'string' ? rejection_reason.trim() : '';
    if (!cleanReason) {
      return res.status(400).json({
        error: 'A meaningful rejection_reason is required when rejecting a job posting.',
      });
    }
  }

  try {
    // 1. Fetch current job state to verify preconditions
    const [jobRows] = await db.promise().query(
      'SELECT id, posting_source, approval_status, job_status FROM jobs WHERE id = ?',
      [jobId]
    );

    if (!jobRows || jobRows.length === 0) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const job = jobRows[0];

    if (job.posting_source !== 'company') {
      return res.status(400).json({
        error: 'Only company-created job postings require Placement Cell approval.',
      });
    }

    if (job.approval_status !== 'pending') {
      return res.status(409).json({
        error: `Cannot review job. Current approval status is already '${job.approval_status}'.`,
      });
    }

    // 2. Atomic conditional update to safely handle concurrent or repeated review requests
    const updateSql = `
      UPDATE jobs
      SET
        approval_status = ?,
        rejection_reason = ?,
        reviewed_by = ?,
        reviewed_at = NOW()
      WHERE id = ?
        AND approval_status = 'pending'
        AND posting_source = 'company'
    `;

    const [result] = await db.promise().query(updateSql, [
      approval_status,
      cleanReason,
      user.id,
      jobId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(409).json({
        error: 'Conflict: This job posting has already been reviewed or its status changed.',
      });
    }

    return res.status(200).json({
      message: `Job has been successfully ${approval_status}.`,
      jobId,
      approval_status,
      rejection_reason: cleanReason,
      reviewed_by: user.id,
    });
  } catch (err) {
    console.error('[reviewJobApproval] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to update job approval status.' });
  }
};

/**
 * updateJobStatus — Job Availability Controls.
 * PATCH /api/jobs/:id/status
 * Supported body:
 *   { "job_status": "open" } or { "job_status": "closed" }
 */
exports.updateJobStatus = async (req, res) => {
  const user = req.user;
  const jobId = Number(req.params.id);

  if (isNaN(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Invalid job ID provided.' });
  }

  const { job_status } = req.body;
  if (!job_status || !['open', 'closed'].includes(job_status)) {
    return res.status(400).json({
      error: "Invalid job_status. Supported values are 'open' and 'closed'.",
    });
  }

  try {
    const [jobRows] = await db.promise().query(
      'SELECT id, posting_source, company_id, approval_status, job_status FROM jobs WHERE id = ?',
      [jobId]
    );

    if (!jobRows || jobRows.length === 0) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const job = jobRows[0];

    // Authorization:
    // Admin can update status of any job.
    // Company can ONLY update jobs that they own (posting_source = 'company' AND company_id = user.id).
    if (user.role === 'company') {
      if (job.posting_source !== 'company' || job.company_id !== user.id) {
        return res.status(403).json({
          error: 'You do not have permission to modify the availability status of this job.',
        });
      }
    } else if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Access forbidden.' });
    }

    // Update only job_status. Never touches approval_status, created_by, or posting_source.
    await db.promise().query(
      'UPDATE jobs SET job_status = ? WHERE id = ?',
      [job_status, jobId]
    );

    return res.status(200).json({
      message: `Job availability status updated to '${job_status}'.`,
      jobId,
      job_status,
      approval_status: job.approval_status,
    });
  } catch (err) {
    console.error('[updateJobStatus] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to update job availability status.' });
  }
};

/**
 * getJobs — List jobs with role-based filters.
 * Students receive ONLY approved, open, and non-expired jobs.
 */
exports.getJobs = async (req, res) => {
  const user = req.user;

  try {
    if (user.role === 'admin') {
      // Admin can see all jobs with creator, reviewer, and application count
      const sql = `
        SELECT
          jobs.id,
          jobs.title,
          jobs.description,
          jobs.location,
          jobs.stipend,
          jobs.created_by,
          jobs.posting_source,
          jobs.recruiting_organization,
          jobs.recruiting_organization AS company,
          jobs.company_id,
          jobs.approval_status,
          jobs.rejection_reason,
          jobs.reviewed_by,
          jobs.reviewed_at,
          jobs.job_status,
          jobs.application_deadline,
          jobs.eligibility_criteria,
          jobs.created_at,
          creator.name AS creator_name,
          creator.email AS creator_email,
          reviewer.name AS reviewer_name,
          COUNT(applications.id) AS application_count
        FROM jobs
        LEFT JOIN users AS creator ON jobs.created_by = creator.id
        LEFT JOIN users AS reviewer ON jobs.reviewed_by = reviewer.id
        LEFT JOIN applications ON jobs.id = applications.job_id
        GROUP BY jobs.id
        ORDER BY jobs.id DESC
      `;
      const [rows] = await db.promise().query(sql);
      return res.status(200).json(rows);

    } else {
      // Students and general view: ONLY approved, open, non-expired jobs
      const sql = `
        SELECT
          jobs.id,
          jobs.title,
          jobs.description,
          jobs.location,
          jobs.stipend,
          jobs.created_by,
          jobs.posting_source,
          jobs.recruiting_organization,
          jobs.recruiting_organization AS company,
          jobs.company_id,
          jobs.approval_status,
          jobs.job_status,
          jobs.application_deadline,
          jobs.eligibility_criteria,
          jobs.created_at
        FROM jobs
        WHERE jobs.approval_status = 'approved'
          AND jobs.job_status = 'open'
          AND (jobs.application_deadline IS NULL OR jobs.application_deadline >= NOW())
        ORDER BY jobs.id DESC
      `;
      const [rows] = await db.promise().query(sql);
      return res.status(200).json(rows);
    }
  } catch (err) {
    console.error('[getJobs] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch jobs.' });
  }
};

/**
 * getJobById — Retrieve job details with strict role enforcement.
 * Students cannot retrieve pending, rejected, or expired/closed jobs.
 */
exports.getJobById = async (req, res) => {
  const user = req.user;
  const jobId = req.params.id;

  try {
    const sql = `
      SELECT
        jobs.id,
        jobs.title,
        jobs.description,
        jobs.location,
        jobs.stipend,
        jobs.created_by,
        jobs.posting_source,
        jobs.recruiting_organization,
        jobs.recruiting_organization AS company,
        jobs.company_id,
        jobs.approval_status,
        jobs.rejection_reason,
        jobs.reviewed_by,
        jobs.reviewed_at,
        jobs.job_status,
        jobs.application_deadline,
        jobs.eligibility_criteria,
        jobs.created_at
      FROM jobs
      WHERE jobs.id = ?
    `;
    const [rows] = await db.promise().query(sql, [jobId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const job = rows[0];

    if (user.role === 'student') {
      const isApproved = job.approval_status === 'approved';
      const isOpen = job.job_status === 'open';
      const isNotExpired = !job.application_deadline || new Date(job.application_deadline) >= new Date();

      if (!isApproved || !isOpen || !isNotExpired) {
        return res.status(404).json({ error: 'Job not found.' });
      }
      return res.status(200).json(job);

    } else if (user.role === 'company') {
      const isApproved = job.approval_status === 'approved';
      const isOwner    = job.company_id === user.id;

      if (!isApproved && !isOwner) {
        return res.status(404).json({ error: 'Job not found.' });
      }
      return res.status(200).json(job);

    } else if (user.role === 'admin') {
      return res.status(200).json(job);
    }

    return res.status(403).json({ error: 'Access forbidden.' });
  } catch (err) {
    console.error('[getJobById] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch job details.' });
  }
};

/**
 * getMyJobs — Returns jobs posted by the authenticated company, including approval status and rejection reason.
 */
exports.getMyJobs = async (req, res) => {
  const sql = `
    SELECT
      jobs.id,
      jobs.title,
      jobs.description,
      jobs.location,
      jobs.stipend,
      jobs.posting_source,
      jobs.recruiting_organization,
      jobs.company_id,
      jobs.approval_status,
      jobs.rejection_reason,
      jobs.reviewed_at,
      jobs.job_status,
      jobs.application_deadline,
      jobs.eligibility_criteria,
      jobs.created_at,
      COUNT(applications.id) AS application_count
    FROM jobs
    LEFT JOIN applications ON jobs.id = applications.job_id
    WHERE jobs.company_id = ?
    GROUP BY jobs.id
    ORDER BY jobs.id DESC
  `;
  try {
    const [rows] = await db.promise().query(sql, [req.user.id]);
    return res.status(200).json(rows);
  } catch (err) {
    console.error('[getMyJobs] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch your jobs.' });
  }
};

/**
 * deleteJob — Deletes a job posting.
 * Company can delete their own jobs; Admin can delete any job.
 * Companies cannot delete admin-created postings assigned to them.
 */
exports.deleteJob = async (req, res) => {
  const user = req.user;
  const jobId = req.params.id;

  try {
    let result;
    if (user.role === 'admin') {
      [result] = await db.promise().query('DELETE FROM jobs WHERE id = ?', [jobId]);
    } else {
      [result] = await db.promise().query(
        'DELETE FROM jobs WHERE id = ? AND company_id = ? AND posting_source = "company"',
        [jobId, user.id]
      );
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Job not found or you do not have permission to delete it.' });
    }
    return res.status(200).json({ message: 'Job deleted successfully.' });
  } catch (err) {
    console.error('[deleteJob] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to delete job.' });
  }
};

/**
 * getActiveCompanies — Minimal administrator-only endpoint to retrieve active registered companies.
 * Returns only id, name, and email for company dropdown selection.
 */
exports.getActiveCompanies = async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      "SELECT id, name, email FROM users WHERE role = 'company' AND is_active = TRUE ORDER BY name ASC"
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error('[getActiveCompanies] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch registered companies.' });
  }
};
