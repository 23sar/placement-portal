const express = require('express');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');
const {
  getMyApplications,
  updateApplicationStatus,
  getDashboardStats
} = require('../controllers/applicationController');

const router = express.Router();

// IMPORTANT: Specific string-segment routes before parameterized /:applicationId

// Authenticated — dashboard stats (controller handles student vs company logic)
router.get('/dashboard/stats', verifyToken, getDashboardStats);

// Student — view own applications
router.get('/my', verifyToken, checkRole('student'), getMyApplications);

// Company — update application status (ownership verified in controller)
router.patch('/:applicationId/status', verifyToken, checkRole('company'), updateApplicationStatus);

module.exports = router;