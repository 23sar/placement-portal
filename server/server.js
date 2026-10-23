const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS — restrict to known origins in production
// For development, all origins are allowed; set ALLOWED_ORIGINS in .env for production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed from this origin'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Routes
const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Placement Portal API running', version: '1.0.0' });
});

// 404 handler — must be after all routes
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// Global error handler — catches synchronous errors passed via next(err)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[GlobalError]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});