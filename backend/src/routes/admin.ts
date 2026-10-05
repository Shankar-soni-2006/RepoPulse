import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateParams } from '../middleware/validate.js';
import { deleteAdminUser, getAdminOverview, listAdminUsers, updateAdminUser } from '../controllers/adminController.js';

// Admin-only: user management and system overview. Repository data is not exposed
// here; it stays gated by each user's GitHub access.
const router = Router();
const userIdParams = z.object({ userId: z.string().uuid('userId must be a valid UUID') });

router.use(requireAuth, requireAdmin);
router.get('/overview', getAdminOverview);
router.get('/users', listAdminUsers);
router.patch('/users/:userId', validateParams(userIdParams), updateAdminUser);
router.delete('/users/:userId', validateParams(userIdParams), deleteAdminUser);

export default router;
