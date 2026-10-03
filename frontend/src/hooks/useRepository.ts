import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositoryService } from '@/services/repositoryService';
import type { Repository } from '@/types';

export const REPOSITORIES_QUERY_KEY = ['repositories'] as const;
export const repositoryQueryKey = (id: string) => ['repository', id] as const;

// Syncs run in the background on the server; poll while one is in progress
const SYNC_POLL_MS = 3000;

const isSyncing = (repo: Repository | undefined) => repo?.syncStatus === 'syncing';

/** One repository, polled while it syncs. When a sync finishes, data derived from it is refetched. */
export function useRepository(repositoryId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: repositoryQueryKey(repositoryId ?? ''),
    queryFn: () => repositoryService.get(repositoryId!),
    enabled: !!repositoryId,
    refetchInterval: (q) => (isSyncing(q.state.data) ? SYNC_POLL_MS : false),
  });

  const status = query.data?.syncStatus;
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === 'syncing' && status && status !== 'syncing' && repositoryId) {
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== 'repository' && q.queryKey.includes(repositoryId),
      });
      queryClient.invalidateQueries({ queryKey: REPOSITORIES_QUERY_KEY });
    }
    previous.current = status;
  }, [status, repositoryId, queryClient]);

  return query;
}

/** The user's repositories, polled while any of them is syncing. */
export function useRepositories() {
  return useQuery({
    queryKey: REPOSITORIES_QUERY_KEY,
    queryFn: repositoryService.list,
    refetchInterval: (q) => (q.state.data?.some(isSyncing) ? SYNC_POLL_MS : false),
  });
}

/** Starts a sync and puts the returned 'syncing' repository into the caches. */
export function useStartSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repositoryId: string) => repositoryService.sync(repositoryId),
    onSuccess: (repo) => {
      queryClient.setQueryData(repositoryQueryKey(repo.id), repo);
      queryClient.setQueryData<Repository[]>(REPOSITORIES_QUERY_KEY, (list) =>
        list?.map((r) => (r.id === repo.id ? repo : r)),
      );
    },
    onError: (_err, repositoryId) => {
      // e.g. 409: another sync is running — show the real state
      queryClient.invalidateQueries({ queryKey: repositoryQueryKey(repositoryId) });
      queryClient.invalidateQueries({ queryKey: REPOSITORIES_QUERY_KEY });
    },
  });
}
