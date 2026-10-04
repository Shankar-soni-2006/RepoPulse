import { api } from './api';
import type { Paginated, PullRequest, PullRequestDetail, PullRequestListQuery } from '../types';

export const pullRequestService = {
  list: (repositoryId: string, query: PullRequestListQuery = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return api.get<Paginated<PullRequest>>(`/api/repositories/${repositoryId}/pull-requests${qs ? `?${qs}` : ''}`);
  },
  /** Includes the PR's reviews */
  get: (pullRequestId: string) => api.get<PullRequestDetail>(`/api/pull-requests/${pullRequestId}`),
};
