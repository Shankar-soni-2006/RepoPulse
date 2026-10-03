import { api } from './api';
import type { Repository } from '../types';

export const repositoryService = {
  list: () => api.get<Repository[]>('/api/repositories'),
  get: (id: string) => api.get<Repository>(`/api/repositories/${id}`),
  sync: (id: string) => api.post<{ message: string }>(`/api/repositories/${id}/sync`),
};
