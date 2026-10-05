import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { adminService } from '../services/admin/adminService.js';
import { getAuth } from '../middleware/auth.js';
import { sendSuccess } from '../utils/response.js';

const userUpdate = z
  .object({ role: z.enum(['admin', 'member']).optional(), suspended: z.boolean().optional() })
  .strict()
  .refine((u) => u.role !== undefined || u.suspended !== undefined, { message: 'Nothing to update' });

export async function getAdminOverview(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await adminService.overview());
  } catch (err) {
    next(err);
  }
}

export async function listAdminUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await adminService.listUsers());
  } catch (err) {
    next(err);
  }
}

export async function updateAdminUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.updateUser(getAuth(req).user.id, req.params.userId, userUpdate.parse(req.body));
    sendSuccess(res, { updated: true });
  } catch (err) {
    next(err);
  }
}

export async function deleteAdminUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await adminService.deleteUser(getAuth(req).user.id, req.params.userId);
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}
