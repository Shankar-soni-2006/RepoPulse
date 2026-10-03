import { Router } from 'express';
import { handleGithubLogin, handleGithubCallback, handleLogout, handleMe } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/github', handleGithubLogin);
router.get('/callback', handleGithubCallback);
router.post('/logout', handleLogout);
router.get('/me', requireAuth, handleMe);

export default router;
