import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { OverviewPage } from './pages/OverviewPage';
import { PullRequestsPage } from './pages/PullRequestsPage';
import { ContributorsPage } from './pages/ContributorsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AIInsightsPage } from './pages/AIInsightsPage';
import { SettingsPage } from './pages/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
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
          <Route path="*" element={<Navigate to="/repositories" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
