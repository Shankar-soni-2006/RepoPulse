import { api } from './api';
import type { AdminOverview, AdminUser, AdminUserUpdate } from '@/types';

/** Admin-only endpoints (the backend returns 403 for members). */
export const adminService = {
  overview: () => api.get<AdminOverview>('/api/admin/overview'),
  users: () => api.get<AdminUser[]>('/api/admin/users'),
  updateUser: (id: string, update: AdminUserUpdate) => api.patch<{ updated: true }>(`/api/admin/users/${id}`, update),
  deleteUser: (id: string) => api.delete<{ deleted: true }>(`/api/admin/users/${id}`),
};
