import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPage } from './AdminPage';
import { adminService } from '@/services/adminService';
import { authService } from '@/services/authService';
import { ApiRequestError } from '@/services/api';
import { renderPage } from '@/test/render';
import type { AdminUser, SessionInfo, UserRole } from '@/types';

vi.mock('@/services/authService', () => ({ authService: { me: vi.fn(), login: vi.fn(), logout: vi.fn() } }));
vi.mock('@/services/adminService', () => ({
  adminService: { overview: vi.fn(), users: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn() },
}));

const me = (role: UserRole): SessionInfo => ({
  user: { id: 'me', login: 'shankar', name: null, avatarUrl: null, role },
  installations: [],
  installUrl: null,
});

const user = (id: string, login: string, o: Partial<AdminUser> = {}): AdminUser => ({
  id, githubId: 1, login, name: null, avatarUrl: null, role: 'member', suspendedAt: null,
  createdAt: '2026-10-01T00:00:00Z', lastActiveAt: null, repositoryCount: 2, activeSessions: 1, ...o,
});

function setup(role: UserRole, users: AdminUser[] = []) {
  vi.mocked(authService.me).mockResolvedValue(me(role));
  vi.mocked(adminService.overview).mockResolvedValue({
    users: users.length, admins: 1, suspended: 0, newUsers7d: 1, activeSessions: 1,
    repositories: 3, syncedRepositories: 2, failedSyncs: 1, webhookFailures24h: 0,
  });
  vi.mocked(adminService.users).mockResolvedValue(users);
  renderPage(<AdminPage />);
}

// The user's row in the table (the login also appears in the account menu, which loads first)
const row = (login: string) =>
  waitFor(() => {
    const tr = screen.queryAllByText(login).map((el) => el.closest('tr')).find(Boolean);
    if (!tr) throw new Error(`no table row for ${login} yet`);
    return tr as HTMLElement;
  });

describe('AdminPage', () => {
  it('tells members they need admin access and loads nothing', async () => {
    setup('member');
    expect(await screen.findByText(/Admin access required/)).toBeInTheDocument();
    expect(adminService.users).not.toHaveBeenCalled();
  });

  it('shows the system overview and the users with roles and status', async () => {
    setup('admin', [user('me', 'shankar', { role: 'admin' }), user('u2', 'bob', { suspendedAt: '2026-10-04T00:00:00Z' })]);
    const overview = await screen.findByRole('region', { name: 'System overview' });
    expect(within(overview).getByText('Failed syncs')).toBeInTheDocument();
    const bob = await row('bob');
    expect(within(bob).getByText('Member')).toBeInTheDocument();
    expect(within(bob).getByText('Suspended')).toBeInTheDocument();
    expect(within(bob).getByRole('button', { name: 'Reinstate' })).toBeInTheDocument();
  });

  it('never offers actions on your own account', async () => {
    setup('admin', [user('me', 'shankar', { role: 'admin' })]);
    const mine = await row('shankar');
    expect(within(mine).getByText('You')).toBeInTheDocument();
    expect(within(mine).queryByRole('button')).not.toBeInTheDocument();
  });

  it('promotes, suspends and deletes (with confirmation) through the API', async () => {
    setup('admin', [user('me', 'shankar', { role: 'admin' }), user('u2', 'bob')]);
    vi.mocked(adminService.updateUser).mockResolvedValue({ updated: true });
    vi.mocked(adminService.deleteUser).mockResolvedValue({ deleted: true });
    const bob = await row('bob');

    await userEvent.click(within(bob).getByRole('button', { name: 'Make admin' }));
    expect(adminService.updateUser).toHaveBeenCalledWith('u2', { role: 'admin' });
    await userEvent.click(within(bob).getByRole('button', { name: 'Suspend' }));
    expect(adminService.updateUser).toHaveBeenCalledWith('u2', { suspended: true });

    await userEvent.click(within(bob).getByRole('button', { name: 'Delete' }));
    expect(adminService.deleteUser).not.toHaveBeenCalled(); // asks first
    await userEvent.click(within(bob).getByRole('button', { name: 'Delete' }));
    expect(adminService.deleteUser).toHaveBeenCalledWith('u2');
  });

  it('keeps admins safe from suspension and deletion until demoted', async () => {
    setup('admin', [user('me', 'shankar', { role: 'admin' }), user('u3', 'carol', { role: 'admin' })]);
    const carol = await row('carol');
    expect(within(carol).getByRole('button', { name: 'Suspend' })).toBeDisabled();
    expect(within(carol).getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(within(carol).getByRole('button', { name: 'Make member' })).toBeEnabled();
  });

  it('shows why an action was refused', async () => {
    setup('admin', [user('me', 'shankar', { role: 'admin' }), user('u3', 'carol', { role: 'admin' })]);
    vi.mocked(adminService.updateUser).mockImplementation(async () => {
      throw new ApiRequestError('LAST_ADMIN', 'RepoPulse needs at least one active admin', 409);
    });
    await userEvent.click(within(await row('carol')).getByRole('button', { name: 'Make member' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('RepoPulse needs at least one active admin');
  });
});
