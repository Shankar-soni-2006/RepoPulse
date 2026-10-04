import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MetricRow } from './MetricRow';
import type { MetricsSummary, PeriodMetrics } from '@/types';

const metrics = (o: Partial<PeriodMetrics> = {}): PeriodMetrics => ({
  prThroughput: 42, prsOpened: 48, cycleTime: 18.4, firstReviewTime: 2.8, reviewDelay: 4.2, prSize: 214,
  codeChurn: 8200, additions: 6000, deletions: 2200, commitCount: 131, reviewCount: 77, activeContributors: 6,
  openPrsWithoutReview: 3, oldestUnreviewedWait: 52, commitsMissingStats: 0, ...o,
});

const summary: MetricsSummary = {
  repositoryId: 'r',
  period: { from: '2026-09-03T00:00:00Z', to: '2026-10-03T00:00:00Z', days: 30 },
  previousPeriod: { from: '2026-08-04T00:00:00Z', to: '2026-09-03T00:00:00Z' },
  metrics: metrics(),
  previousMetrics: metrics(),
  changes: { prThroughput: 0.135, prsOpened: 0, cycleTime: 0.27, firstReviewTime: -0.1, reviewDelay: null, prSize: 0, codeChurn: -0.099, commitCount: 0, reviewCount: 0, activeContributors: 0 },
  dataQuality: { dataSince: '2026-04-07', lastSyncedAt: '2026-10-03', commitStatsCoverage: 1, limitations: [] },
  generatedAt: '2026-10-03T00:00:00Z',
};

const cell = (label: string) => screen.getByText(label).parentElement as HTMLElement;

describe('MetricRow', () => {
  it('shows backend values with readable units', () => {
    render(<MetricRow summary={summary} metrics={['cycleTime', 'firstReviewTime', 'prThroughput', 'codeChurn']} />);
    expect(within(cell('PR cycle time')).getByText('18.4h')).toBeInTheDocument();
    expect(within(cell('Throughput')).getByText('42')).toBeInTheDocument();
    expect(within(cell('Code churn')).getByText('8,200 lines')).toBeInTheDocument();
  });

  it('marks a slower cycle time as worse and a faster first review as better, in text not only color', () => {
    render(<MetricRow summary={summary} metrics={['cycleTime', 'firstReviewTime']} />);
    const slower = within(cell('PR cycle time')).getByText('+27%').closest('[title]')!;
    const faster = within(cell('First review')).getByText('−10%').closest('[title]')!;
    expect(slower.getAttribute('title')).toMatch(/worse/);
    expect(slower.className).toMatch(/red/);
    expect(faster.getAttribute('title')).toMatch(/improved/);
    expect(faster.className).toMatch(/emerald/);
  });

  it('keeps volume metrics neutral and says when there is no comparison', () => {
    render(<MetricRow summary={summary} metrics={['codeChurn', 'reviewDelay']} />);
    const churn = within(cell('Code churn')).getByText('−10%').closest('[title]')!;
    expect(churn.className).toMatch(/muted/);
    expect(churn.getAttribute('title')).not.toMatch(/worse|improved/);
    expect(within(cell('Review delay')).getByText('no comparison')).toBeInTheDocument();
  });
});
