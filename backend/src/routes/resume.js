const { Router } = require('express');
const multer = require('multer');
const { verifyToken, checkRole } = require('../middleware/auth');
const {
  getCurrentResume,
  getStudentResumes,
  uploadResume,
  downloadCurrentResume,
  downloadApplicantResume,
  deleteCurrentResume,
  downloadResumeById,
  updateResumeLabel,
  setDefaultResume,
  deleteResume,
} = require('../controllers/resumeController');

const router = Router();
const maxBytes = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 1, fields: 10 },
  fileFilter(_req, file, cb) {
    const ext = require('path').extname(file.originalname || '').toLowerCase();
    if (ext !== '.pdf' || file.mimetype !== 'application/pdf') {
      const err = new Error('Only PDF files are accepted.');
      err.status = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

function parseUpload(req, res, next) {
  upload.single('resume')(req, res, err => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Resume must be 5 MB or smaller.' });
    }
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Upload one PDF file using the field name "resume".' });
    }
    return res.status(err.status || 400).json({ error: err.status ? err.message : 'Invalid resume upload.' });
  });
}

// Every operation is tied to the authenticated student ID. No public file URL
// or client-supplied user ID/storage path is accepted by these endpoints.
router.get('/', verifyToken, checkRole('student'), getStudentResumes);
router.post('/', verifyToken, checkRole('student'), parseUpload, uploadResume);
router.get('/download', verifyToken, checkRole('student'), downloadCurrentResume);
router.get('/students/:studentId/download', verifyToken, checkRole('student', 'company', 'admin'), downloadApplicantResume);
router.delete('/', verifyToken, checkRole('student'), deleteCurrentResume);

// Multiple saved resume management per student
router.get('/:id/download', verifyToken, checkRole('student'), downloadResumeById);
router.patch('/:id/default', verifyToken, checkRole('student'), setDefaultResume);
router.patch('/:id', verifyToken, checkRole('student'), updateResumeLabel);
router.delete('/:id', verifyToken, checkRole('student'), deleteResume);

module.exports = router;
