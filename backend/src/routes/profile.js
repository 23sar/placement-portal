const { Router } = require('express');
const { verifyToken, checkRole } = require('../middleware/auth');
const {
  getMyProfile,
  updateMyProfile,
  getSkills,
  addSkill,
  updateSkill,
  deleteSkill,
  getProjects,
  addProject,
  updateProject,
  deleteProject,
  getInternships,
  addInternship,
  updateInternship,
  deleteInternship,
  getAchievements,
  addAchievement,
  updateAchievement,
  deleteAchievement,
} = require('../controllers/profileController');

const router = Router();

// 1. Core Profile
router.get('/me', verifyToken, checkRole('student'), getMyProfile);
router.patch('/me', verifyToken, checkRole('student'), updateMyProfile);

// 2. Skills
router.get('/me/skills', verifyToken, checkRole('student'), getSkills);
router.post('/me/skills', verifyToken, checkRole('student'), addSkill);
router.patch('/me/skills/:id', verifyToken, checkRole('student'), updateSkill);
router.delete('/me/skills/:id', verifyToken, checkRole('student'), deleteSkill);

// 3. Projects
router.get('/me/projects', verifyToken, checkRole('student'), getProjects);
router.post('/me/projects', verifyToken, checkRole('student'), addProject);
router.patch('/me/projects/:id', verifyToken, checkRole('student'), updateProject);
router.delete('/me/projects/:id', verifyToken, checkRole('student'), deleteProject);

// 4. Internships
router.get('/me/internships', verifyToken, checkRole('student'), getInternships);
router.post('/me/internships', verifyToken, checkRole('student'), addInternship);
router.patch('/me/internships/:id', verifyToken, checkRole('student'), updateInternship);
router.delete('/me/internships/:id', verifyToken, checkRole('student'), deleteInternship);

// 5. Achievements
router.get('/me/achievements', verifyToken, checkRole('student'), getAchievements);
router.post('/me/achievements', verifyToken, checkRole('student'), addAchievement);
router.patch('/me/achievements/:id', verifyToken, checkRole('student'), updateAchievement);
router.delete('/me/achievements/:id', verifyToken, checkRole('student'), deleteAchievement);

module.exports = router;
