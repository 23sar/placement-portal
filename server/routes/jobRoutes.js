const express = require('express');
const router = express.Router();

const { verifyToken, checkRole } = require('../middleware/authMiddleware');
const { createJob, getJobs, getJobById, deleteJob } = require('../controllers/jobController');
const { applyJob, getApplicants } = require('../controllers/applicationController');

// IMPORTANT: Specific string-segment routes MUST come before parameterized /:id routes
// to prevent /applicants/:jobId being swallowed by /:id

// List all jobs (requires auth)
router.get('/', verifyToken, getJobs);

// Company only — view applicants (must be before /:id)
router.get('/applicants/:jobId', verifyToken, checkRole('company'), getApplicants);

// Company only — create a job
router.post('/create', verifyToken, checkRole('company'), createJob);

// Student only — apply for a job
router.post('/apply', verifyToken, checkRole('student'), applyJob);

// Get a single job by ID (after all specific paths)
router.get('/:id', verifyToken, getJobById);

// Company only — delete own job
router.delete('/:id', verifyToken, checkRole('company'), deleteJob);

module.exports = router;