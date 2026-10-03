import { api } from './api';
import type { Analytics } from '../types';
import type { TimePeriod } from '../types';

export const analyticsService = {
  get: (repositoryId: string, days: TimePeriod) =>
    api.get<Analytics>(`/api/repositories/${repositoryId}/analytics?days=${days}`),
};
