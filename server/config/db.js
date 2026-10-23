const mysql = require('mysql2');
require('dotenv').config();

/**
 * Use a connection pool instead of a single connection.
 * This handles automatic reconnection and concurrent requests safely.
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Verify initial connectivity at startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error('[DB] Connection pool initialization failed:', err.message);
    // Don't exit — controllers will report individual query failures
  } else {
    console.log('[DB] Connection pool established successfully.');
    connection.release();
  }
});

module.exports = pool;