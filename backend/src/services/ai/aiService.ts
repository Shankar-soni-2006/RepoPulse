import type { AIInsightRequest, AIInsightResponse } from '../../types/index.js';

// Stub — fully implemented in Phase 9 (AI service)
export const aiService = {
  async getInsights(_req: AIInsightRequest): Promise<AIInsightResponse> {
    return {
      summary: 'AI service not yet configured. Add GEMINI_API_KEY to enable insights.',
      insights: [],
      dataLimitations: ['Gemini API key not configured'],
    };
  },
};
