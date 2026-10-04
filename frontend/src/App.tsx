import { lazy, Suspense } from 'react';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/layout/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { LoadingState } from './components/ui/States';
import { ApiRequestError } from './services/api';
import { SESSION_QUERY_KEY } from './hooks/useSession';

// Repository pages load on demand, so sign-in and the repository list don't
// download the charting library
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const PullRequestsPage = lazy(() => import('./pages/PullRequestsPage').then((m) => ({ default: m.PullRequestsPage })));
const ContributorsPage = lazy(() => import('./pages/ContributorsPage').then((m) => ({ default: m.ContributorsPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const AIInsightsPage = lazy(() => import('./pages/AIInsightsPage').then((m) => ({ default: m.AIInsightsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const page = (el: React.ReactNode) => <Suspense fallback={<LoadingState />}>{el}</Suspense>;

const isClientError = (err: unknown) =>
  err instanceof ApiRequestError && err.status >= 400 && err.status < 500;

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    // Any 401 means the session ended (expired, revoked, signed out elsewhere):
    // clear it so RequireAuth redirects to /login.
    onError: (err) => {
      if (err instanceof ApiRequestError && err.status === 401) {
        queryClient.setQueryData(SESSION_QUERY_KEY, null);
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry transient failures once; 4xx responses won't change on retry
      retry: (failureCount, err) => !isClientError(err) && failureCount < 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/repositories" element={<RepositoriesPage />} />
            <Route path="/repositories/:repositoryId" element={<AppShell />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={page(<OverviewPage />)} />
              <Route path="pull-requests" element={page(<PullRequestsPage />)} />
              <Route path="contributors" element={page(<ContributorsPage />)} />
              <Route path="analytics" element={page(<AnalyticsPage />)} />
              <Route path="ai-insights" element={page(<AIInsightsPage />)} />
              <Route path="settings" element={page(<SettingsPage />)} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/repositories" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
