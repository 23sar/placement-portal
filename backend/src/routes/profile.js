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
  getProfileDetails,
} = require('../controllers/profileController');

const router = Router();

// Section dispatcher mapping for /api/profile/details/:section[/:id]
const SECTION_HANDLERS = {
  skills: { list: getSkills, create: addSkill, update: updateSkill, delete: deleteSkill },
  projects: { list: getProjects, create: addProject, update: updateProject, delete: deleteProject },
  internships: { list: getInternships, create: addInternship, update: updateInternship, delete: deleteInternship },
  achievements: { list: getAchievements, create: addAchievement, update: updateAchievement, delete: deleteAchievement },
};

function sectionDispatcher(action) {
  return (req, res, next) => {
    const section = req.params.section;
    const target = SECTION_HANDLERS[section]?.[action];
    if (!target) {
      return res.status(404).json({ error: `Section '${section}' not found.` });
    }
    return target(req, res, next);
  };
}

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

// 6. Aggregated Profile Details and Section Aliases (/api/profile/details...)
router.get('/details', verifyToken, checkRole('student'), getProfileDetails);
router.get('/me/details', verifyToken, checkRole('student'), getProfileDetails);
router.get('/details/:section', verifyToken, checkRole('student'), sectionDispatcher('list'));
router.post('/details/:section', verifyToken, checkRole('student'), sectionDispatcher('create'));
router.patch('/details/:section/:id', verifyToken, checkRole('student'), sectionDispatcher('update'));
router.delete('/details/:section/:id', verifyToken, checkRole('student'), sectionDispatcher('delete'));

module.exports = router;
