import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PullRequestsPage } from './PullRequestsPage';
import { pullRequestService } from '@/services/pullRequestService';
import { renderPage, testRepository } from '@/test/render';
import type { PullRequest } from '@/types';

vi.mock('@/services/pullRequestService', () => ({ pullRequestService: { list: vi.fn(), get: vi.fn() } }));

const pr = (n: number, o: Partial<PullRequest> = {}): PullRequest => ({
  id: `pr-${n}`, githubId: n, repositoryId: testRepository.id, number: n, title: `Change ${n}`, body: null,
  authorId: null, authorLogin: 'octocat', status: 'merged', labels: [], additions: 10, deletions: 2, changedFiles: 1,
  reviewCount: 1, firstReviewAt: '2026-09-01T03:00:00Z', cycleTime: 26, firstReviewTime: 3, prSize: 12,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', mergedAt: '2026-09-02T02:00:00Z', closedAt: null, ...o,
});



describe('PullRequestsPage', () => {
  it('lists backend PRs with their backend-computed durations', async () => {
    vi.mocked(pullRequestService.list).mockResolvedValue({ items: [pr(142, { title: 'Fix authentication' })], total: 1 });
    renderPage(<PullRequestsPage />);
    expect(await screen.findByText('Fix authentication')).toBeInTheDocument();
    expect(screen.getByText('1.1d')).toBeInTheDocument(); // cycle time 26h, formatted, not recomputed
    expect(pullRequestService.list).toHaveBeenCalledWith(testRepository.id, expect.objectContaining({ sort: 'created', order: 'desc', page: 1, limit: 25 }));
  });

  it('sorts through the API and keeps the state in the URL', async () => {
    vi.mocked(pullRequestService.list).mockResolvedValue({ items: [pr(1)], total: 1 });
    renderPage(<PullRequestsPage />);
    await screen.findByText('Change 1');
    await userEvent.click(screen.getByRole('button', { name: /Cycle time/ }));
    await waitFor(() =>
      expect(pullRequestService.list).toHaveBeenLastCalledWith(testRepository.id, expect.objectContaining({ sort: 'cycleTime', order: 'desc' })),
    );
    expect(screen.getByTestId('location')).toHaveTextContent('sort=cycleTime');
  });

  it('distinguishes "nothing synced" from "nothing matches"', async () => {
    vi.mocked(pullRequestService.list).mockResolvedValue({ items: [], total: 0 });
    renderPage(<PullRequestsPage />);
    expect(await screen.findByText('No pull requests have been synced for this repository.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'open');
    expect(await screen.findByText('No pull requests match these filters.')).toBeInTheDocument();
  });

  it('shows an error with retry when the API fails', async () => {
    vi.mocked(pullRequestService.list).mockImplementation(async () => {
      throw new Error('Unexpected response from the API (HTTP 502)');
    });
    renderPage(<PullRequestsPage />);
    expect(await screen.findByText('Unexpected response from the API (HTTP 502)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
  });
});
