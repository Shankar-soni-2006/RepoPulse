import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, ExternalLink, Globe, Lock, Building2, RefreshCw, Search } from 'lucide-react';
import { repositoryService } from '@/services/repositoryService';
import { useSession, SESSION_QUERY_KEY } from '@/hooks/useSession';
import { REPOSITORIES_QUERY_KEY, useRepositories, useStartSync } from '@/hooks/useRepository';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { SyncStatusBadge } from '@/components/repositories/SyncStatusBadge';
import { Badge } from '@/components/ui/Badge';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Table, Thead, Tbody, Th, Td, Tr } from '@/components/ui/Table';
import { formatRelative } from '@/utils/format';
import type { Repository, SessionInfo } from '@/types';

type VisibilityFilter = 'all' | Repository['visibility'];
type StatusFilter = 'all' | Repository['syncStatus'];

const VISIBILITY_ICON = { public: Globe, private: Lock, internal: Building2 } as const;

export function RepositoriesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<VisibilityFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  const reposQuery = useRepositories();
  const startSync = useStartSync();

  // 'auto' runs silently: when the page opens and when the user comes back from GitHub
  const discover = useMutation({
    mutationFn: (_trigger: 'auto' | 'manual') => repositoryService.discover(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REPOSITORIES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
  const { mutate: runDiscovery } = discover;
  const manual = discover.variables === 'manual';

  // Repositories added to the GitHub App appear without a manual refresh
  const leftForGitHub = useRef(false);
  useEffect(() => {
    runDiscovery('auto');
    const onReturn = () => {
      if (leftForGitHub.current && document.visibilityState === 'visible') {
        leftForGitHub.current = false;
        runDiscovery('auto');
      }
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [runDiscovery]);
  const openGitHub = () => {
    leftForGitHub.current = true;
  };

  const repos = reposQuery.data;
  const filtered = useMemo(() => {
    if (!repos) return [];
    const q = search.trim().toLowerCase();
    return repos.filter(
      (r) =>
        (visibility === 'all' || r.visibility === visibility) &&
        (status === 'all' || r.syncStatus === status) &&
        (!q || r.fullName.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)),
    );
  }, [repos, search, visibility, status]);

  return (
    <div className="min-h-screen bg-background">
      <header className="h-11 border-b border-border px-4 sm:px-6 flex items-center gap-3">
        <Activity className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="text-sm font-semibold tracking-tight whitespace-nowrap">RepoPulse</span>
        <span className="text-muted-foreground text-sm whitespace-nowrap hidden sm:inline">/ Repositories</span>
        <div className="flex-1" />
        <ThemeToggle />
        {session && (
          <div className="w-36 sm:w-44 min-w-0">
            <AccountMenu user={session.user} />
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex-1 min-w-[12rem]">
            <h1 className="text-sm font-semibold">Repositories</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {session ? accountSummary(session) : 'Repositories shared with the RepoPulse GitHub App.'}
            </p>
          </div>
          {session && session.installations.length > 0 && (
            <ManageRepositoriesLinks session={session} onOpen={openGitHub} />
          )}
          <Button onClick={() => discover.mutate('manual')} loading={discover.isPending}>
            {!discover.isPending && <RefreshCw className="h-3.5 w-3.5" />}
            Refresh from GitHub
          </Button>
        </div>

        {discover.isError && manual && (
          <p role="alert" className="mb-3 text-xs text-destructive">
            Couldn’t refresh from GitHub: {discover.error.message}
          </p>
        )}
        {startSync.isError && (
          <p role="alert" className="mb-3 text-xs text-destructive">
            Couldn’t start sync: {startSync.error.message}
          </p>
        )}
        {discover.isSuccess && manual && (
          <p className="mb-3 text-xs text-muted-foreground">
            Found {discover.data.repositories} repositor{discover.data.repositories === 1 ? 'y' : 'ies'} across{' '}
            {discover.data.installations} account{discover.data.installations === 1 ? '' : 's'}.
          </p>
        )}

        {reposQuery.isLoading && <LoadingState message="Loading repositories…" />}

        {reposQuery.error && (
          <ErrorState message={reposQuery.error.message} onRetry={() => reposQuery.refetch()} />
        )}

        {repos && repos.length === 0 && <NoRepositories session={session ?? null} onOpen={openGitHub} />}

        {repos && repos.length > 0 && (
          <div className="border border-border rounded-md">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
              <div className="relative flex-1 min-w-[12rem]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter repositories"
                  aria-label="Filter repositories"
                  className="pl-8"
                />
              </div>
              <Select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as VisibilityFilter)}
                aria-label="Visibility"
              >
                <option value="all">All visibility</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="internal">Internal</option>
              </Select>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                aria-label="Sync status"
              >
                <option value="all">Any sync status</option>
                <option value="synced">Synced</option>
                <option value="never">Not synced</option>
                <option value="syncing">Syncing</option>
                <option value="failed">Sync failed</option>
              </Select>
              <span className="text-xs text-muted-foreground tabular-nums ml-auto">
                {filtered.length} of {repos.length}
              </span>
            </div>

            {filtered.length === 0 ? (
              <EmptyState message="No repositories match these filters." />
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th>Repository</Th>
                    <Th>Visibility</Th>
                    <Th>Default branch</Th>
                    <Th>Last synced</Th>
                    <Th>Status</Th>
                    <Th className="text-right">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </Thead>
                <Tbody>
                  {filtered.map((repo) => {
                    const VisIcon = VISIBILITY_ICON[repo.visibility];
                    return (
                      <Tr key={repo.id} onClick={() => navigate(`/repositories/${repo.id}/overview`)}>
                        <Td className="max-w-[22rem]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium truncate">
                              <span className="text-muted-foreground font-normal">{repo.owner}/</span>
                              {repo.name}
                            </span>
                            {repo.isArchived && <Badge variant="warning">Archived</Badge>}
                            {repo.isFork && <Badge variant="muted">Fork</Badge>}
                          </div>
                          {repo.description && (
                            <div className="text-xs text-muted-foreground truncate">{repo.description}</div>
                          )}
                        </Td>
                        <Td className="text-muted-foreground">
                          <span className="inline-flex items-center gap-1 text-xs capitalize">
                            <VisIcon className="h-3 w-3" />
                            {repo.visibility}
                          </span>
                        </Td>
                        <Td className="font-mono text-xs text-muted-foreground">{repo.defaultBranch}</Td>
                        <Td className="text-xs text-muted-foreground">
                          {repo.lastSyncedAt ? formatRelative(repo.lastSyncedAt) : '—'}
                        </Td>
                        <Td>
                          <SyncStatusBadge repository={repo} />
                        </Td>
                        <Td className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={repo.syncStatus === 'syncing'}
                            loading={startSync.isPending && startSync.variables === repo.id}
                            onClick={(e) => {
                              e.stopPropagation(); // don't open the repository
                              startSync.mutate(repo.id);
                            }}
                            aria-label={`Sync ${repo.fullName}`}
                          >
                            <RefreshCw className="h-3 w-3" />
                            Sync
                          </Button>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function accountSummary(session: SessionInfo): string {
  const n = session.installations.length;
  if (n === 0) return 'The RepoPulse GitHub App is not installed on any account you can access.';
  const names = session.installations.map((i) => i.accountLogin).join(', ');
  return `GitHub App installed on ${n} account${n === 1 ? '' : 's'}: ${names}`;
}

function ManageRepositoriesLinks({ session, onOpen }: { session: SessionInfo; onOpen: () => void }) {
  const linkClass =
    'inline-flex items-center gap-1.5 h-8 px-3 rounded border border-border text-sm hover:bg-accent transition-colors';
  return (
    <>
      {session.installations.map((i) => (
        <a
          key={i.id}
          href={i.manageUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpen}
          className={linkClass}
          title={`Choose which ${i.accountLogin} repositories RepoPulse can read. Pick "All repositories" so new ones are included automatically.`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {session.installations.length === 1 ? 'Manage repositories' : `Manage ${i.accountLogin}`}
        </a>
      ))}
      {session.installUrl && (
        <a href={session.installUrl} target="_blank" rel="noopener noreferrer" onClick={onOpen} className={linkClass}>
          <ExternalLink className="h-3.5 w-3.5" />
          Add account
        </a>
      )}
    </>
  );
}

function NoRepositories({ session, onOpen }: { session: SessionInfo | null; onOpen: () => void }) {
  const notInstalled = !session || session.installations.length === 0;
  const manageUrl = session?.installations.length === 1 ? session.installations[0].manageUrl : null;
  const href = notInstalled ? session?.installUrl : (manageUrl ?? session?.installUrl);
  return (
    <div className="border border-border rounded-md px-6 py-10 text-center">
      <h2 className="text-sm font-semibold">
        {notInstalled ? 'Install the GitHub App to get started' : 'No repositories shared with RepoPulse'}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
        {notInstalled
          ? 'RepoPulse reads repositories through its GitHub App. Install it once on your account or organization and choose "All repositories": every current and future repository is then included. This list updates when you come back.'
          : 'The app is installed, but no repositories you can access are shared with it. In the GitHub App settings, choose "All repositories" (or add the ones you want). This list updates when you come back.'}
      </p>
      {href && (
        <a
          href={href}
          onClick={onOpen}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {notInstalled ? 'Install GitHub App' : 'Manage repositories'}
        </a>
      )}
    </div>
  );
}
