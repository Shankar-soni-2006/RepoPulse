import { Router } from 'express';
import { receiveGitHubWebhook } from '../controllers/webhookController.js';

// No session auth or CSRF header: GitHub authenticates with the payload signature
const router = Router();

router.post('/github', receiveGitHubWebhook);

export default router;
