/**
 * server.js — HTTP entry point only.
 *
 * Responsibilities:
 *   - Load environment variables (must happen before app.js is required)
 *   - Bind the Express app to a port
 *
 * Keeping this separate from app.js means tests can require('./app') without
 * opening a real network socket.
 */
require('dotenv').config();

const app  = require('./app');
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});
