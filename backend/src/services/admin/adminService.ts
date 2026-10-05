import { adminRepository } from '../../repositories/adminRepository.js';
import type { AdminOverview, AdminUser, AdminUserUpdate } from '../../types/index.js';
import { AppError } from '../../utils/errors.js';

// Admin actions. The database enforces the global rules (last admin; admins can't be
// suspended or deleted). This layer adds the per-request rule: admins don't act on
// their own account, so nobody locks themselves out by accident.

function notOnYourself(actorId: string, targetId: string, action: string): void {
  if (actorId === targetId) throw new AppError('SELF_ACTION', `You can’t ${action} your own account`, 409);
}

export const adminService = {
  overview(): Promise<AdminOverview> {
    return adminRepository.overview();
  },

  listUsers(): Promise<AdminUser[]> {
    return adminRepository.listUsers();
  },

  async updateUser(actorId: string, targetId: string, update: AdminUserUpdate): Promise<void> {
    if (update.role !== undefined) {
      notOnYourself(actorId, targetId, 'change the role of');
      await adminRepository.setRole(targetId, update.role);
    }
    if (update.suspended !== undefined) {
      notOnYourself(actorId, targetId, update.suspended ? 'suspend' : 'reinstate');
      await adminRepository.setSuspended(targetId, update.suspended);
    }
  },

  async deleteUser(actorId: string, targetId: string): Promise<void> {
    notOnYourself(actorId, targetId, 'delete');
    await adminRepository.deleteUser(targetId);
  },
};
