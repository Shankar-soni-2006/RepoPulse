import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import { authService } from '@/services/authService';
import { renderPage } from '@/test/render';
import type { SessionInfo, UserRole } from '@/types';

vi.mock('@/services/authService', () => ({ authService: { me: vi.fn(), login: vi.fn(), logout: vi.fn() } }));

const session = (role: UserRole): SessionInfo => ({
  user: { id: 'u', login: 'octocat', name: null, avatarUrl: null, role },
  installations: [],
  installUrl: null,
});

describe('LoginPage (member and admin forms)', () => {
  it('shows the member form by default and signs in as member', async () => {
    vi.mocked(authService.me).mockResolvedValue(null);
    renderPage(<LoginPage />);
    const form = await screen.findByRole('form', { name: 'Member sign-in' });
    expect(form).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }));
    expect(authService.login).toHaveBeenCalledWith('member');
  });

  it('switches to the admin form, keeps it in the URL and signs in as admin', async () => {
    vi.mocked(authService.me).mockResolvedValue(null);
    renderPage(<LoginPage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Admin' }));
    expect(screen.getByRole('form', { name: 'Admin sign-in' })).toBeInTheDocument();
    expect(screen.getByText(/Only accounts with the admin role can sign in here/)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/page?as=admin');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in as admin with GitHub' }));
    expect(authService.login).toHaveBeenCalledWith('admin');
  });

  it('explains when a non-admin used the admin form', async () => {
    vi.mocked(authService.me).mockResolvedValue(null);
    renderPage(<LoginPage />, { route: '/page?error=not_admin&as=admin' });
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t a RepoPulse admin');
    expect(screen.getByRole('form', { name: 'Admin sign-in' })).toBeInTheDocument();
  });

  it('sends a signed-in admin who opened the admin form to the Admin page', async () => {
    vi.mocked(authService.me).mockResolvedValue(session('admin'));
    renderPage(<LoginPage />, { route: '/page?as=admin' });
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin'));
  });

  it('sends signed-in members to their repositories', async () => {
    vi.mocked(authService.me).mockResolvedValue(session('member'));
    renderPage(<LoginPage />, { route: '/page?as=admin' });
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/repositories'));
  });
});
