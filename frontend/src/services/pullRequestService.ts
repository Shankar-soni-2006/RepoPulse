import { api } from './api';
import type { Paginated, PullRequest, PullRequestFilters } from '../types';

export const pullRequestService = {
  list: (repositoryId: string, filters?: PullRequestFilters & { page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    if (filters?.page) params.set('page', String(filters.page));
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return api.get<Paginated<PullRequest>>(
      `/api/repositories/${repositoryId}/pull-requests${qs ? `?${qs}` : ''}`,
    );
  },
  get: (pullRequestId: string) => api.get<PullRequest>(`/api/pull-requests/${pullRequestId}`),
};
