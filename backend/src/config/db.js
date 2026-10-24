const mysql = require('mysql2');

/**
 * MySQL connection pool.
 * Uses environment variables set by dotenv in server.js before this
 * module is first required.
 */
const pool = mysql.createPool({
  host:             process.env.DB_HOST,
  user:             process.env.DB_USER,
  password:         process.env.DB_PASSWORD,
  database:         process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:  10,
  queueLimit:       0,
});

// Verify connectivity at startup — log but don't crash the process
pool.getConnection((err, connection) => {
  if (err) {
    console.error('[db] Pool init failed:', err.message);
    return;
  }
  console.log('[db] Connection pool ready.');
  connection.release();
});

module.exports = pool;
