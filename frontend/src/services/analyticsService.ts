import { api } from './api';
import type { Analytics, MetricsSummary, TimePeriod } from '../types';

export const analyticsService = {
  /** Headline metrics, comparison, data quality and daily trends */
  get: (repositoryId: string, days: TimePeriod) =>
    api.get<Analytics>(`/api/repositories/${repositoryId}/analytics?days=${days}`),
  /** Headline metrics and comparison only */
  metrics: (repositoryId: string, days: TimePeriod) =>
    api.get<MetricsSummary>(`/api/repositories/${repositoryId}/metrics?days=${days}`),
};
