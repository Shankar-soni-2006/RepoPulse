import { API_BASE_URL } from './api';

// OAuth is a full-page redirect through the backend, so these navigate rather than fetch
export const authService = {
  login: () => {
    window.location.href = `${API_BASE_URL}/api/auth/github`;
  },
  logout: () => {
    window.location.href = `${API_BASE_URL}/api/auth/logout`;
  },
};
