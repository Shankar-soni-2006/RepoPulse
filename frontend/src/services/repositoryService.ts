import { api } from './api';
import type { DiscoveryResult, Repository } from '../types';

export const repositoryService = {
  list: () => api.get<Repository[]>('/api/repositories'),
  get: (id: string) => api.get<Repository>(`/api/repositories/${id}`),
  /** Starts a background sync; resolves with the repository in 'syncing' state */
  sync: (id: string) => api.post<Repository>(`/api/repositories/${id}/sync`),
  /** Re-reads the user's GitHub App installations and repositories */
  discover: () => api.post<DiscoveryResult>('/api/repositories/discover'),
};
