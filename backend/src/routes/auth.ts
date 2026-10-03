import { Router } from 'express';
import { handleGithubLogin, handleGithubCallback, handleLogout, handleMe } from '../controllers/authController';

const router = Router();

router.get('/github', handleGithubLogin);
router.get('/callback', handleGithubCallback);
router.get('/logout', handleLogout);
router.get('/me', handleMe);

export default router;
