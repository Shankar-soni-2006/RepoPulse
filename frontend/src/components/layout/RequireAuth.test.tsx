import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { authService } from '@/services/authService';
import { ApiRequestError } from '@/services/api';
import { LocationProbe } from '@/test/render';

vi.mock('@/services/authService', () => ({ authService: { me: vi.fn(), login: vi.fn(), logout: vi.fn() } }));

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/repositories']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/repositories" element={<p>private content</p>} />
          </Route>
          <Route path="/login" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}


describe('RequireAuth (unauthorized access)', () => {
  it('redirects signed-out users to /login', async () => {
    vi.mocked(authService.me).mockResolvedValue(null);
    renderGate();
    expect(await screen.findByTestId('location')).toHaveTextContent('/login');
    expect(screen.queryByText('private content')).not.toBeInTheDocument();
  });

  it('renders the page for a signed-in user', async () => {
    vi.mocked(authService.me).mockResolvedValue({
      user: { id: 'u', login: 'octocat', name: null, avatarUrl: null, role: 'member' },
      installations: [],
      installUrl: null,
    });
    renderGate();
    expect(await screen.findByText('private content')).toBeInTheDocument();
  });

  it('shows a retryable error when the API is unreachable, without leaking the page', async () => {
    vi.mocked(authService.me).mockImplementation(async () => {
      throw new ApiRequestError('NETWORK_ERROR', 'Unable to reach the RepoPulse API', 0);
    });
    renderGate();
    expect(await screen.findByText('Unable to reach the RepoPulse API')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
    expect(screen.queryByText('private content')).not.toBeInTheDocument();
  });
});
