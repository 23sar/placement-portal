const jwt = require('jsonwebtoken');

/**
 * Verify JWT from the Authorization header.
 * Accepts both raw token (legacy) and "Bearer <token>" format.
 * Returns 401 JSON on missing/invalid token.
 */
exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  // Support both "Bearer <token>" and raw token (backward-compat)
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

/**
 * Role-based access control middleware.
 * Must be used after verifyToken.
 * Returns 403 JSON if the role does not match.
 */
exports.checkRole = (role) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Access forbidden. Insufficient permissions.' });
    }
    next();
  };
};