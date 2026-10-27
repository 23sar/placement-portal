const db = require('../config/db');

/**
 * Validation helper for positive integer IDs.
 */
function parseId(val) {
  const num = Number(val);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

/**
 * createAnnouncement — Submit or publish an announcement.
 *
 * Rules:
 * - Active company: submits for approval (approval_status = 'pending', posting_source = 'company', company_id = user.id).
 * - Administrator: publishes directly (approval_status = 'approved', posting_source = 'placement_cell', published_at = NOW()).
 * - Students: forbidden (handled by checkRole('company', 'admin')).
 * - Protected fields (created_by, posting_source, company_id, approval_status, reviewed_by, etc.) cannot be forged.
 */
exports.createAnnouncement = async (req, res) => {
  const user = req.user;
  const { title, content, body, category, company_id } = req.body;

  const rawContent = content !== undefined ? content : body;

  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanContent = typeof rawContent === 'string' ? rawContent.trim() : '';
  const cleanCategory = typeof category === 'string' && category.trim().length > 0 ? category.trim() : null;

  if (!cleanTitle || !cleanContent) {
    return res.status(400).json({ error: 'Title and content are required and cannot be empty.' });
  }

  if (cleanTitle.length < 3 || cleanTitle.length > 150) {
    return res.status(400).json({ error: 'Announcement title must be between 3 and 150 characters.' });
  }

  if (cleanContent.length < 10 || cleanContent.length > 5000) {
    return res.status(400).json({ error: 'Announcement content must be between 10 and 5000 characters.' });
  }

  if (cleanCategory && cleanCategory.length > 100) {
    return res.status(400).json({ error: 'Category cannot exceed 100 characters.' });
  }

  try {
    if (user.role === 'company') {
      // Company submission — always pending
      const sql = `
        INSERT INTO announcements (
          title, content, category,
          created_by, posting_source, company_id,
          approval_status, revision
        ) VALUES (?, ?, ?, ?, 'company', ?, 'pending', 1)
      `;
      const [result] = await db.promise().query(sql, [
        cleanTitle,
        cleanContent,
        cleanCategory,
        user.id,
        user.id,
      ]);

      const [rows] = await db.promise().query(
        `SELECT a.id, a.title, a.content, a.category, a.posting_source, a.approval_status,
                a.company_id, a.created_by, a.revision, a.created_at, u.name AS company_name
         FROM announcements a
         JOIN users u ON a.company_id = u.id
         WHERE a.id = ?`,
        [result.insertId]
      );

      return res.status(201).json({
        message: 'Announcement submitted successfully and is awaiting Placement Cell approval.',
        announcement: rows[0],
      });

    } else if (user.role === 'admin') {
      // Placement Cell publication — directly approved
      let associatedCompanyId = null;
      if (company_id !== undefined && company_id !== null && company_id !== '') {
        const parsedCompanyId = parseId(company_id);
        if (!parsedCompanyId) {
          return res.status(400).json({ error: 'Invalid company_id provided.' });
        }
        const [coRows] = await db.promise().query(
          "SELECT id FROM users WHERE id = ? AND role = 'company' AND is_active = TRUE",
          [parsedCompanyId]
        );
        if (coRows.length === 0) {
          return res.status(400).json({ error: 'The specified company account does not exist or is inactive.' });
        }
        associatedCompanyId = parsedCompanyId;
      }

      const sql = `
        INSERT INTO announcements (
          title, content, category,
          created_by, posting_source, company_id,
          approval_status, reviewed_by, reviewed_at, published_at, revision
        ) VALUES (?, ?, ?, ?, 'placement_cell', ?, 'approved', ?, NOW(), NOW(), 1)
      `;
      const [result] = await db.promise().query(sql, [
        cleanTitle,
        cleanContent,
        cleanCategory,
        user.id,
        associatedCompanyId,
        user.id,
      ]);

      const [rows] = await db.promise().query(
        `SELECT a.id, a.title, a.content, a.category, a.posting_source, a.approval_status,
                a.company_id, a.created_by, a.published_at, a.revision, a.created_at
         FROM announcements a
         WHERE a.id = ?`,
        [result.insertId]
      );

      return res.status(201).json({
        message: 'Announcement published successfully by Placement Cell.',
        announcement: rows[0],
      });
    } else {
      return res.status(403).json({ error: 'Access forbidden. Students cannot create announcements.' });
    }
  } catch (err) {
    console.error('[createAnnouncement] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to create announcement.' });
  }
};

/**
 * getAnnouncements — Retrieve announcements feed.
 *
 * Rules:
 * - Students & Companies: only approved announcements (published_at != NULL), sorted by published_at DESC.
 * - Admin: if query param ?status=all is provided, returns all announcements; otherwise approved only.
 */
