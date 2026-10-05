import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomePage, OWNER } from './HomePage';
import { THEME_STORAGE_KEY, applyTheme } from '@/hooks/useTheme';
import { authService } from '@/services/authService';
import { renderPage } from '@/test/render';

vi.mock('@/services/authService', () => ({ authService: { me: vi.fn(), login: vi.fn(), logout: vi.fn() } }));

const signedInSession = {
  user: { id: 'u', login: 'octocat', name: null, avatarUrl: null },
  installations: [],
  installUrl: null,
};

describe('HomePage', () => {
  it('presents the product features', async () => {
    vi.mocked(authService.me).mockResolvedValue(null);
    renderPage(<HomePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Know how your team ships code.' })).toBeInTheDocument();
    const features = screen.getByRole('region', { name: 'Features' });
    for (const title of ['Delivery metrics', 'Pull request explorer', 'Contributors', 'AI insights you can check', 'Live updates', 'Secure by design']) {
      expect(within(features).getByRole('heading', { name: title })).toBeInTheDocument();
    }
  });

  it('contains the privacy policy and terms of use', () => {
    vi.mocked(authService.me).mockResolvedValue(null);
    renderPage(<HomePage />);
    const privacy = screen.getByRole('region', { name: 'Privacy Policy' });
    expect(within(privacy).getByText(/does not store your source code/)).toBeInTheDocument();
    expect(within(privacy).getByText('rp_session')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Terms of Use' })).toBeInTheDocument();
  });

  it('links to the owner on GitHub and LinkedIn in the footer', () => {
    vi.mocked(authService.me).mockResolvedValue(null);
    renderPage(<HomePage />);
    const footer = screen.getByRole('contentinfo');
    const github = within(footer).getByRole('link', { name: `${OWNER.name} on GitHub` });
    const linkedin = within(footer).getByRole('link', { name: `${OWNER.name} on LinkedIn` });
    expect(github).toHaveAttribute('href', 'https://github.com/Shankar-soni-2006');
    expect(linkedin).toHaveAttribute('href', 'https://www.linkedin.com/in/shankar-soni-82b246337/');
    for (const link of [github, linkedin]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('starts GitHub sign-in for visitors', async () => {
    vi.mocked(authService.me).mockResolvedValue(null);
    renderPage(<HomePage />);
    await userEvent.click(screen.getByRole('button', { name: /Continue with GitHub/ }));
    expect(authService.login).toHaveBeenCalled();
  });

  it('offers the dashboard to signed-in users', async () => {
    vi.mocked(authService.me).mockResolvedValue(signedInSession);
    renderPage(<HomePage />);
    expect(await screen.findByRole('link', { name: 'Open dashboard' })).toHaveAttribute('href', '/repositories');
  });

  describe('dark mode', () => {
    afterEach(() => localStorage.clear());
    const themeRoot = () => document.documentElement;

    it('follows the system setting when the visitor has not chosen', () => {
      vi.mocked(authService.me).mockResolvedValue(null);
      renderPage(<HomePage />);
      expect(themeRoot()).not.toHaveClass('dark'); // test environment reports a light system theme
      expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
    });

    it('switches theme from the header and remembers the choice', async () => {
      vi.mocked(authService.me).mockResolvedValue(null);
      renderPage(<HomePage />);
      await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
      expect(themeRoot()).toHaveClass('dark');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
      await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
      expect(themeRoot()).not.toHaveClass('dark');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    });

    it('restores a saved choice on the next visit', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      applyTheme(); // what main.tsx / index.html do at start-up
      vi.mocked(authService.me).mockResolvedValue(null);
      renderPage(<HomePage />);
      expect(themeRoot()).toHaveClass('dark');
      expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
    });
  });
});
