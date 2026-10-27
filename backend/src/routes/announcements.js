const { Router } = require('express');
const { verifyToken, checkRole } = require('../middleware/auth');
const {
  createAnnouncement,
  getAnnouncements,
  getMyAnnouncements,
  getPendingAnnouncements,
  reviewAnnouncementApproval,
  getAnnouncementById,
  deleteAnnouncement,
} = require('../controllers/announcementController');

const router = Router();

// String-literal routes declared before parametric /:id routes to prevent collisions
router.get('/',                  verifyToken,                                getAnnouncements);
router.get('/pending',           verifyToken, checkRole('admin'),            getPendingAnnouncements);
router.get('/my',                verifyToken, checkRole('company'),          getMyAnnouncements);
router.post('/',                 verifyToken, checkRole('company', 'admin'), createAnnouncement);
router.post('/create',           verifyToken, checkRole('company', 'admin'), createAnnouncement);
router.patch('/:id/approval',    verifyToken, checkRole('admin'),            reviewAnnouncementApproval);
router.get('/:id',               verifyToken,                                getAnnouncementById);
router.delete('/:id',            verifyToken, checkRole('company', 'admin'), deleteAnnouncement);

module.exports = router;
