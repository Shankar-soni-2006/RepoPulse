import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import type { Repository } from '@/types';

export const testRepository: Repository = {
  id: '00000000-0000-4000-8000-000000000001',
  githubId: 1,
  name: 'api',
  fullName: 'acme/api',
  owner: 'acme',
  description: null,
  visibility: 'private',
  defaultBranch: 'main',
  language: null,
  htmlUrl: 'https://github.com/acme/api',
  isFork: false,
  isArchived: false,
  stargazersCount: 0,
  forksCount: 0,
  openIssuesCount: 0,
  syncStatus: 'synced',
  syncError: null,
  lastSyncedAt: '2026-10-03T00:00:00Z',
  dataSince: '2026-04-06T00:00:00Z',
  createdAt: '2026-04-06T00:00:00Z',
  updatedAt: '2026-10-03T00:00:00Z',
};

/** Shows the current location so tests can assert redirects and URL state. */
export function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

/**
 * Renders a page the way AppShell does: inside the router (at `route`), with React
 * Query (no retries) and the repository provided through the outlet context.
 */
export function renderPage(page: ReactElement, { route = '/page', repository = testRepository } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route element={<Outlet context={{ repository }} />}>
            <Route path="/page" element={<>{page}<LocationProbe /></>} />
          </Route>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
