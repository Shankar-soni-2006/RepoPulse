import { api } from './api';
import type { AIInsightResponse } from '../types';

export const aiService = {
  getInsights: (repositoryId: string, period: { from: string; to: string }, question?: string) =>
    api.post<AIInsightResponse>('/api/ai/insights', { repositoryId, period, question }),
};
