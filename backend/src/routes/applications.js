const { Router } = require('express');
const { verifyToken, checkRole } = require('../middleware/auth');
const {
  getMyApplications,
  updateApplicationStatus,
  getDashboardStats,
} = require('../controllers/applicationController');

const router = Router();

// String-literal routes before parameterised /:applicationId
router.get('/dashboard/stats',          verifyToken,                        getDashboardStats);
router.get('/my',                        verifyToken, checkRole('student'),  getMyApplications);
router.patch('/:applicationId/status',  verifyToken, checkRole('company'),  updateApplicationStatus);

module.exports = router;
