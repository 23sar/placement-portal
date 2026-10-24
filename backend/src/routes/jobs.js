const { Router } = require('express');
const { verifyToken, checkRole } = require('../middleware/auth');
const { createJob, getJobs, getJobById, getMyJobs, deleteJob } = require('../controllers/jobController');
const { applyJob, getApplicants }                   = require('../controllers/applicationController');

const router = Router();

// NOTE: string-literal segments (e.g. /applicants, /create, /apply) must be
// declared BEFORE the wildcard /:id segment to avoid Express matching them
// as parameter values.

router.get('/',               verifyToken,                        getJobs);
router.get('/my',             verifyToken, checkRole('company'),  getMyJobs);
router.get('/applicants/:jobId', verifyToken, checkRole('company'), getApplicants);
router.post('/create',        verifyToken, checkRole('company'),  createJob);
router.post('/apply',         verifyToken, checkRole('student'),  applyJob);
router.get('/:id',            verifyToken,                        getJobById);
router.delete('/:id',         verifyToken, checkRole('company'),  deleteJob);

module.exports = router;
