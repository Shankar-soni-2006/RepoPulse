import { api } from './api';
import type { DiscoveryResult, Repository } from '../types';

export const repositoryService = {
  list: () => api.get<Repository[]>('/api/repositories'),
  get: (id: string) => api.get<Repository>(`/api/repositories/${id}`),
  sync: (id: string) => api.post<{ message: string }>(`/api/repositories/${id}/sync`),
  /** Re-reads the user's GitHub App installations and repositories */
  discover: () => api.post<DiscoveryResult>('/api/repositories/discover'),
};
