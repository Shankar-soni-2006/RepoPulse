import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InsightCard } from './InsightCard';

const insight = {
  title: 'Longer cycle time',
  type: 'trend' as const,
  severity: 'medium' as const,
  fact: 'Median cycle time increased by 27% to 1.1d.',
  evidence: ['Median PR size increased from 214 to 341 lines.', 'First-review time increased from 3.1h to 4.8h.'],
  possibleExplanation: 'Larger PRs may be contributing to longer review cycles.',
  recommendedInvestigation: 'Review large PRs merged during the period.',
};

describe('InsightCard', () => {
  it('keeps fact, evidence, explanation and investigation visibly separate', () => {
    render(<InsightCard insight={insight} />);
    for (const label of ['Fact', 'Evidence', 'Possible explanation', 'Investigation']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Trend')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('styles the explanation as a hypothesis, distinct from the fact', () => {
    render(<InsightCard insight={insight} />);
    expect(screen.getByText(insight.possibleExplanation).className).toMatch(/italic/);
    expect(screen.getByText(insight.fact).className).not.toMatch(/italic/);
  });
});
