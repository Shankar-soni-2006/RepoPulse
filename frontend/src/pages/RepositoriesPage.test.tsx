import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepositoriesPage } from './RepositoriesPage';
import { repositoryService } from '@/services/repositoryService';
import { authService } from '@/services/authService';
import { renderPage, testRepository } from '@/test/render';
import type { SessionInfo } from '@/types';

vi.mock('@/services/repositoryService', () => ({
  repositoryService: { list: vi.fn(), get: vi.fn(), sync: vi.fn(), discover: vi.fn(), webhookEvents: vi.fn() },
}));
vi.mock('@/services/authService', () => ({ authService: { me: vi.fn(), login: vi.fn(), logout: vi.fn() } }));

const session = (installations: SessionInfo['installations']): SessionInfo => ({
  user: { id: 'u', login: 'octocat', name: null, avatarUrl: null, role: 'member' },
  installations,
  installUrl: 'https://github.com/apps/repopulse/installations/new',
});

const octocat = {
  id: 'i1',
  accountLogin: 'octocat',
  accountType: 'User' as const,
  manageUrl: 'https://github.com/settings/installations/42',
};

function setup(s: SessionInfo, repos = [testRepository]) {
  vi.mocked(authService.me).mockResolvedValue(s);
  vi.mocked(repositoryService.list).mockResolvedValue(repos);
  vi.mocked(repositoryService.discover).mockResolvedValue({ installations: 1, repositories: repos.length });
  renderPage(<RepositoriesPage />);
}

describe('RepositoriesPage (GitHub App repository access)', () => {
  it('checks GitHub for newly shared repositories when the page opens, without a message', async () => {
    setup(session([octocat]));
    await waitFor(() => expect(repositoryService.discover).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: 'Sync acme/api' })).toBeInTheDocument();
    expect(screen.queryByText(/Found 1 repository/)).not.toBeInTheDocument();
  });

  it('links to the installation settings, where "All repositories" can be chosen', async () => {
    setup(session([octocat]));
    const link = await screen.findByRole('link', { name: /Manage repositories/ });
    expect(link).toHaveAttribute('href', 'https://github.com/settings/installations/42');
    expect(link.getAttribute('title')).toContain('All repositories');
  });

  it('refreshes automatically when the user comes back from GitHub', async () => {
    setup(session([octocat]));
    await waitFor(() => expect(repositoryService.discover).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('link', { name: /Manage repositories/ }));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(repositoryService.discover).toHaveBeenCalledTimes(2));
  });

  it('reports the result of a manual refresh', async () => {
    setup(session([octocat]));
    await waitFor(() => expect(repositoryService.discover).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: /Refresh from GitHub/ }));
    expect(await screen.findByText(/Found 1 repository across 1 account/)).toBeInTheDocument();
  });

  it('tells a user without repositories to choose "All repositories"', async () => {
    setup(session([octocat]), []);
    expect(await screen.findByText(/choose "All repositories"/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Manage repositories/ }).at(-1)).toHaveAttribute(
      'href',
      'https://github.com/settings/installations/42',
    );
  });
});
