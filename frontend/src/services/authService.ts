export const authService = {
  login: () => {
    window.location.href = '/api/auth/github';
  },
  logout: () => {
    window.location.href = '/api/auth/logout';
  },
};
