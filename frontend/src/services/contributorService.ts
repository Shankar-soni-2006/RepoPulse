import { api } from './api';
import type { ContributorActivityReport, TimePeriod } from '../types';

export const contributorService = {
  /** Activity per contributor in the period, alphabetical (never ranked) */
  list: (repositoryId: string, days: TimePeriod) =>
    api.get<ContributorActivityReport>(`/api/repositories/${repositoryId}/contributors?days=${days}`),
};
