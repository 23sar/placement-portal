const jwt = require('jsonwebtoken');

/**
 * verifyToken — validates the JWT from the Authorization header.
 * Accepts both raw token and "Bearer <token>" format.
 */
exports.verifyToken = (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = header.startsWith('Bearer ') ? header.slice(7) : header;

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

/**
 * checkRole — role-based access gate. Must be used after verifyToken.
 * @param {string} role  - required role ('student' | 'company' | 'admin')
 */
exports.checkRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({ error: 'Access forbidden. Insufficient permissions.' });
  }
  next();
};
