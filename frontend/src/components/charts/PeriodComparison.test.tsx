import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeriodComparison } from './PeriodComparison';
import type { MetricsSummary } from '@/types';

const summary = {
  metrics: { prThroughput: 0, cycleTime: null },
  previousMetrics: { prThroughput: 2, cycleTime: 26 },
  changes: { prThroughput: -1, cycleTime: null },
} as unknown as MetricsSummary;

describe('PeriodComparison', () => {
  it('shows current and previous values for each metric, with the change', () => {
    render(<PeriodComparison summary={summary} metrics={['prThroughput', 'cycleTime']} days={90} />);
    expect(screen.getByRole('listitem', { name: 'Throughput: last 90 days 0, previous 90 days 2, change −100%' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /PR cycle time: last 90 days —, previous 90 days 1\.1d/ })).toBeInTheDocument();
    expect(screen.getByText('−100%')).toBeInTheDocument();
  });

  it('labels both series in a legend', () => {
    render(<PeriodComparison summary={summary} metrics={['prThroughput']} days={30} />);
    expect(screen.getAllByText('Last 30 days').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Previous 30 days').length).toBeGreaterThan(0);
  });
});

describe('PeriodComparison empty rows', () => {
  it('collapses a metric with nothing in either period into one line', () => {
    const empty = {
      metrics: { reviewCount: 0, firstReviewTime: null },
      previousMetrics: { reviewCount: 0, firstReviewTime: null },
      changes: { reviewCount: null, firstReviewTime: null },
    } as unknown as MetricsSummary;
    render(<PeriodComparison summary={empty} metrics={['reviewCount', 'firstReviewTime']} days={7} />);
    expect(screen.getByText('None in either period')).toBeInTheDocument();
    expect(screen.getByText('No data in either period')).toBeInTheDocument();
  });
});
