const fsp = require('fs/promises');
const crypto = require('crypto');
const db = require('../config/db');
const {
  storageRoot,
  storagePath,
  cleanOriginalName,
  removeStoredFile,
  hasPdfSignature,
} = require('./resumeController');

/**
 * applyJob — Student applies for an approved and open job posting.
 * Rejects applications if:
 *   - Job is not approved (pending or rejected)
 *   - Job is closed
 *   - Job deadline has expired
 * Supports selecting a specific saved resume or preselected default resume,
 * creating an immutable private application resume snapshot.
 */
exports.applyJob = async (req, res) => {
  const { job_id, resume_id } = req.body;
  const student_id = req.user.id;

  if (!job_id) return res.status(400).json({ error: 'job_id is required.' });
  const parsedJobId = Number(job_id);
  if (!Number.isSafeInteger(parsedJobId) || parsedJobId <= 0) {
    return res.status(400).json({ error: 'Invalid job_id provided.' });
  }

  let snapshotKey = null;
  let snapshotWritten = false;
  let committed = false;

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

    // 5. Resume Selection & Snapshot creation
    let selectedResume = null;
    if (resume_id !== undefined && resume_id !== null) {
      const parsedResumeId = Number(resume_id);
      if (!Number.isSafeInteger(parsedResumeId) || parsedResumeId <= 0) {
        return res.status(400).json({ error: 'Invalid resume selected.' });
      }

      const [resumeRows] = await db.promise().query(
        'SELECT id, user_id, original_name, storage_key, mime_type, file_size, sha256 FROM student_resumes WHERE id = ? AND user_id = ?',
        [parsedResumeId, student_id]
      );
      if (!resumeRows.length) {
        return res.status(400).json({ error: 'Selected resume not found or does not belong to you.' });
      }
      selectedResume = resumeRows[0];
    } else {
      // If resume_id not explicitly supplied, check if student has a default resume
      const [defaultRows] = await db.promise().query(
        'SELECT id, user_id, original_name, storage_key, mime_type, file_size, sha256 FROM student_resumes WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC, created_at DESC LIMIT 1',
        [student_id]
      );
      if (defaultRows.length > 0) {
        selectedResume = defaultRows[0];
      }
    }

    if (!selectedResume) {
      return res.status(400).json({
        error: 'A valid resume is required to apply for jobs. Please upload a resume to your profile.',
      });
    }

    // Verify selected resume storage key
    let originalPath;
    try {
      originalPath = storagePath(selectedResume.storage_key);
    } catch (pathErr) {
      return res.status(400).json({ error: 'Selected resume storage key is invalid. Please re-upload your resume.' });
    }

    // Verify file exists and is readable
    let fileBuffer;
    try {
      fileBuffer = await fsp.readFile(originalPath);
    } catch (fileErr) {
      console.error('[applyJob] File read error:', fileErr.message);
      return res.status(400).json({ error: 'Selected resume file is missing or unreadable. Please re-upload your resume.' });
    }

    // Verify PDF signature / magic bytes
    if (!hasPdfSignature(fileBuffer)) {
      return res.status(400).json({ error: 'Selected resume file is not a valid PDF.' });
    }

    // Verify file size matches expected metadata
    if (selectedResume.file_size !== null && selectedResume.file_size !== undefined) {
      if (fileBuffer.length !== Number(selectedResume.file_size)) {
        return res.status(400).json({ error: 'Selected resume file size does not match stored metadata.' });
      }
    }

    // Verify SHA-256 hash matches expected metadata
    if (selectedResume.sha256) {
      const computedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      if (computedHash.toLowerCase() !== String(selectedResume.sha256).toLowerCase()) {
        return res.status(400).json({ error: 'Selected resume file hash does not match stored metadata.' });
      }
    }

    snapshotKey = `app_${crypto.randomUUID()}.pdf`;
    const snapshotPath = storagePath(snapshotKey);
    await fsp.mkdir(storageRoot(), { recursive: true, mode: 0o700 });
    await fsp.writeFile(snapshotPath, fileBuffer, { flag: 'wx', mode: 0o600 });
    snapshotWritten = true;

    const conn = await db.promise().getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        'INSERT INTO applications (job_id, student_id) VALUES (?, ?)',
        [parsedJobId, student_id]
      );
      const applicationId = result.insertId;

      await conn.query(
        `INSERT INTO application_resumes
           (application_id, student_id, original_resume_id, original_name, storage_key, mime_type, file_size, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          applicationId,
          student_id,
          selectedResume.id,
          selectedResume.original_name,
          snapshotKey,
          selectedResume.mime_type || 'application/pdf',
          fileBuffer.length,
          crypto.createHash('sha256').update(fileBuffer).digest('hex'),
        ]
      );

      await conn.commit();
      committed = true;

      return res.status(201).json({
        message: 'Application submitted successfully.',
        applicationId,
      });
    } catch (txErr) {
      await conn.rollback();
      if (!committed && snapshotWritten && snapshotKey) {
        await removeStoredFile(snapshotKey);
      }
      if (txErr.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'You have already applied for this job.' });
      }
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (err) {
    if (!committed && snapshotWritten && snapshotKey) {
      await removeStoredFile(snapshotKey);
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'You have already applied for this job.' });
    }
    console.error('[applyJob] DB error:', err.message);
    return res.status(500).json({ error: 'Application failed. Please try again.' });
  }
};

/**
 * getApplicationResume — Downloads the exact submitted snapshot for an application.
 * Authorized for:
 *   - The student who created the application
 *   - The company who created the corresponding job
 *   - Placement Cell administrators
 */
exports.getApplicationResume = async (req, res) => {
  res.set('Cache-Control', 'private, no-store, max-age=0');
  const applicationId = Number(req.params.applicationId);
  if (!Number.isSafeInteger(applicationId) || applicationId <= 0) {
    return res.status(400).json({ error: 'Application ID must be a positive integer.' });
  }

  const user = req.user;

  try {
    const sql = `
      SELECT
        a.id AS application_id,
        a.student_id,
        a.job_id,
        j.company_id,
        j.created_by AS job_created_by,
        j.posting_source,
        ar.id AS snapshot_id,
        ar.original_name,
        ar.storage_key,
        ar.mime_type,
        ar.file_size,
        ar.sha256,
        ar.submitted_at
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      LEFT JOIN application_resumes ar ON ar.application_id = a.id
      WHERE a.id = ?
    `;
    const [rows] = await db.promise().query(sql, [applicationId]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    const record = rows[0];

    // Access authorization check
    if (user.role === 'student') {
      if (Number(user.id) !== Number(record.student_id)) {
        return res.status(403).json({ error: 'You are not authorized to view resumes for this application.' });
      }
    } else if (user.role === 'company') {
      const isCompanyOwner = Number(user.id) === Number(record.company_id) ||
        (record.posting_source === 'company' && Number(user.id) === Number(record.job_created_by));
      if (!isCompanyOwner) {
        return res.status(403).json({ error: 'Resume access is limited to applications for your own job postings.' });
      }
    } else if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Access forbidden.' });
    }

    if (!record.snapshot_id || !record.storage_key) {
      return res.status(404).json({ error: 'No resume snapshot is attached to this application.' });
    }

    let contents;
    try {
      contents = await fsp.readFile(storagePath(record.storage_key));
    } catch (fileErr) {
      if (fileErr.code === 'ENOENT') {
        return res.status(404).json({ error: 'The stored application resume snapshot is missing.' });
      }
      throw fileErr;
    }

    const downloadName = cleanOriginalName(record.original_name).replace(/["\\]/g, '_');
    res.set({
      'Content-Type': record.mime_type || 'application/pdf',
      'Content-Length': String(contents.length),
      'Content-Disposition': `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store, max-age=0',
      'Pragma': 'no-cache',
    });
    return res.status(200).send(contents);
  } catch (err) {
    console.error('[getApplicationResume] Error:', err.message);
    return res.status(500).json({ error: 'Failed to download application resume.' });
  }
};

/**
 * getApplicants — Company can view applicants for their own job; Admin can view all.
 * Returns submitted resume snapshot metadata when available.
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
        users.email,
        ar.id             AS resume_snapshot_id,
        ar.original_name  AS resume_name,
        ar.file_size      AS resume_size,
        ar.submitted_at   AS resume_submitted_at,
        IF(ar.id IS NOT NULL, TRUE, FALSE) AS has_resume
      FROM applications
      JOIN users ON applications.student_id = users.id
      LEFT JOIN application_resumes ar ON ar.application_id = applications.id
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
 * Includes submitted resume snapshot metadata when available.
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
      jobs.recruiting_organization AS company,
      ar.id       AS resume_snapshot_id,
      ar.original_name AS resume_name,
      ar.file_size     AS resume_size,
      IF(ar.id IS NOT NULL, TRUE, FALSE) AS has_resume
    FROM applications
    JOIN jobs ON applications.job_id = jobs.id
    LEFT JOIN application_resumes ar ON ar.application_id = applications.id
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
