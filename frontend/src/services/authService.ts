import { api, API_BASE_URL, ApiRequestError } from './api';
import type { SessionInfo } from '../types';

export const authService = {
  // OAuth is a full-page redirect through the backend
  login: () => {
    window.location.href = `${API_BASE_URL}/api/auth/github`;
  },

  logout: () => api.post<{ signedOut: boolean }>('/api/auth/logout'),

  /** Current session, or null when signed out. Other failures are thrown. */
  me: async (): Promise<SessionInfo | null> => {
    try {
      return await api.get<SessionInfo>('/api/auth/me');
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) return null;
      throw err;
    }
  },
};
