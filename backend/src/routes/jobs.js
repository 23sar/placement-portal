const { Router } = require('express');
const { verifyToken, checkRole } = require('../middleware/auth');
const {
  createJob,
  getJobs,
  getJobById,
  getMyJobs,
  deleteJob,
  getPendingJobs,
  reviewJobApproval,
  updateJobStatus,
  getActiveCompanies,
  updateJob,
} = require('../controllers/jobController');
const { applyJob, getApplicants, getApplicationResume } = require('../controllers/applicationController');

const router = Router();

// NOTE: String-literal segments must be declared BEFORE parameterised /:id to prevent collisions
router.get('/',                  verifyToken,                                   getJobs);
router.get('/pending',           verifyToken, checkRole('admin'),               getPendingJobs);
router.get('/all',               verifyToken, checkRole('admin'),               getJobs);
router.get('/companies',         verifyToken, checkRole('admin'),               getActiveCompanies);
router.get('/my',                verifyToken, checkRole('company'),             getMyJobs);
router.get('/applicants/:jobId', verifyToken, checkRole('company', 'admin'),    getApplicants);
router.post('/create',           verifyToken, checkRole('company', 'admin'),    createJob);
router.post('/apply',            verifyToken, checkRole('student'),             applyJob);
router.get('/applications/:applicationId/resume', verifyToken, getApplicationResume);
router.patch('/:id/approval',    verifyToken, checkRole('admin'),               reviewJobApproval);
router.patch('/:id/status',      verifyToken, checkRole('company', 'admin'),    updateJobStatus);
router.patch('/:id',             verifyToken, checkRole('company', 'admin'),    updateJob);
router.get('/:id',               verifyToken,                                   getJobById);
router.delete('/:id',            verifyToken, checkRole('company', 'admin'),    deleteJob);

module.exports = router;
