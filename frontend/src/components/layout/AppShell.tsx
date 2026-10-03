import { Outlet, NavLink, useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  GitPullRequest,
  Users,
  BarChart2,
  Sparkles,
  Settings,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  Activity,
} from 'lucide-react';
import { repositoryService } from '@/services/repositoryService';
import { Button } from '@/components/ui/Button';
import { formatRelative } from '@/utils/format';
import { cn } from '@/utils/cn';
import { useState } from 'react';

const NAV_ITEMS = [
  { label: 'Overview', path: 'overview', icon: LayoutDashboard },
  { label: 'Pull Requests', path: 'pull-requests', icon: GitPullRequest },
  { label: 'Contributors', path: 'contributors', icon: Users },
  { label: 'Analytics', path: 'analytics', icon: BarChart2 },
  { label: 'AI Insights', path: 'ai-insights', icon: Sparkles },
  { label: 'Settings', path: 'settings', icon: Settings },
];

export function AppShell() {
  const { repositoryId } = useParams<{ repositoryId: string }>();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);

  const { data: repo, refetch } = useQuery({
    queryKey: ['repository', repositoryId],
    queryFn: () => repositoryService.get(repositoryId!),
    enabled: !!repositoryId,
  });

  async function handleSync() {
    if (!repositoryId) return;
    setSyncing(true);
    try {
      await repositoryService.sync(repositoryId);
      await refetch();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 border-r border-border flex flex-col">
        {/* Logo */}
        <div className="h-11 flex items-center px-4 border-b border-border">
          <Activity className="h-4 w-4 text-primary mr-2" />
          <span className="font-semibold text-sm tracking-tight">RepoPulse</span>
        </div>

        {/* Repo selector */}
        <button
          onClick={() => navigate('/repositories')}
          className="flex items-center gap-2 px-4 py-2.5 border-b border-border hover:bg-muted/50 transition-colors text-left"
        >
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Repository</div>
            <div className="text-sm font-medium truncate">{repo?.name ?? '—'}</div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        </button>

        {/* Navigation */}
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={`/repositories/${repositoryId}/${path}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-4 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/8 text-primary font-medium border-r-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom status */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                repo ? 'bg-green-500' : 'bg-muted-foreground',
              )}
            />
            <span className="text-xs text-muted-foreground">
              {repo ? 'Connected' : 'Not connected'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-11 flex items-center gap-3 px-4 border-b border-border flex-shrink-0">
          {repo ? (
            <>
              <span className="text-sm font-medium">{repo.fullName}</span>
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-xs text-muted-foreground font-mono">{repo.defaultBranch}</span>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">
                {repo.lastSyncedAt
                  ? `Synced ${formatRelative(repo.lastSyncedAt)}`
                  : 'Never synced'}
              </span>
              <Button size="sm" variant="secondary" loading={syncing} onClick={handleSync}>
                <RefreshCw className="h-3 w-3" />
                Sync
              </Button>
              <a
                href={`https://github.com/${repo.fullName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Loading repository…</span>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
