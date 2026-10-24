const jwt = require('jsonwebtoken');
const db  = require('../config/db');

/**
 * verifyToken — validates the JWT from the Authorization header and verifies
 * that the user account currently exists and is active in the database.
 * Rejects requests if the account was deactivated after token issuance.
 */
exports.verifyToken = async (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  // Validate active account status against live database state
  try {
    const [rows] = await db.promise().query(
      'SELECT id, name, email, role, is_active FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'User account no longer exists.' });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account has been deactivated. Please contact the placement cell.' });
    }

    // Attach fresh user state from database
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: Boolean(user.is_active),
    };
    next();
  } catch (err) {
    console.error('[verifyToken] DB status check error:', err.message);
    return res.status(500).json({ error: 'Authentication check failed.' });
  }
};

/**
 * checkRole — role-based access gate. Supports one or multiple allowed roles.
 * Usage:
 *   checkRole('company')
 *   checkRole('company', 'admin')
 *   checkRole(['company', 'admin'])
 */
exports.checkRole = (...roles) => {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access forbidden. Insufficient permissions.' });
    }
    next();
  };
};
