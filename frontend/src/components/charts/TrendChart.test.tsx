import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrendChart } from './TrendChart';
import { formatHours } from '@/utils/format';
import type { DailyTrend } from '@/types';

const day = (date: string, cycleTime: number | null): DailyTrend => ({
  date, prsOpened: 0, prThroughput: cycleTime === null ? 0 : 1, cycleTime, firstReviewTime: null, reviewDelay: null,
  prSize: null, codeChurn: 0, commitCount: 0, reviewCount: 0, activeContributors: 0,
});

describe('TrendChart', () => {
  it('still draws the chart for an empty period and says why it is flat', () => {
    render(<TrendChart title="PR cycle time" data={[day('2026-09-01', null), day('2026-09-02', null)]} valueKey="cycleTime" kind="line" format={formatHours} emptyLabel="No PRs merged" duration />);
    expect(screen.getByText('No PRs merged in this period')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'PR cycle time: no prs merged in this period.' })).toBeInTheDocument();
  });

  it('offers a table view of the exact backend values, newest first, with gaps shown as —', async () => {
    render(<TrendChart title="PR cycle time" data={[day('2026-09-01', 31.5), day('2026-09-02', null), day('2026-09-03', 4.84)]} valueKey="cycleTime" kind="line" format={formatHours} duration />);
    await userEvent.click(screen.getByRole('radio', { name: 'Table' }));
    const rows = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(rows).toEqual(['Sep 34.8h', 'Sep 2—', 'Sep 11.3d']);
  });
});
