import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  Activity,
  BarChart2,
  ChevronDown,
  ExternalLink,
  GitPullRequest,
  LayoutDashboard,
  Lightbulb,
  Menu,
  RefreshCw,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useRepository, useStartSync } from '@/hooks/useRepository';
import { useSession } from '@/hooks/useSession';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { SyncStatusBadge } from '@/components/repositories/SyncStatusBadge';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { formatRelative } from '@/utils/format';
import { cn } from '@/utils/cn';
import { ApiRequestError } from '@/services/api';
import type { Repository } from '@/types';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const NAV_ITEMS = [
  { label: 'Overview', path: 'overview', icon: LayoutDashboard },
  { label: 'Pull Requests', path: 'pull-requests', icon: GitPullRequest },
  { label: 'Contributors', path: 'contributors', icon: Users },
  { label: 'Analytics', path: 'analytics', icon: BarChart2 },
  { label: 'AI Insights', path: 'ai-insights', icon: Lightbulb },
  { label: 'Settings', path: 'settings', icon: Settings },
];

interface ShellContext {
  repository: Repository;
}

/** The current repository, for pages rendered inside the shell. */
export function useShellRepository(): Repository {
  return useOutletContext<ShellContext>().repository;
}

export function AppShell() {
  const { repositoryId } = useParams<{ repositoryId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session } = useSession();
  const { data: repo, error: repoError, refetch } = useRepository(repositoryId);
  const startSync = useStartSync();
  const syncError = startSync.error?.message ?? null;
  const syncInProgress = startSync.isPending || repo?.syncStatus === 'syncing';
  const [navOpen, setNavOpen] = useState(false);

  // Close the mobile drawer whenever the page changes
  useEffect(() => setNavOpen(false), [location.pathname]);

  const sidebar = (
    <>
      <div className="h-11 flex items-center px-4 border-b border-border">
        <Activity className="h-4 w-4 text-primary mr-2" aria-hidden />
        <span className="font-semibold text-sm tracking-tight">RepoPulse</span>
        <button
          type="button"
          onClick={() => setNavOpen(false)}
          className="ml-auto md:hidden text-muted-foreground hover:text-foreground"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={() => navigate('/repositories')}
        className="flex items-center gap-2 px-4 py-2.5 border-b border-border hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">Repository</div>
          <div className="text-sm font-medium truncate">{repo?.name ?? '—'}</div>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden />
      </button>

      <nav className="flex-1 py-2 overflow-y-auto" aria-label="Repository">
        {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            // Keep the selected period (?days=) when switching pages
            to={{ pathname: `/repositories/${repositoryId}/${path}`, search: location.search }}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-4 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-medium border-r-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border px-2.5 py-2 space-y-1.5">
        <GitHubStatus installationCount={session?.installations.length ?? null} />
        {session && <AccountMenu user={session.user} placement="up" />}
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar: fixed on desktop, drawer on small screens */}
      <aside className="hidden md:flex w-52 flex-shrink-0 border-r border-border flex-col">{sidebar}</aside>
      {navOpen && (
        <div className="fixed inset-0 z-30 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/30" onClick={() => setNavOpen(false)} />
          <aside className="relative flex h-full w-64 max-w-[85vw] flex-col border-r border-border bg-background">{sidebar}</aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-11 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 border-b border-border flex-shrink-0">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="md:hidden -ml-1 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
          {repo ? (
            <>
              <span className="text-sm font-medium truncate min-w-0" title={repo.fullName}>
                <span className="text-muted-foreground font-normal hidden sm:inline">{repo.owner}/</span>
                {repo.name}
              </span>
              <span className="text-xs text-muted-foreground font-mono whitespace-nowrap hidden md:inline">
                {repo.defaultBranch}
              </span>
              <div className="flex-1" />
              {syncError && (
                <span role="alert" className="text-xs text-destructive truncate min-w-0 max-w-[18rem] hidden sm:inline" title={syncError}>
                  {syncError}
                </span>
              )}
              <SyncStatusBadge repository={repo} />
              <span className="text-xs text-muted-foreground whitespace-nowrap hidden lg:inline">
                {repo.lastSyncedAt ? `Synced ${formatRelative(repo.lastSyncedAt)}` : 'Never synced'}
              </span>
              <Button size="sm" variant="secondary" loading={syncInProgress} onClick={() => startSync.mutate(repo.id)}>
                {!syncInProgress && <RefreshCw className="h-3 w-3" aria-hidden />}
                <span className="hidden sm:inline">{syncInProgress ? 'Syncing…' : 'Sync'}</span>
              </Button>
              <a
                href={repo.htmlUrl ?? `https://github.com/${repo.fullName}`}
                title="Open on GitHub"
                aria-label="Open on GitHub"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          ) : (
            <>
              <span className="text-sm text-muted-foreground">{repoError ? 'Repository unavailable' : 'Loading repository…'}</span>
              <div className="flex-1" />
            </>
          )}
          <ThemeToggle className="-mr-1" />
        </header>

        <main className="flex-1 overflow-y-auto">
          {repoError ? (
            <ErrorState
              message={
                repoError instanceof ApiRequestError && repoError.status === 404
                  ? 'This repository doesn’t exist or you don’t have access to it.'
                  : repoError.message
              }
              onRetry={() => refetch()}
            />
          ) : repo ? (
            <Outlet context={{ repository: repo } satisfies ShellContext} />
          ) : (
            <LoadingState message="Loading repository…" />
          )}
        </main>
      </div>
    </div>
  );
}

function GitHubStatus({ installationCount }: { installationCount: number | null }) {
  const connected = installationCount !== null && installationCount > 0;
  return (
    <div className="flex items-center gap-1.5 px-1.5">
      <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-green-500' : 'bg-muted-foreground')} aria-hidden />
      <span className="text-xs text-muted-foreground">
        {installationCount === null
          ? 'GitHub status unknown'
          : connected
            ? `GitHub App · ${installationCount} account${installationCount === 1 ? '' : 's'}`
            : 'GitHub App not installed'}
      </span>
    </div>
  );
}