exports.getAnnouncements = async (req, res) => {
  const user = req.user;
  const showAll = user.role === 'admin' && req.query.status === 'all';

  try {
    if (showAll) {
      const sql = `
        SELECT
          a.id,
          a.title,
          a.content,
          a.category,
          a.posting_source,
          a.approval_status,
          a.rejection_reason,
          a.revision,
          a.created_by,
          a.company_id,
          a.reviewed_by,
          a.reviewed_at,
          a.published_at,
          a.created_at,
          a.updated_at,
          creator.name AS creator_name,
          creator.email AS creator_email,
          company.name AS company_name,
          reviewer.name AS reviewer_name
        FROM announcements a
        LEFT JOIN users AS creator ON a.created_by = creator.id
        LEFT JOIN users AS company ON a.company_id = company.id
        LEFT JOIN users AS reviewer ON a.reviewed_by = reviewer.id
        ORDER BY a.id DESC
      `;
      const [rows] = await db.promise().query(sql);
      return res.status(200).json(rows);
    } else {
      // General & student feed: approved only
      const sql = `
        SELECT
          a.id,
          a.title,
          a.content,
          a.category,
          a.posting_source,
          a.approval_status,
          a.published_at,
          a.created_at,
          creator.name AS creator_name,
          company.name AS company_name
        FROM announcements a
        LEFT JOIN users AS creator ON a.created_by = creator.id
        LEFT JOIN users AS company ON a.company_id = company.id
        WHERE a.approval_status = 'approved'
        ORDER BY a.published_at DESC, a.id DESC
      `;
      const [rows] = await db.promise().query(sql);
      return res.status(200).json(rows);
    }
  } catch (err) {
    console.error('[getAnnouncements] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch announcements.' });
  }
};

/**
 * getMyAnnouncements — Company lists their own announcement submissions.
 * Returns status, rejection reason, and revision.
 */
exports.getMyAnnouncements = async (req, res) => {
  const user = req.user;
  if (user.role !== 'company') {
    return res.status(403).json({ error: 'Access forbidden. Company role required.' });
  }

  try {
    const sql = `
      SELECT
        a.id,
        a.title,
        a.content,
        a.category,
        a.posting_source,
        a.approval_status,
        a.rejection_reason,
        a.revision,
        a.reviewed_at,
        a.published_at,
        a.created_at,
        a.updated_at,
        reviewer.name AS reviewer_name
      FROM announcements a
      LEFT JOIN users AS reviewer ON a.reviewed_by = reviewer.id
      WHERE a.company_id = ? AND a.posting_source = 'company'
      ORDER BY a.id DESC
    `;
    const [rows] = await db.promise().query(sql, [user.id]);
    return res.status(200).json(rows);
  } catch (err) {
    console.error('[getMyAnnouncements] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch your announcements.' });
  }
};

/**
 * getPendingAnnouncements — Admin approval queue.
 * Only company-created submissions in pending status.
 */
exports.getPendingAnnouncements = async (req, res) => {
  try {
    const sql = `
      SELECT
        a.id,
        a.title,
        a.content,
        a.category,
        a.posting_source,
        a.approval_status,
        a.revision,
        a.created_at,
        company.name  AS submitting_company_name,
        company.email AS submitting_company_email,
        creator.name  AS creator_name
      FROM announcements a
      JOIN users AS company ON a.company_id = company.id
      JOIN users AS creator ON a.created_by = creator.id
      WHERE a.posting_source = 'company'
        AND a.approval_status = 'pending'
      ORDER BY a.created_at ASC, a.id ASC
    `;
    const [rows] = await db.promise().query(sql);
    return res.status(200).json(rows);
  } catch (err) {
    console.error('[getPendingAnnouncements] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch pending announcements.' });
  }
};

/**
 * reviewAnnouncementApproval — Administrator reviews (approves or rejects) a company announcement.
 *
 * Concurrency Safety & Rules:
 * - Row locking (SELECT ... FOR UPDATE) inside a transaction.
 * - Rejection requires a meaningful rejection_reason (non-empty string).
 * - Stale review protection via expected_revision.
 * - Cannot review already reviewed announcements (409 Conflict).
 */
