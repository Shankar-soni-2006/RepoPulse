import { api } from './api';
import type { AIInsightMode, AIInsightResult, TimePeriod } from '../types';

export const aiService = {
  /** AI interpretation of backend-computed metrics. Analytics never depend on this call. */
  getInsights: (repositoryId: string, mode: AIInsightMode, days: TimePeriod, question?: string) =>
    api.post<AIInsightResult>('/api/ai/insights', { repositoryId, mode, days, question }),
};
