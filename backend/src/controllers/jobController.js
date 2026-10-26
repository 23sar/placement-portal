const db = require('../config/db');

/**
 * Helper to validate positive decimal or null for compensation
 */
function parseStipend(val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'boolean') return NaN;
  if (typeof val !== 'number' && typeof val !== 'string') return NaN;
  if (typeof val === 'string' && val.trim() === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num) || isNaN(num) || num < 0 || num > 99999999.99) return NaN;
  return num;
}

/**
 * Helper to validate date string or null strictly as real YYYY-MM-DD
 */
function parseDeadline(val) {
  if (val === undefined || val === null || val === '') return { value: null };
  if (typeof val !== 'string') return { error: 'Invalid application_deadline format.' };

  const trimmed = val.trim();
  if (trimmed === '') return { value: null };

  const dateRegex = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z?)?$/;
  const match = trimmed.match(dateRegex);
  if (!match) {
    return { error: 'Invalid application_deadline format. Must be a valid date in YYYY-MM-DD format.' };
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12) {
    return { error: 'Invalid calendar month in application_deadline.' };
  }

  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maxDays = daysInMonth[month - 1];

  if (day < 1 || day > maxDays) {
    return { error: 'Invalid calendar day in application_deadline.' };
  }

  let hours = 23;
  let minutes = 59;
  let seconds = 59;

  if (match[4] !== undefined) {
    hours = parseInt(match[4], 10);
    minutes = parseInt(match[5], 10);
    seconds = parseInt(match[6], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
      return { error: 'Invalid time components in application_deadline.' };
    }
  }

  const deadlineDate = new Date(year, month - 1, day, hours, minutes, seconds);
  if (isNaN(deadlineDate.getTime())) {
    return { error: 'Invalid application_deadline.' };
  }

  if (deadlineDate.getTime() < Date.now() - 60000) {
    return { error: 'Application deadline cannot be in the past.' };
  }

  const pad = n => String(n).padStart(2, '0');
  const formatted = `${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return { value: formatted };
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

  // 1. Sanitize & validate text fields
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanDesc  = typeof description === 'string' ? description.trim() : '';
  const cleanLoc   = typeof location === 'string' ? location.trim() : '';

  if (!cleanTitle || !cleanDesc || !cleanLoc) {
    return res.status(400).json({ error: 'Title, description, and location are required and cannot be empty.' });
  }

  if (cleanTitle.length < 3 || cleanTitle.length > 150) {
    return res.status(400).json({ error: 'Job title must be between 3 and 150 characters.' });
  }

  if (cleanDesc.length < 10 || cleanDesc.length > 5000) {
    return res.status(400).json({ error: 'Job description must be between 10 and 5000 characters.' });
  }

  if (cleanLoc.length < 2 || cleanLoc.length > 100) {
    return res.status(400).json({ error: 'Job location must be between 2 and 100 characters.' });
  }

  // 2. Validate stipend
  const parsedStipend = parseStipend(stipend);
  if (Number.isNaN(parsedStipend)) {
    return res.status(400).json({ error: 'Invalid stipend value. Must be a finite non-negative number.' });
  }

  // 3. Validate deadline
  const deadlineResult = parseDeadline(application_deadline);
  if (deadlineResult.error) {
    return res.status(400).json({ error: deadlineResult.error });
  }
  const parsedDeadline = deadlineResult.value;

  const cleanEligibility = typeof eligibility_criteria === 'string' && eligibility_criteria.trim()
    ? eligibility_criteria.trim()
    : null;

  if (cleanEligibility && cleanEligibility.length > 5000) {
    return res.status(400).json({ error: 'Eligibility criteria cannot exceed 5000 characters.' });
  }

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
          approval_status, job_status, application_deadline, eligibility_criteria, revision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
        revision: 1,
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

    if (targetOrg.length < 2 || targetOrg.length > 150) {
      return res.status(400).json({ error: 'Recruiting organization name must be between 2 and 150 characters.' });
    }

    try {
      const [result] = await db.promise().query(
        `INSERT INTO jobs (
          title, description, location, stipend,
          created_by, posting_source, recruiting_organization, company_id,
          approval_status, job_status, application_deadline, eligibility_criteria, revision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
        revision: 1,
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
      jobs.revision,
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
 *   - expected_revision: optional expected revision number to prevent stale approvals
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

  const { approval_status, rejection_reason, expected_revision, revision } = req.body;
  const expRev = expected_revision !== undefined ? expected_revision : revision;

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

  let expRevNum = null;
  if (expRev !== undefined && expRev !== null) {
    expRevNum = Number(expRev);
    if (isNaN(expRevNum) || expRevNum < 1) {
      return res.status(400).json({ error: 'Invalid expected revision provided.' });
    }
  }

  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    // 1. Fetch current job state with row lock for concurrency safety
    const [jobRows] = await conn.query(
      'SELECT id, posting_source, approval_status, job_status, revision FROM jobs WHERE id = ? FOR UPDATE',
      [jobId]
    );

    if (!jobRows || jobRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Job not found.' });
    }

    const job = jobRows[0];

    if (job.posting_source !== 'company') {
      await conn.rollback();
      return res.status(400).json({
        error: 'Only company-created job postings require Placement Cell approval.',
      });
    }

    if (job.approval_status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({
        error: `Cannot review job. Current approval status is already '${job.approval_status}'.`,
      });
    }

    // Check revision concurrency
    if (expRevNum !== null && job.revision !== expRevNum) {
      await conn.rollback();
      return res.status(409).json({
        error: 'Conflict: This job posting has been edited by the company since you loaded it for review. Please review the updated revision.',
        current_revision: job.revision,
        expected_revision: expRevNum,
      });
    }

    // 2. Atomic conditional update
    let updateSql = `
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
    const updateParams = [approval_status, cleanReason, user.id, jobId];

    if (expRevNum !== null) {
      updateSql += ' AND revision = ?';
      updateParams.push(expRevNum);
    }

    const [result] = await conn.query(updateSql, updateParams);

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({
        error: 'Conflict: This job posting has already been reviewed, modified, or its status changed.',
      });
    }

    await conn.commit();

    return res.status(200).json({
      message: `Job has been successfully ${approval_status}.`,
      jobId,
      approval_status,
      rejection_reason: cleanReason,
      reviewed_by: user.id,
      revision: job.revision,
    });
  } catch (err) {
    await conn.rollback();
    console.error('[reviewJobApproval] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to update job approval status.' });
  } finally {
    conn.release();
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
          jobs.revision,
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
        jobs.revision,
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
      jobs.revision,
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
 * updateJob — Edit job details and handle resubmission.
 * PATCH /api/jobs/:id
 * Rules:
 *   - Company: may edit only their own jobs (posting_source = 'company' AND company_id = user.id).
 *              Every edit resets approval_status to 'pending', clears rejection_reason, reviewed_by, reviewed_at.
 *   - Admin:   may edit Placement Cell postings (posting_source = 'placement_cell').
 *              Preserves creator attribution and approval status.
 *   - Protected fields (created_by, posting_source, company_id, approval_status, reviewed_by, reviewed_at)
 *     are strictly protected against client tampering.
 */
exports.updateJob = async (req, res) => {
  const user = req.user;
  const jobId = Number(req.params.id);

  if (isNaN(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Invalid job ID provided.' });
  }

  const {
    title,
    description,
    location,
    stipend,
    application_deadline,
    eligibility_criteria,
    recruiting_organization,
  } = req.body;

  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    // 1. Fetch current job with row lock for concurrency safety
    const [jobs] = await conn.query(
      `SELECT
        id, title, description, location, stipend,
        created_by, posting_source, recruiting_organization, company_id,
        approval_status, job_status, application_deadline, eligibility_criteria,
        revision, rejection_reason, reviewed_by, reviewed_at
      FROM jobs
      WHERE id = ? FOR UPDATE`,
      [jobId]
    );

    if (!jobs || jobs.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Job not found.' });
    }

    const job = jobs[0];

    // 2. Authorization and origin rules
    if (user.role === 'company') {
      if (job.posting_source !== 'company' || job.company_id !== user.id) {
        await conn.rollback();
        return res.status(403).json({ error: 'You do not have permission to edit this job.' });
      }
    } else if (user.role === 'admin') {
      if (job.posting_source !== 'placement_cell') {
        await conn.rollback();
        return res.status(400).json({
          error: 'Company-created postings must be reviewed through the Placement Cell approval workflow rather than edited directly.',
        });
      }
    } else {
      await conn.rollback();
      return res.status(403).json({ error: 'Access forbidden.' });
    }

    // 3. Field validation
    let newTitle = job.title;
    if (title !== undefined) {
      const clean = typeof title === 'string' ? title.trim() : '';
      if (!clean) {
        await conn.rollback();
        return res.status(400).json({ error: 'Job title cannot be empty.' });
      }
      if (clean.length < 3 || clean.length > 150) {
        await conn.rollback();
        return res.status(400).json({ error: 'Job title must be between 3 and 150 characters.' });
      }
      newTitle = clean;
    }

    let newDesc = job.description;
    if (description !== undefined) {
      const clean = typeof description === 'string' ? description.trim() : '';
      if (!clean) {
        await conn.rollback();
        return res.status(400).json({ error: 'Job description cannot be empty.' });
      }
      if (clean.length < 10 || clean.length > 5000) {
        await conn.rollback();
        return res.status(400).json({ error: 'Job description must be between 10 and 5000 characters.' });
      }
      newDesc = clean;
    }

    let newLoc = job.location;
    if (location !== undefined) {
      const clean = typeof location === 'string' ? location.trim() : '';
      if (!clean) {
        await conn.rollback();
        return res.status(400).json({ error: 'Job location cannot be empty.' });
      }
      if (clean.length < 2 || clean.length > 100) {
        await conn.rollback();
        return res.status(400).json({ error: 'Job location must be between 2 and 100 characters.' });
      }
      newLoc = clean;
    }

    let newStipend = job.stipend;
    if (stipend !== undefined) {
      const parsed = parseStipend(stipend);
      if (Number.isNaN(parsed)) {
        await conn.rollback();
        return res.status(400).json({ error: 'Invalid stipend value. Must be a finite non-negative number.' });
      }
      newStipend = parsed;
    }

    let newDeadline = job.application_deadline;
    if (application_deadline !== undefined) {
      const deadlineResult = parseDeadline(application_deadline);
      if (deadlineResult.error) {
        await conn.rollback();
        return res.status(400).json({ error: deadlineResult.error });
      }
      newDeadline = deadlineResult.value;
    }

    let newEligibility = job.eligibility_criteria;
    if (eligibility_criteria !== undefined) {
      const clean = typeof eligibility_criteria === 'string' && eligibility_criteria.trim()
        ? eligibility_criteria.trim()
        : null;
      if (clean && clean.length > 5000) {
        await conn.rollback();
        return res.status(400).json({ error: 'Eligibility criteria cannot exceed 5000 characters.' });
      }
      newEligibility = clean;
    }

    let newOrg = job.recruiting_organization;
    if (user.role === 'admin' && recruiting_organization !== undefined) {
      const clean = typeof recruiting_organization === 'string' ? recruiting_organization.trim() : '';
      if (!clean) {
        await conn.rollback();
        return res.status(400).json({ error: 'Recruiting organization name cannot be empty.' });
      }
      if (clean.length < 2 || clean.length > 150) {
        await conn.rollback();
        return res.status(400).json({ error: 'Recruiting organization name must be between 2 and 150 characters.' });
      }
      newOrg = clean;
    }

    // 4. Update according to role
    if (user.role === 'company') {
      // Company edit: Resets approval_status to 'pending', clears rejection_reason and review audit, increments revision
      const updateSql = `
        UPDATE jobs
        SET
          title = ?,
          description = ?,
          location = ?,
          stipend = ?,
          application_deadline = ?,
          eligibility_criteria = ?,
          approval_status = 'pending',
          rejection_reason = NULL,
          reviewed_by = NULL,
          reviewed_at = NULL,
          revision = revision + 1
        WHERE id = ? AND company_id = ? AND posting_source = 'company'
      `;

      await conn.query(updateSql, [
        newTitle,
        newDesc,
        newLoc,
        newStipend,
        newDeadline,
        newEligibility,
        jobId,
        user.id,
      ]);

      await conn.commit();

      return res.status(200).json({
        message: 'Job updated successfully and resubmitted for Placement Cell approval.',
        jobId,
        approval_status: 'pending',
        rejection_reason: null,
        revision: (job.revision || 1) + 1,
      });

    } else {
      // Admin edit: Placement Cell posting, preserves creator and approval status
      const updateSql = `
        UPDATE jobs
        SET
          title = ?,
          description = ?,
          location = ?,
          stipend = ?,
          application_deadline = ?,
          eligibility_criteria = ?,
          recruiting_organization = ?
        WHERE id = ? AND posting_source = 'placement_cell'
      `;

      await conn.query(updateSql, [
        newTitle,
        newDesc,
        newLoc,
        newStipend,
        newDeadline,
        newEligibility,
        newOrg,
        jobId,
      ]);

      await conn.commit();

      return res.status(200).json({
        message: 'Placement Cell job updated successfully.',
        jobId,
        approval_status: job.approval_status,
      });
    }

  } catch (err) {
    await conn.rollback();
    console.error('[updateJob] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to update job.' });
  } finally {
    conn.release();
  }
};

/**
 * deleteJob — Deletes a job posting if it has no applications.
 * Jobs with student applications are strictly protected (HTTP 409 Conflict).
 */
exports.deleteJob = async (req, res) => {
  const user = req.user;
  const jobId = Number(req.params.id);

  if (isNaN(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Invalid job ID provided.' });
  }

  try {
    // 1. Fetch job to verify existence and ownership
    const [jobs] = await db.promise().query(
      'SELECT id, created_by, posting_source, company_id FROM jobs WHERE id = ?',
      [jobId]
    );

    if (!jobs || jobs.length === 0) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const job = jobs[0];

    // Authorization:
    // Admin can delete any job without applications.
    // Company can only delete their own jobs (posting_source = 'company' AND company_id = user.id).
    if (user.role === 'company') {
      if (job.posting_source !== 'company' || job.company_id !== user.id) {
        return res.status(403).json({ error: 'You do not have permission to delete this job.' });
      }
    } else if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Access forbidden.' });
    }

    // 2. Check for existing applications to protect application history
    const [apps] = await db.promise().query(
      'SELECT COUNT(*) AS count FROM applications WHERE job_id = ?',
      [jobId]
    );

    if (apps[0].count > 0) {
      return res.status(409).json({
        error: 'Cannot permanently delete a job with existing student applications. Please close the job instead to preserve application records.',
        application_count: apps[0].count,
      });
    }

    // 3. Delete job without applications
    await db.promise().query('DELETE FROM jobs WHERE id = ?', [jobId]);

    return res.status(200).json({ message: 'Job deleted successfully.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
      return res.status(409).json({
        error: 'Cannot permanently delete a job with existing student applications. Please close the job instead to preserve application records.',
      });
    }
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