exports.reviewAnnouncementApproval = async (req, res) => {
  const user = req.user;
  const announcementId = parseId(req.params.id);

  if (!announcementId) {
    return res.status(400).json({ error: 'Invalid announcement ID provided.' });
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
        error: 'A meaningful rejection_reason is required when rejecting an announcement.',
      });
    }
  }

  let expRevNum = null;
  if (expRev !== undefined && expRev !== null) {
    expRevNum = Number(expRev);
    if (!Number.isInteger(expRevNum) || expRevNum < 1) {
      return res.status(400).json({ error: 'Invalid expected revision provided.' });
    }
  }

  const conn = await db.promise().getConnection();
  try {
    await conn.beginTransaction();

    // 1. Fetch current announcement state with row lock
    const [rows] = await conn.query(
      'SELECT id, posting_source, approval_status, revision FROM announcements WHERE id = ? FOR UPDATE',
      [announcementId]
    );

    if (!rows || rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Announcement not found.' });
    }

    const ann = rows[0];

    if (ann.posting_source !== 'company') {
      await conn.rollback();
      return res.status(400).json({
        error: 'Only company-created announcements require Placement Cell approval.',
      });
    }

    if (ann.approval_status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({
        error: `Cannot review announcement. Current approval status is already '${ann.approval_status}'.`,
      });
    }

    // Revision check
    if (expRevNum !== null && ann.revision !== expRevNum) {
      await conn.rollback();
      return res.status(409).json({
        error: 'Conflict: This announcement has been modified since it was loaded for review. Please review the updated revision.',
        current_revision: ann.revision,
        expected_revision: expRevNum,
      });
    }

    // 2. Perform atomic update
    let updateSql = `
      UPDATE announcements
      SET
        approval_status = ?,
        rejection_reason = ?,
        reviewed_by = ?,
        reviewed_at = NOW(),
        published_at = ${approval_status === 'approved' ? 'NOW()' : 'NULL'}
      WHERE id = ?
        AND approval_status = 'pending'
        AND posting_source = 'company'
    `;
    const updateParams = [approval_status, cleanReason, user.id, announcementId];

    if (expRevNum !== null) {
      updateSql += ' AND revision = ?';
      updateParams.push(expRevNum);
    }

    const [result] = await conn.query(updateSql, updateParams);

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({
        error: 'Conflict: This announcement has already been reviewed, modified, or its status changed.',
      });
    }

    await conn.commit();

    return res.status(200).json({
      message: `Announcement has been successfully ${approval_status}.`,
      announcementId,
      approval_status,
      rejection_reason: cleanReason,
      reviewed_by: user.id,
      revision: ann.revision,
    });
  } catch (err) {
    await conn.rollback();
    console.error('[reviewAnnouncementApproval] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to update announcement approval status.' });
  } finally {
    conn.release();
  }
};

/**
 * getAnnouncementById — Retrieve a single announcement.
 *
 * Rules:
 * - Students: only if approved (HTTP 404 if pending/rejected).
 * - Companies: if approved OR if owned by company.
 * - Admin: any announcement.
 */
exports.getAnnouncementById = async (req, res) => {
  const user = req.user;
  const announcementId = parseId(req.params.id);

  if (!announcementId) {
    return res.status(400).json({ error: 'Invalid announcement ID provided.' });
  }

  try {
    const sql = `
      SELECT
        a.id,
        a.title,
        a.content,
        a.category,
        a.posting_source,
        a.approval_status,
        a.rejection_reason,
        a.revision,
        a.created_by,
        a.company_id,
        a.reviewed_by,
        a.reviewed_at,
        a.published_at,
        a.created_at,
        creator.name AS creator_name,
        company.name AS company_name
      FROM announcements a
      LEFT JOIN users AS creator ON a.created_by = creator.id
      LEFT JOIN users AS company ON a.company_id = company.id
      WHERE a.id = ?
    `;
    const [rows] = await db.promise().query(sql, [announcementId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }

    const ann = rows[0];

    if (user.role === 'student') {
      if (ann.approval_status !== 'approved') {
        return res.status(404).json({ error: 'Announcement not found.' });
      }
    } else if (user.role === 'company') {
      if (ann.approval_status !== 'approved' && ann.company_id !== user.id) {
        return res.status(404).json({ error: 'Announcement not found.' });
      }
    }

    return res.status(200).json(ann);
  } catch (err) {
    console.error('[getAnnouncementById] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch announcement.' });
  }
};

/**
 * deleteAnnouncement — Delete an announcement.
 *
 * Rules:
 * - Companies: can only delete their own submissions.
 * - Admin: can delete any announcement.
 * - Students: forbidden.
 */
exports.deleteAnnouncement = async (req, res) => {
  const user = req.user;
  const announcementId = parseId(req.params.id);

  if (!announcementId) {
    return res.status(400).json({ error: 'Invalid announcement ID provided.' });
  }

  try {
    const [rows] = await db.promise().query(
      'SELECT id, posting_source, company_id FROM announcements WHERE id = ?',
      [announcementId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }

    const ann = rows[0];

    if (user.role === 'company') {
      if (ann.posting_source !== 'company' || ann.company_id !== user.id) {
        return res.status(403).json({ error: 'You do not have permission to delete this announcement.' });
      }
    }

    await db.promise().query('DELETE FROM announcements WHERE id = ?', [announcementId]);

    return res.status(200).json({ message: 'Announcement deleted successfully.' });
  } catch (err) {
    console.error('[deleteAnnouncement] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to delete announcement.' });
  }
};
