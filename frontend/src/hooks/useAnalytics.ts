import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/services/analyticsService';
import { contributorService } from '@/services/contributorService';
import { pullRequestService } from '@/services/pullRequestService';
import { repositoryService } from '@/services/repositoryService';
import type { PullRequestListQuery, TimePeriod } from '@/types';

// Every key includes the repository id: when a sync finishes, useRepository
// invalidates all queries containing it, so these refetch automatically.

export function useAnalytics(repositoryId: string, days: TimePeriod) {
  return useQuery({
    queryKey: ['analytics', repositoryId, days],
    queryFn: () => analyticsService.get(repositoryId, days),
    placeholderData: keepPreviousData,
  });
}

export function useContributorActivity(repositoryId: string, days: TimePeriod) {
  return useQuery({
    queryKey: ['contributors', repositoryId, days],
    queryFn: () => contributorService.list(repositoryId, days),
    placeholderData: keepPreviousData,
  });
}

export function usePullRequests(repositoryId: string, query: PullRequestListQuery) {
  return useQuery({
    queryKey: ['pullRequests', repositoryId, query],
    queryFn: () => pullRequestService.list(repositoryId, query),
    placeholderData: keepPreviousData,
  });
}

export function usePullRequest(repositoryId: string, pullRequestId: string | null) {
  return useQuery({
    queryKey: ['pullRequest', repositoryId, pullRequestId],
    queryFn: () => pullRequestService.get(pullRequestId!),
    enabled: !!pullRequestId,
  });
}

export function useWebhookEvents(repositoryId: string) {
  return useQuery({
    queryKey: ['webhookEvents', repositoryId],
    queryFn: () => repositoryService.webhookEvents(repositoryId),
  });
}
