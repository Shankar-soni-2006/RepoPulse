import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { TeamPage } from './TeamPage';
import { teamService } from '@/services/teamService';
import { authService } from '@/services/authService';
import { ApiRequestError } from '@/services/api';
import { renderPage } from '@/test/render';
import type { MetricChanges, PeriodMetrics, TeamOverview } from '@/types';

vi.mock('@/services/authService', () => ({ authService: { me: vi.fn(), login: vi.fn(), logout: vi.fn() } }));
vi.mock('@/services/teamService', () => ({ teamService: { accounts: vi.fn(), overview: vi.fn() } }));

const metrics: PeriodMetrics = {
  prThroughput: 3, prsOpened: 4, cycleTime: 10, firstReviewTime: 2, reviewDelay: 2, prSize: 100,
  codeChurn: 70, additions: 55, deletions: 15, commitCount: 2, reviewCount: 1, activeContributors: 3,
  openPrsWithoutReview: 1, oldestUnreviewedWait: 5, commitsMissingStats: 0,
};
const changes = Object.fromEntries(Object.keys(metrics).map((k) => [k, null])) as unknown as MetricChanges;

const overview = (o: Partial<TeamOverview> = {}): TeamOverview => ({
  account: { id: 'acc', login: 'acme', type: 'Organization', repositoryCount: 3, syncedRepositoryCount: 2 },
  period: { days: 30, from: '2026-09-06T00:00:00Z', to: '2026-10-06T00:00:00Z' },
  previousPeriod: { from: '2026-08-07T00:00:00Z', to: '2026-09-06T00:00:00Z' },
  metrics,
  previousMetrics: metrics,
  changes,
  dataQuality: { dataSince: '2026-04-01T00:00:00Z', lastSyncedAt: '2026-10-05T00:00:00Z', commitStatsCoverage: 1, limitations: ['1 of 3 repositories has not been synchronized and is not included.'] },
  repositories: [
    { repositoryId: 'r1', fullName: 'acme/api', lastSyncedAt: '2026-10-05T00:00:00Z', prThroughput: 2, prsOpened: 2, cycleTime: 6, reviewCount: 1, commitCount: 0, codeChurn: 0, activeContributors: 2 },
  ],
  members: [
    { githubId: 1, login: 'alice', avatarUrl: null, repositories: 2, commits: 1, prsOpened: 2, prsMerged: 2, reviews: 0, additions: 50, deletions: 10, lastActiveAt: '2026-10-04T00:00:00Z', weeklyActivity: [1, 2, 0, 1, 0] },
  ],
  trends: [],
  generatedAt: '2026-10-06T00:00:00Z',
  ...o,
} as TeamOverview);

function setup(result: Promise<TeamOverview>) {
  vi.mocked(authService.me).mockResolvedValue({
    user: { id: 'me', login: 'shankar', name: null, avatarUrl: null, role: 'member' },
    installations: [],
    installUrl: null,
  });
  vi.mocked(teamService.overview).mockReturnValue(result);
  renderPage(<TeamPage />);
}

describe('TeamPage', () => {
  it('shows combined members and the per-repository breakdown', async () => {
    setup(Promise.resolve(overview()));
    expect(await screen.findByText('acme · team view')).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 repositories has not been synchronized/)).toBeInTheDocument();
    const alice = screen.getByText('alice').closest('tr')!;
    expect(within(alice).getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'acme/api' })).toHaveAttribute('href', expect.stringContaining('/repositories/r1/overview'));
  });

  it('asks for a sync when no repository of the account has been synced', async () => {
    setup(Promise.resolve(overview({ account: { id: 'acc', login: 'acme', type: 'Organization', repositoryCount: 1, syncedRepositoryCount: 0 } })));
    expect(await screen.findByText(/Sync at least one repository/)).toBeInTheDocument();
    expect(screen.queryByText(/Members \(/)).not.toBeInTheDocument();
  });

  it('does not reveal accounts the user has no access to', async () => {
    setup(Promise.reject(new ApiRequestError('NOT_FOUND', 'Account not found', 404)));
    expect(await screen.findByText(/doesn’t exist or you don’t have access/)).toBeInTheDocument();
  });
});
