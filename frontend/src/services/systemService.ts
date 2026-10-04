import { api } from './api';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
  version: string;
  cache: 'ok' | 'disabled' | 'error';
}

export const systemService = {
  health: () => api.get<HealthStatus>('/api/health'),
};
