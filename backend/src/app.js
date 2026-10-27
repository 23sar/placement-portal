/**
 * app.js — Express application factory.
 *
 * Exported as a module so it can be required by tests without binding a port.
 * dotenv is loaded in server.js before this file is required, so all
 * process.env values are already populated here.
 */
const express      = require('express');
const cors         = require('cors');
const errorHandler = require('./middleware/errorHandler');

const authRoutes        = require('./routes/auth');
const jobRoutes         = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const profileRoutes     = require('./routes/profile');
const resumeRoutes      = require('./routes/resume');

const app = express();

// ── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000'];

app.use(cors({
  origin(origin, cb) {
    // Allow requests with no origin (Postman, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
}));

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/jobs',         jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/profile',      profileRoutes);
app.use('/api/profile/resume', resumeRoutes);

// Health-check
app.get('/', (_req, res) => res.json({ status: 'ok', message: 'Placement Portal API' }));

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
