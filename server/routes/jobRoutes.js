const express = require('express');
const router = express.Router();

const { verifyToken, checkRole } = require('../middleware/authMiddleware');
const { createJob, getJobs } = require('../controllers/jobController');
const { applyJob, getApplicants } = require('../controllers/applicationController');

// company only
router.post('/create', verifyToken, checkRole('company'), createJob);

// get all jobs
router.get('/', verifyToken, getJobs);

// student apply (REAL NOW)
router.post('/apply', verifyToken, checkRole('student'), applyJob);

// company sees applicants
router.get('/applicants/:jobId', verifyToken, checkRole('company'), getApplicants);

// test
router.get('/protected', verifyToken, (req, res) => {
  res.send(`Hello ${req.user.role}`);
});

module.exports = router;