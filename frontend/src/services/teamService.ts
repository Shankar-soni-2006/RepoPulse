import { api } from './api';
import type { TeamAccount, TeamOverview, TimePeriod } from '@/types';

/** Team view: an account's repositories combined (only those the user can access on GitHub). */
export const teamService = {
  accounts: () => api.get<TeamAccount[]>('/api/team/accounts'),
  overview: (accountId: string, days: TimePeriod) => api.get<TeamOverview>(`/api/team/accounts/${accountId}?days=${days}`),
};
