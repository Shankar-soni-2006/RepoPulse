import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { repositoryService } from '@/services/repositoryService';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { formatRelative } from '@/utils/format';
import { Activity, GitBranch, Lock, Globe } from 'lucide-react';

export function RepositoriesPage() {
  const navigate = useNavigate();
  const { data: repos, isLoading, error, refetch } = useQuery({
    queryKey: ['repositories'],
    queryFn: repositoryService.list,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border px-6 py-4 flex items-center gap-3">
        <Activity className="h-5 w-5 text-primary" />
        <h1 className="text-base font-semibold">RepoPulse</h1>
        <span className="text-muted-foreground text-sm">/ Repositories</span>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-1">Select a Repository</h2>
          <p className="text-xs text-muted-foreground">
            Choose a repository to view engineering analytics.
          </p>
        </div>

        {isLoading && <LoadingState message="Loading repositories…" />}
        {error && (
          <ErrorState
            message="Failed to load repositories. Make sure GitHub is connected."
            onRetry={() => refetch()}
          />
        )}
        {!isLoading && !error && repos?.length === 0 && (
          <EmptyState message="No repositories found. Connect your GitHub account to get started." />
        )}

        {repos && repos.length > 0 && (
          <div className="border border-border rounded divide-y divide-border">
            {repos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => navigate(`/repositories/${repo.id}/overview`)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium">{repo.fullName}</span>
                    <Badge variant={repo.visibility === 'private' ? 'muted' : 'default'}>
                      {repo.visibility === 'private' ? (
                        <><Lock className="h-2.5 w-2.5 mr-0.5" />private</>
                      ) : (
                        <><Globe className="h-2.5 w-2.5 mr-0.5" />public</>
                      )}
                    </Badge>
                    {repo.language && (
                      <span className="text-xs text-muted-foreground">{repo.language}</span>
                    )}
                  </div>
                  {repo.description && (
                    <p className="text-xs text-muted-foreground truncate">{repo.description}</p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <GitBranch className="h-3 w-3" />
                    {repo.defaultBranch}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {repo.lastSyncedAt ? formatRelative(repo.lastSyncedAt) : 'Never synced'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
