import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/layout/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { OverviewPage } from './pages/OverviewPage';
import { PullRequestsPage } from './pages/PullRequestsPage';
import { ContributorsPage } from './pages/ContributorsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AIInsightsPage } from './pages/AIInsightsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ApiRequestError } from './services/api';
import { SESSION_QUERY_KEY } from './hooks/useSession';

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
              <Route path="overview" element={<OverviewPage />} />
              <Route path="pull-requests" element={<PullRequestsPage />} />
              <Route path="contributors" element={<ContributorsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="ai-insights" element={<AIInsightsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/repositories" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
