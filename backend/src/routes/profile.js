const { Router } = require('express');
const { verifyToken, checkRole } = require('../middleware/auth');
const { getMyProfile, updateMyProfile } = require('../controllers/profileController');

const router = Router();

// Profile endpoints operate only on the authenticated student's own record.
router.get('/me', verifyToken, checkRole('student'), getMyProfile);
router.patch('/me', verifyToken, checkRole('student'), updateMyProfile);

module.exports = router;
