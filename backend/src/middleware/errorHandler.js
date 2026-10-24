/**
 * errorHandler.js — global Express error-handling middleware.
 *
 * Catches any error forwarded via next(err) or thrown inside an
 * async route handler (Express 5 propagates async rejections automatically).
 *
 * Rules:
 *  - Never expose raw error objects or stack traces to the client.
 *  - Always respond with JSON so the frontend can parse it uniformly.
 *  - Log the full error server-side for debugging.
 */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  console.error(`[error] ${req.method} ${req.path} —`, err.message);

  const status  = err.status  || err.statusCode || 500;
  const message = status < 500
    ? err.message                  // client-caused errors: safe to relay
    : 'An unexpected error occurred. Please try again.'; // server errors: hide details

  res.status(status).json({ error: message });
};
