import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIInsightsPage } from './AIInsightsPage';
import { aiService } from '@/services/aiService';
import { ApiRequestError } from '@/services/api';
import { renderPage, testRepository } from '@/test/render';
import type { AIInsightResult } from '@/types';

vi.mock('@/services/aiService', () => ({ aiService: { getInsights: vi.fn() } }));

const result: AIInsightResult = {
  summary: 'Cycle time rose 27% while PR size grew.',
  insights: [
    {
      title: 'Longer cycle time',
      type: 'trend',
      severity: 'medium',
      fact: 'Median cycle time increased by 27%.',
      evidence: ['Median PR size increased from 214 to 341 lines.'],
      possibleExplanation: 'Larger PRs may slow reviews.',
      recommendedInvestigation: 'Review large PRs merged in the period.',
    },
  ],
  dataLimitations: ['1 AI insight was removed because it cited numbers not present in the data.'],
  meta: {
    mode: 'summary',
    period: { from: '2026-09-03T00:00:00Z', to: '2026-10-03T00:00:00Z', days: 30 },
    provider: 'api.groq.com',
    model: 'openai/gpt-oss-120b',
    generatedAt: new Date().toISOString(),
    cached: true,
    rejectedInsights: 1,
  },
};


describe('AIInsightsPage', () => {
  it('does not call the AI until asked (each run uses quota)', () => {
    renderPage(<AIInsightsPage />);
    expect(aiService.getInsights).not.toHaveBeenCalled();
    expect(screen.getByText(/Choose an analysis or ask a question/)).toBeInTheDocument();
  });

  it('runs the selected mode for the selected period and shows the structured answer', async () => {
    vi.mocked(aiService.getInsights).mockResolvedValue(result);
    renderPage(<AIInsightsPage />, { route: '/page?days=90' });
    await userEvent.click(screen.getByRole('radio', { name: 'Bottlenecks' }));
    await userEvent.click(screen.getByRole('button', { name: 'Analyze last 90 days' }));

    expect(aiService.getInsights).toHaveBeenCalledWith(testRepository.id, 'bottlenecks', 90, undefined);
    expect(await screen.findByText(result.summary)).toBeInTheDocument();
    expect(screen.getByText('Longer cycle time')).toBeInTheDocument();
    expect(screen.getByText(/removed because it cited numbers/)).toBeInTheDocument();
    expect(screen.getByText(/openai\/gpt-oss-120b via api\.groq\.com/)).toBeInTheDocument();
    expect(screen.getByText(/served from cache/)).toBeInTheDocument();
    expect(screen.getByText(/hypotheses — verify before acting/)).toBeInTheDocument();
  });

  it('sends a typed question in question mode', async () => {
    vi.mocked(aiService.getInsights).mockResolvedValue({ ...result, insights: [] });
    renderPage(<AIInsightsPage />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Question' }), 'Why are reviews slower?');
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(aiService.getInsights).toHaveBeenCalledWith(testRepository.id, 'question', 30, 'Why are reviews slower?');
    expect(await screen.findByText(/nothing in the data qualified/)).toBeInTheDocument();
  });

  it('explains an unconfigured AI and points back to analytics', async () => {
    vi.mocked(aiService.getInsights).mockImplementation(async () => {
      throw new ApiRequestError('AI_NOT_CONFIGURED', 'AI insights are not configured on this server', 503);
    });
    renderPage(<AIInsightsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Analyze/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('isn’t configured');
    expect(alert).toHaveTextContent('Metrics are unaffected');
  });

  it('treats "no activity" as information, not an error', async () => {
    vi.mocked(aiService.getInsights).mockImplementation(async () => {
      throw new ApiRequestError('AI_NO_ACTIVITY', 'No activity in the last 30 days', 422);
    });
    renderPage(<AIInsightsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Analyze/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No activity in the last 30 days'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
