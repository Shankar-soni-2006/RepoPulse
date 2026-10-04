import { Router } from 'express';
import { handleGithubLogin, handleGithubCallback, handleLogout, handleMe } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/github', handleGithubLogin);
router.get('/callback', handleGithubCallback);
router.post('/logout', handleLogout);
router.get('/me', requireAuth, handleMe);

export default router;
